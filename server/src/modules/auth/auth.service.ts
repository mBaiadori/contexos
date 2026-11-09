import { loadConfig, saveConfig } from '../../config/storage.js';
import { callGitHubAPI } from '../../utils/git.js';
import { vaultService, VAULT_KEYS } from '../vault/vault.service.js';
import { governanceService } from '../governance/governance.service.js';

export class AuthService {
  async authenticateWithToken(token: string) {
    if (!token || typeof token !== 'string') {
      throw new Error('Token do GitHub é obrigatório.');
    }

    const { statusCode, data: user } = await callGitHubAPI('/user', token.trim(), 'GET');
    if (statusCode !== 200 || !user || !user.login) {
      if (statusCode === 401) {
        throw new Error('Token do GitHub inválido ou expirado (401 Unauthorized).');
      }
      if (statusCode === 403) {
        throw new Error(
          'Token do GitHub sem permissão (403 Forbidden). Certifique-se de que o token possui permissões de repo e user.'
        );
      }
      const msg = user?.message ? `: ${user.message}` : '';
      throw new Error(`Falha na autenticação com GitHub (${statusCode})${msg}.`);
    }

    const cfg = loadConfig();
    const orgsMap = new Map<string, any>();
    const accountId = `github:${user.login}`;

    // 1. Preserva organizações já salvas ou vinculadas anteriormente APENAS da mesma conta
    const existingAccount = Array.isArray(cfg.accounts)
      ? cfg.accounts.find((a) => a.id === accountId || a.user?.login?.toLowerCase() === user.login.toLowerCase())
      : null;

    if (existingAccount && Array.isArray(existingAccount.orgs)) {
      for (const o of existingAccount.orgs) {
        if (o?.login) orgsMap.set(o.login.toLowerCase(), o);
      }
    } else if (cfg.user?.login?.toLowerCase() === user.login.toLowerCase() && Array.isArray(cfg.orgs)) {
      for (const o of cfg.orgs) {
        if (o?.login) orgsMap.set(o.login.toLowerCase(), o);
      }
    }

    // 2. Namespace pessoal do usuário
    orgsMap.set(user.login.toLowerCase(), {
      login: user.login,
      avatar_url: user.avatar_url,
      description: 'Conta Pessoal',
      full_name: `${user.name || user.login} (Pessoal)`,
      is_personal: true,
    });

    // 3. Organizações diretas (/user/orgs)
    try {
      const { data: orgs } = await callGitHubAPI('/user/orgs?per_page=100', token, 'GET');
      if (Array.isArray(orgs)) {
        for (const o of orgs) {
          if (o?.login) {
            orgsMap.set(o.login.toLowerCase(), {
              login: o.login,
              avatar_url: o.avatar_url,
              description: o.description || '',
              full_name: o.full_name || o.name || o.login,
            });
          }
        }
      }
    } catch (e) {
      console.warn('[AuthService] Erro ao buscar /user/orgs:', e);
    }

    // 4. Memberships ativas (/user/memberships/orgs)
    try {
      const { data: memData } = await callGitHubAPI('/user/memberships/orgs?state=active&per_page=100', token, 'GET');
      if (Array.isArray(memData)) {
        for (const item of memData) {
          const org = item.organization;
          if (org?.login) {
            orgsMap.set(org.login.toLowerCase(), {
              login: org.login,
              avatar_url: org.avatar_url,
              description: org.description || '',
              full_name: org.name || org.login,
              role: item.role,
            });
          }
        }
      }
    } catch (e) {
      console.warn('[AuthService] Erro ao buscar /user/memberships/orgs:', e);
    }

    // 5. Auto-descobre organizações a partir de repositórios do usuário (/user/repos)
    try {
      const { data: repoData } = await callGitHubAPI(
        '/user/repos?per_page=100&affiliation=owner,collaborator,organization_member&sort=updated',
        token,
        'GET',
      );
      if (Array.isArray(repoData)) {
        for (const r of repoData) {
          if (r.owner && (r.owner.type === 'Organization' || r.owner.login?.toLowerCase() !== user.login.toLowerCase()) && r.owner.login) {
            const oLogin = r.owner.login;
            if (!orgsMap.has(oLogin.toLowerCase())) {
              orgsMap.set(oLogin.toLowerCase(), {
                login: oLogin,
                avatar_url: r.owner.avatar_url || `https://github.com/${encodeURIComponent(oLogin)}.png`,
                description: '',
                full_name: oLogin,
              });
            }
          }
        }
      }
    } catch (repoErr) {
      console.warn('[AuthService] Erro ao auto-descobrir orgs de repos:', repoErr);
    }

    // 6. Auto-descobre organizações a partir de pastas locais em projects/
    try {
      const { PROJECTS_DIR } = await import('../../config/constants.js');
      const fs = await import('node:fs');
      if (fs.existsSync(PROJECTS_DIR)) {
        const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const folderName = entry.name;
            const skip = ['default', '_default', 'local', '.spec-memory', 'node_modules', '.git'];
            if (!skip.includes(folderName) && !folderName.startsWith('.')) {
              if (!orgsMap.has(folderName.toLowerCase())) {
                orgsMap.set(folderName.toLowerCase(), {
                  login: folderName,
                  avatar_url: `https://github.com/${encodeURIComponent(folderName)}.png`,
                  description: 'Workspace / Organização Local',
                  full_name: folderName,
                });
              }
            }
          }
        }
      }
    } catch (diskErr) {
      console.warn('[AuthService] Erro ao escanear diretórios de projetos:', diskErr);
    }

    const orgList = Array.from(orgsMap.values());

    cfg.authenticated = true;
    cfg.token = token;
    cfg.git_provider = 'github';
    delete cfg.git_provider_url;
    cfg.user = {
      login: user.login,
      name: user.name || user.login,
      avatar_url: user.avatar_url,
      html_url: user.html_url,
      email: user.email,
    };
    cfg.orgs = orgList;

    const savedAccount = {
      id: accountId,
      user: {
        login: user.login,
        name: user.name || user.login,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
        email: user.email,
      },
      token: token.trim(),
      git_provider: 'github' as const,
      orgs: orgList.map((o: any) => ({
        login: o.login,
        avatar_url: o.avatar_url,
        description: o.description,
      })),
      last_active: new Date().toISOString(),
    };

    if (!Array.isArray(cfg.accounts)) {
      cfg.accounts = [];
    }

    const existingIdx = cfg.accounts.findIndex((a) => a.id === accountId);
    if (existingIdx >= 0) {
      cfg.accounts[existingIdx] = savedAccount;
    } else {
      cfg.accounts.push(savedAccount);
    }

    saveConfig(cfg);
    governanceService.clearCache();
    return {
      authenticated: true,
      user: cfg.user,
      orgs: cfg.orgs,
      git_provider: cfg.git_provider,
      accounts: this.getAccounts(),
    };
  }

  getAccounts() {
    const cfg = loadConfig();
    const currentId = cfg.user?.login ? `github:${cfg.user.login}` : null;

    const list = Array.isArray(cfg.accounts) ? cfg.accounts : [];
    return list.map((acc) => ({
      id: acc.id,
      user: acc.user,
      git_provider: acc.git_provider,
      orgs: acc.orgs,
      is_active: acc.id === currentId,
      last_active: acc.last_active,
    }));
  }

  async switchAccount(accountId: string) {
    const cfg = loadConfig();
    const list = Array.isArray(cfg.accounts) ? cfg.accounts : [];
    const target = list.find((a) => a.id === accountId);

    if (!target) {
      throw new Error(`Conta não encontrada no sistema: ${accountId}`);
    }

    let targetToken: string | null = target.token || null;
    if (target.git_provider === 'local' || target.id === 'local') {
      targetToken = 'local_mode';
    } else if (!targetToken) {
      targetToken =
        vaultService.getSecret(`account_token_${target.id}`) ||
        (target.user?.login ? vaultService.getSecret(`account_token_github:${target.user.login}`) : null) ||
        (target.user?.login ? vaultService.getSecret(`account_token_${target.user.login}`) : null) ||
        null;

      if (!targetToken && target.user?.login && cfg.user?.login?.toLowerCase() === target.user.login.toLowerCase()) {
        targetToken = vaultService.getSecret(VAULT_KEYS.GITHUB_TOKEN);
      }
    }

    if (!targetToken) {
      throw new Error(`Sessão expirada para a conta @${target.user?.login || accountId}. Por favor, conecte-se novamente com a empresa.`);
    }

    target.token = targetToken;
    cfg.authenticated = true;
    cfg.token = targetToken;
    cfg.git_provider = target.git_provider || 'github';
    delete cfg.git_provider_url;
    cfg.user = target.user;
    cfg.orgs = target.orgs || [];
    target.last_active = new Date().toISOString();

    // Reset active repo so new account views its own repositories
    cfg.active_repo = null;

    saveConfig(cfg);
    governanceService.clearCache();

    return {
      success: true,
      authenticated: true,
      user: cfg.user,
      git_provider: cfg.git_provider,
      accounts: this.getAccounts(),
    };
  }

  removeAccount(accountId: string) {
    const cfg = loadConfig();
    if (!Array.isArray(cfg.accounts)) {
      cfg.accounts = [];
    }

    cfg.accounts = cfg.accounts.filter((a) => a.id !== accountId);

    const currentId = cfg.user?.login ? `github:${cfg.user.login}` : null;

    if (currentId === accountId) {
      if (cfg.accounts.length > 0) {
        const next = cfg.accounts[0];
        cfg.authenticated = true;
        cfg.token = next.token;
        cfg.git_provider = next.git_provider;
        delete cfg.git_provider_url;
        cfg.user = next.user;
        cfg.orgs = next.orgs || [];
        cfg.active_repo = null;
      } else {
        cfg.authenticated = false;
        cfg.token = '';
        cfg.user = null;
        cfg.orgs = [];
        cfg.active_repo = null;
      }
    }

    saveConfig(cfg);
    governanceService.clearCache();
    return {
      success: true,
      accounts: this.getAccounts(),
      user: cfg.user,
      authenticated: cfg.authenticated,
    };
  }

  logout() {
    const cfg = loadConfig();
    cfg.authenticated = false;
    cfg.token = '';
    cfg.user = null;
    cfg.orgs = [];
    cfg.active_repo = null;
    saveConfig(cfg);
    governanceService.clearCache();
    return { success: true };
  }

  /**
   * RFC 8628: Solicita o código do dispositivo (Device Authorization Grant)
   */
  async requestDeviceCode(customClientId?: string) {
    const cfg = loadConfig();
    const clientId = (
      customClientId ||
      process.env.GITHUB_CLIENT_ID ||
      (cfg as any).github_client_id ||
      '178c6fc778ccc68e1d6a'
    ).trim();

    if (!clientId) {
      throw new Error(
        'Identificador da Aplicação (Client ID) do GitHub não configurado. Defina GITHUB_CLIENT_ID no ambiente ou na configuração.'
      );
    }

    try {
      const response = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Context-OS-Spec-Driven',
        },
        body: JSON.stringify({
          client_id: clientId,
          scope: 'repo,read:org,admin:org,user,workflow',
        }),
      });

      const data = (await response.json()) as any;

      if (!response.ok || data.error) {
        const errorMsg =
          data.error_description ||
          data.error ||
          'Falha ao solicitar código de pareamento do dispositivo.';
        throw new Error(errorMsg);
      }

      return {
        success: true,
        device_code: data.device_code,
        user_code: data.user_code,
        verification_uri: data.verification_uri || 'https://github.com/login/device',
        expires_in: data.expires_in || 900,
        interval: data.interval || 5,
        client_id: clientId,
      };
    } catch (err: any) {
      console.error('[AuthService] Erro ao solicitar device code:', err);
      throw new Error(err.message || 'Erro de conexão com o servidor de autenticação.');
    }
  }

  /**
   * RFC 8628: Realiza polling do status de autorização do dispositivo
   */
  async pollDeviceToken(deviceCode: string, customClientId?: string) {
    if (!deviceCode || typeof deviceCode !== 'string') {
      throw new Error('Código do dispositivo (device_code) é obrigatório.');
    }

    const cfg = loadConfig();
    const clientId = (
      customClientId ||
      process.env.GITHUB_CLIENT_ID ||
      (cfg as any).github_client_id ||
      '178c6fc778ccc68e1d6a'
    ).trim();

    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Context-OS-Spec-Driven',
        },
        body: JSON.stringify({
          client_id: clientId,
          device_code: deviceCode.trim(),
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });

      const data = (await response.json()) as any;

      if (data.error) {
        if (data.error === 'authorization_pending') {
          return {
            status: 'pending' as const,
            message: 'Aguardando autorização no navegador...',
          };
        }
        if (data.error === 'slow_down') {
          return {
            status: 'slow_down' as const,
            interval: data.interval || 10,
            message: 'Ajustando intervalo de verificação...',
          };
        }
        if (data.error === 'expired_token') {
          return {
            status: 'expired' as const,
            error: 'O código de conexão expirou. Por favor, solicite um novo código.',
          };
        }
        if (data.error === 'access_denied') {
          return {
            status: 'denied' as const,
            error: 'A autorização foi recusada pelo usuário.',
          };
        }
        return {
          status: 'error' as const,
          error: data.error_description || data.error || 'Erro durante a verificação de acesso.',
        };
      }

      if (data.access_token) {
        // Autentica o usuário com o token recebido (já sincroniza com o cofre nativo de senhas)
        const authResult = await this.authenticateWithToken(data.access_token);
        return {
          status: 'success' as const,
          authenticated: true,
          user: authResult.user,
          orgs: authResult.orgs,
          accounts: authResult.accounts,
          token_type: data.token_type || 'bearer',
        };
      }

      return {
        status: 'pending' as const,
        message: 'Aguardando confirmação...',
      };
    } catch (err: any) {
      console.error('[AuthService] Erro durante o polling do device token:', err);
      throw new Error(err.message || 'Erro ao consultar status da autorização.');
    }
  }

  getStatus() {
    const cfg = loadConfig();
    const activeRepo = cfg.active_repo;
    const repoName = activeRepo?.name || 'local';
    const pendingChanges = cfg.workspace_changes?.[repoName] || [];

    return {
      version: '1.0.5',
      authenticated: Boolean(cfg.authenticated && cfg.token),
      user: cfg.user,
      active_repo: activeRepo,
      git_provider: cfg.git_provider || 'github',
      accounts: this.getAccounts(),
      pending_changes_count: pendingChanges.length,
      ai_settings: {
        provider: cfg.ai_settings?.provider || 'gemini',
        model: cfg.ai_settings?.model || 'gemini-3.5-flash',
        has_key: Boolean(cfg.ai_settings?.api_key || process.env.GEMINI_API_KEY),
        custom_endpoint: cfg.ai_settings?.custom_endpoint || 'http://localhost:11434/v1',
      },
    };
  }
}

export const authService = new AuthService();

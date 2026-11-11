import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { PROJECTS_DIR, resolveRepoDir } from '../../config/constants.js';
import { loadConfig, saveConfig, ensureDefaultRepoFiles } from '../../config/storage.js';
import { executeGit } from '../../utils/git.js';
import { providerManager } from '../ai/providers/ProviderManager.js';

export interface SystemDiagnostics {
  app_version: string;
  os: {
    platform: string;
    release: string;
    arch: string;
    hostname: string;
  };
  node_version: string;
  git_installed: boolean;
  git_version: string;
  active_repo: string | null;
  total_repos: number;
  ai_configured: boolean;
  ai_provider: string;
  ai_model: string;
  providers_status: Array<{
    id: string;
    name: string;
    isAvailable: boolean;
    statusMessage?: string;
  }>;
}

export interface LicenseStatus {
  active: boolean;
  key?: string;
  plan: string;
  licensed_to?: string;
  expires_at?: string;
  offline_grace_remaining_days: number;
  is_offline_valid: boolean;
}

class SystemService {
  /**
   * Retorna diagnóstico de suporte sanitizado (sem expor credenciais)
   */
  async getDiagnostics(): Promise<SystemDiagnostics> {
    const cfg = loadConfig();
    let gitInstalled = false;
    let gitVersion = 'Não localizado';

    try {
      const gitCheck = await executeGit(['--version'], process.cwd());
      if (gitCheck.success) {
        gitInstalled = true;
        gitVersion = gitCheck.stdout.trim();
      }
    } catch {
      gitInstalled = false;
    }

    let reposCount = 0;
    if (fs.existsSync(PROJECTS_DIR)) {
      try {
        const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
          const full = path.join(PROJECTS_DIR, entry.name);
          // Check if this directory is a repo itself
          if (fs.existsSync(path.join(full, '.project.config.json')) || fs.existsSync(path.join(full, '.git'))) {
            reposCount++;
          } else {
            // Or an org directory containing repos
            const subEntries = fs.readdirSync(full, { withFileTypes: true });
            for (const sub of subEntries) {
              if (sub.isDirectory() && !sub.name.startsWith('.')) {
                reposCount++;
              }
            }
          }
        }
      } catch {}
    }

    const providers = await providerManager.listProviders();
    const providersStatus = providers.map((p) => ({
      id: p.id,
      name: p.name,
      isAvailable: p.isAvailable,
      statusMessage: p.statusMessage,
    }));

    const aiConfigured = Boolean(
      cfg.ai_settings?.api_key && cfg.ai_settings.api_key.trim().length > 0
    );

    return {
      app_version: '1.0.0',
      os: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        hostname: os.hostname(),
      },
      node_version: process.version,
      git_installed: gitInstalled,
      git_version: gitVersion,
      active_repo: cfg.active_repo?.name || null,
      total_repos: reposCount,
      ai_configured: aiConfigured,
      ai_provider: cfg.ai_settings?.provider || 'gemini',
      ai_model: cfg.ai_settings?.model || 'gemini-2.5-flash',
      providers_status: providersStatus,
    };
  }

  /**
   * Status de Licenciamento (Local com suporte a Grace Period)
   */
  getLicenseStatus(): LicenseStatus {
    const cfg = loadConfig();
    const license = (cfg.settings as any)?.license || {};
    const key = license.key || '';

    // Se houver uma chave ou se estiver em modo desenvolvimento/avaliação
    const isActive = Boolean(key && key.trim().length > 0) || license.active === true;

    return {
      active: isActive,
      key: key ? `${key.slice(0, 4)}...${key.slice(-4)}` : undefined,
      plan: license.plan || (isActive ? 'Pro License' : 'Trial / Community'),
      licensed_to: license.licensed_to || 'Usuário Contexos',
      expires_at: license.expires_at || undefined,
      offline_grace_remaining_days: 14,
      is_offline_valid: true,
    };
  }

  /**
   * Ativação de Chave de Licença
   */
  async activateLicense(key: string): Promise<{ success: boolean; message: string; license: LicenseStatus }> {
    const cleanKey = (key || '').trim();
    if (!cleanKey) {
      return { success: false, message: 'Chave de licença não informada', license: this.getLicenseStatus() };
    }

    // Validação de formato ou validação de chave
    const cfg = loadConfig();
    if (!cfg.settings) {
      cfg.settings = {} as any;
    }

    (cfg.settings as any).license = {
      active: true,
      key: cleanKey,
      plan: 'Pro License (Ativado)',
      licensed_to: 'Usuário Licenciado',
      activated_at: new Date().toISOString(),
    };

    saveConfig(cfg);

    return {
      success: true,
      message: 'Licença ativada com sucesso!',
      license: this.getLicenseStatus(),
    };
  }

  /**
   * Verifica se o Onboarding Inicial é necessário
   */
  getOnboardingStatus(): { needed: boolean; stepCompleted: { license: boolean; ai: boolean; workspace: boolean } } {
    const cfg = loadConfig();
    const hasLicense = Boolean((cfg.settings as any)?.license?.active);
    const hasAi = Boolean(cfg.ai_settings?.api_key && cfg.ai_settings.api_key.trim().length > 0);
    
    let hasWorkspace = Boolean(cfg.active_repo?.name);
    if (!hasWorkspace && fs.existsSync(PROJECTS_DIR)) {
      try {
        const dirs = fs.readdirSync(PROJECTS_DIR).filter((f) => !f.startsWith('.'));
        hasWorkspace = dirs.length > 0;
      } catch {}
    }

    const onboardingCompletedFlag = Boolean((cfg.settings as any)?.onboarding_completed);

    return {
      needed: !onboardingCompletedFlag && (!hasAi || !hasWorkspace),
      stepCompleted: {
        license: hasLicense,
        ai: hasAi,
        workspace: hasWorkspace,
      },
    };
  }

  /**
   * Conclui o Onboarding e salva as configurações iniciais
   */
  async completeOnboarding(data: {
    license_key?: string;
    ai_provider?: string;
    ai_model?: string;
    ai_api_key?: string;
    create_demo_workspace?: boolean;
    workspace_name?: string;
  }): Promise<{ success: boolean; active_repo: string }> {
    const cfg = loadConfig();
    if (!cfg.settings) cfg.settings = {} as any;
    if (!cfg.ai_settings) cfg.ai_settings = {} as any;

    if (data.license_key) {
      (cfg.settings as any).license = {
        active: true,
        key: data.license_key.trim(),
        plan: 'Pro License',
        licensed_to: 'Usuário Contexos',
        activated_at: new Date().toISOString(),
      };
    }

    if (data.ai_provider) {
      cfg.ai_settings.provider = data.ai_provider;
      cfg.ai_settings.default_provider = data.ai_provider;
    }
    if (data.ai_model) {
      cfg.ai_settings.model = data.ai_model;
    }
    if (data.ai_api_key) {
      cfg.ai_settings.api_key = data.ai_api_key.trim();
    }

    (cfg.settings as any).onboarding_completed = true;

    let targetRepoName = cfg.active_repo?.name || 'contexos-demo';

    if (data.create_demo_workspace || !cfg.active_repo?.name) {
      targetRepoName = data.workspace_name?.trim() || 'contexos-demo';
      await this.createDemoWorkspace(targetRepoName);
      cfg.active_repo = {
        name: targetRepoName,
        owner: 'local_dev',
        is_local: true,
        description: 'Workspace de Demonstração Interativo do Contexos',
      };
    }

    saveConfig(cfg);
    return { success: true, active_repo: targetRepoName };
  }

  /**
   * Cria um Workspace Demo completo e rico com regras, specs e estrutura recomendada
   */
  async createDemoWorkspace(repoName: string = 'contexos-demo'): Promise<{ success: boolean; path: string }> {
    const safeName = repoName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const repoPath = resolveRepoDir(safeName, 'local');

    if (!fs.existsSync(repoPath)) {
      fs.mkdirSync(repoPath, { recursive: true });
    }

    // Inicializa estrutura e arquivos canônicos
    ensureDefaultRepoFiles(safeName, true, 'local');

    // Cria documento introdutório de boas-vindas com instruções
    const welcomeDocPath = path.join(repoPath, 'project', 'WELCOME.md');
    if (!fs.existsSync(welcomeDocPath)) {
      const welcomeContent = `# 🚀 Bem-vindo ao Contexos!

Este é o seu **Workspace de Demonstração Interativo**. O Contexos foi construído para conectar especificações ricas, governança de código e inteligência artificial contextual.

---

## 🎯 Como começar em 3 passos:

1. **Abra o Chat / Copiloto de IA** à direita e experimente pedir:
   > *"Analise a arquitetura deste projeto e liste os requisitos do módulo de autenticação."*
2. **Explore a Wiki e o Dicionário**:
   - As regras de governança e terminologia de negócio são lidas automaticamente pelo agente.
3. **Crie ou Edite Especificações**:
   - Utilize a barra de ferramentas para criar novos documentos estruturados a partir de templates canônicos.

---

## 📂 Estrutura Padrão deste Workspace:
- \`project/\`: Especificações de alto nível, visão geral e roadmap.
- \`domains/\`: Módulos de domínio e regras de negócio.
- \`engenharia/\`: Guias de arquitetura, banco de dados e integrações técnicas.
- \`.spec-memory/\`: Memória permanente do agente e decisões de design.
`;
      try {
        fs.writeFileSync(welcomeDocPath, welcomeContent, 'utf-8');
      } catch {}
    }

    return { success: true, path: repoPath };
  }
}

export const systemService = new SystemService();

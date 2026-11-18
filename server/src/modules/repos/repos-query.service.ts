import fs from "node:fs";
import path from "node:path";
import { PROJECTS_DIR, resolveRepoDir } from "../../config/constants.js";
import { loadConfig, saveConfig } from "../../config/storage.js";
import { callGitProviderAPI } from "../../utils/git.js";

// Cache em memória para evitar consultas repetidas à API do GitHub
const reposCache = new Map<string, { timestamp: number; data: unknown }>();
const REPOS_CACHE_TTL_MS = 60_000;

let orgsCache: { timestamp: number; data: unknown } | null = null;
const ORGS_CACHE_TTL_MS = 5 * 60 * 1000;

export function clearReposCache() {
  reposCache.clear();
  orgsCache = null;
}

export class ReposQueryService {
  async listRepos(targetOrg?: string) {
    const cfg = loadConfig();
    const localRepos: Array<Record<string, unknown>> = [];
    const userLogin = cfg.user?.login?.toLowerCase() || "";

    const rawTarget = (targetOrg || "").trim();
    const normalizedTarget = rawTarget.toLowerCase();
    const isPersonalScope =
      !normalizedTarget ||
      normalizedTarget === "personal" ||
      normalizedTarget === "local" ||
      normalizedTarget === userLogin;

    const cacheKey = `${userLogin}:${isPersonalScope ? "personal" : normalizedTarget}`;
    const cachedEntry = reposCache.get(cacheKey);
    if (cachedEntry && Date.now() - cachedEntry.timestamp < REPOS_CACHE_TTL_MS) {
      return cachedEntry.data;
    }

    const inspectRepoDir = (fullPath: string, repoName: string, parentOwner?: string) => {
      let detectedOwner = parentOwner || cfg.user?.login || "local";
      let detectedFullName = `${detectedOwner}/${repoName}`;
      let isDetectedOrg = Boolean(parentOwner && parentOwner !== "local" && parentOwner.toLowerCase() !== userLogin);

      // 1. Tenta obter owner a partir do active_repo se coincide o nome
      if (cfg.active_repo && cfg.active_repo.name.toLowerCase() === repoName.toLowerCase()) {
        if (cfg.active_repo.owner) detectedOwner = cfg.active_repo.owner;
        if (cfg.active_repo.full_name) detectedFullName = cfg.active_repo.full_name;
        if (typeof cfg.active_repo.is_org === "boolean") isDetectedOrg = cfg.active_repo.is_org;
      }

      // 2. Tenta obter owner a partir do .git/config
      const gitConfigPath = path.join(fullPath, ".git", "config");
      if (fs.existsSync(gitConfigPath)) {
        try {
          const gitCfg = fs.readFileSync(gitConfigPath, "utf-8");
          const match = gitCfg.match(/url\s*=\s*.*github\.com[/:]([^/]+)\/([^/\s.]+)/i);
          if (match && match[1]) {
            detectedOwner = match[1];
            detectedFullName = `${match[1]}/${repoName}`;
          }
        } catch {}
      }

      // 3. Tenta obter owner a partir do .project.config.json
      const projectConfigPath = path.join(fullPath, ".project.config.json");
      if (fs.existsSync(projectConfigPath)) {
        try {
          const pcfg = JSON.parse(fs.readFileSync(projectConfigPath, "utf-8"));
          if (pcfg.project?.repository_url) {
            const match = pcfg.project.repository_url.match(/github\.com[/:]([^/]+)\/([^/\s.]+)/i);
            if (match && match[1]) {
              detectedOwner = match[1];
              detectedFullName = `${match[1]}/${repoName}`;
            }
          }
        } catch {}
      }

      const isOwner = detectedOwner.toLowerCase() === userLogin;
      const isOrg = isDetectedOrg || (!isOwner && detectedOwner !== "local" && detectedOwner !== "");

      // Filtra de acordo com o escopo solicitado (se específico de organização ou pessoal)
      if (!isPersonalScope) {
        if (detectedOwner.toLowerCase() !== normalizedTarget) {
          return;
        }
      } else if (rawTarget === "personal" || rawTarget === "local") {
        if (!isOwner && detectedOwner !== "local") {
          return;
        }
      }

      localRepos.push({
        name: repoName,
        full_name: detectedFullName,
        description: "Repositório de especificações",
        is_local: !fs.existsSync(path.join(fullPath, ".git")),
        is_cloned_locally: true,
        is_private: false,
        default_branch: "main",
        owner: detectedOwner,
        owner_type: isOrg ? "Organization" : "User",
        is_owner: isOwner,
        is_org: isOrg,
        is_fork: false,
        permissions: { admin: true, push: true, pull: true },
      });
    };

    // Escaneia a pasta projects/ com suporte a escopo sob demanda
    if (fs.existsSync(PROJECTS_DIR)) {
      try {
        if (!isPersonalScope) {
          // Escopo específico de Organização: busca direto em projects/{targetOrg} se existir
          const orgDirPath = path.join(PROJECTS_DIR, rawTarget);
          if (fs.existsSync(orgDirPath) && fs.statSync(orgDirPath).isDirectory()) {
            const subItems = fs.readdirSync(orgDirPath, { withFileTypes: true });
            for (const subItem of subItems) {
              if (subItem.isDirectory() && !subItem.name.startsWith(".")) {
                const subFullPath = path.join(orgDirPath, subItem.name);
                inspectRepoDir(subFullPath, subItem.name, rawTarget);
              }
            }
          }
        } else {
          // Escopo Pessoal / Raiz: escaneia diretórios do nível superior
          const items = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
          for (const item of items) {
            if (!item.isDirectory() || item.name.startsWith(".") || item.name === "default" || item.name === "_default") {
              continue;
            }

            const fullPath = path.join(PROJECTS_DIR, item.name);
            const hasDirectRepoMarkers =
              fs.existsSync(path.join(fullPath, ".project.config.json")) ||
              fs.existsSync(path.join(fullPath, ".git")) ||
              fs.existsSync(path.join(fullPath, ".docs.metadata.json")) ||
              fs.existsSync(path.join(fullPath, "project"));

            if (hasDirectRepoMarkers) {
              inspectRepoDir(fullPath, item.name);
            }
          }
        }
      } catch (scanErr) {
        console.error("[ReposService] Erro ao escanear diretório projects:", scanErr);
      }
    }

    if (!cfg.authenticated || !cfg.token) {
      const result = {
        authenticated: false,
        repos: localRepos,
        active_repo: cfg.active_repo,
      };
      reposCache.set(cacheKey, { timestamp: Date.now(), data: result });
      return result;
    }

    // Git Provider repositories (GitHub) sob demanda (sem loops em cascata)
    const remoteReposMap = new Map<string, Record<string, unknown>>();
    let authError: string | null = null;

    try {
      if (!isPersonalScope) {
        // Busca EXCLUSIVAMENTE os repositórios da organização solicitada (1 única requisição)
        const { statusCode: orgStatus, data: orgData } = await callGitProviderAPI(
          `/orgs/${encodeURIComponent(rawTarget)}/repos?per_page=100&sort=updated`,
          cfg.token,
          "GET",
          null,
          { timeoutMs: 8000 }
        );
        if (orgStatus === 401) {
          authError = "Token do GitHub inválido ou expirado (401 Bad credentials). Por favor, desconecte e reconecte sua conta.";
        } else if (orgStatus === 200 && Array.isArray(orgData)) {
          for (const or of orgData) {
            if (or && typeof or === "object" && "name" in or && "owner" in or) {
              const rObj = or as { name?: string; owner?: { login?: string }; full_name?: string; [key: string]: unknown };
              if (rObj.name && rObj.owner?.login) {
                const key = (rObj.full_name || `${rObj.owner.login}/${rObj.name}`).toLowerCase();
                remoteReposMap.set(key, rObj);
              }
            }
          }
        }
      } else {
        // Busca EXCLUSIVAMENTE os repositórios do usuário pessoal (1 única requisição)
        const { statusCode, data } = await callGitProviderAPI(
          "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator",
          cfg.token,
          "GET",
          null,
          { timeoutMs: 8000 }
        );
        if (statusCode === 401) {
          authError = "Token do GitHub inválido ou expirado (401 Bad credentials). Por favor, desconecte e reconecte sua conta.";
        } else if (statusCode === 200 && Array.isArray(data)) {
          for (const r of data) {
            if (r && typeof r === "object" && "name" in r && "owner" in r) {
              const rObj = r as { name?: string; owner?: { login?: string }; full_name?: string; [key: string]: unknown };
              if (rObj.name && rObj.owner?.login) {
                const key = (rObj.full_name || `${rObj.owner.login}/${rObj.name}`).toLowerCase();
                remoteReposMap.set(key, rObj);
              }
            }
          }
        }
      }
    } catch (apiErr: unknown) {
      console.warn(`[ReposService] Erro ao consultar GitHub API para escopo [${rawTarget || "personal"}]:`, apiErr);
      const errMsg = apiErr instanceof Error ? apiErr.message : String(apiErr);
      if (errMsg.includes("401") || errMsg.includes("Bad credentials")) {
        authError = "Token do GitHub inválido ou expirado (401 Bad credentials). Por favor, desconecte e reconecte sua conta.";
      }
    }

    const remoteRepos = Array.from(remoteReposMap.values());

    const formattedRemote: Array<Record<string, unknown>> = remoteRepos.map((r) => {
      const ownerObj = (r.owner as { login?: string; type?: string } | undefined) || {};
      const ownerLogin = ownerObj.login || "";
      const isOwner = ownerLogin.toLowerCase() === userLogin;
      const isOrg =
        ownerObj.type === "Organization" || (!isOwner && ownerLogin !== "");
      const rawPerms = (r.permissions as { admin?: boolean; push?: boolean; pull?: boolean } | undefined) || {};
      const permissions = {
        admin: typeof rawPerms.admin === "boolean" ? rawPerms.admin : isOwner,
        push: typeof rawPerms.push === "boolean" ? rawPerms.push : isOwner,
        pull: typeof rawPerms.pull === "boolean" ? rawPerms.pull : true,
      };

      const scopedDir = resolveRepoDir(String(r.name || ""), ownerLogin);
      const isClonedLocally =
        fs.existsSync(scopedDir) &&
        (fs.existsSync(path.join(scopedDir, ".git")) ||
          fs.existsSync(path.join(scopedDir, ".project.config.json")) ||
          fs.existsSync(path.join(scopedDir, "project")));

      return {
        name: r.name,
        full_name: r.full_name || `${ownerLogin}/${r.name}`,
        html_url: r.html_url,
        description: r.description || "",
        is_private: Boolean(r.private),
        default_branch: r.default_branch || "main",
        is_local: false,
        is_cloned_locally: isClonedLocally,
        owner: ownerLogin,
        owner_type: ownerObj.type || (isOwner ? "User" : "Organization"),
        is_owner: isOwner,
        is_org: isOrg,
        is_fork: Boolean(r.fork),
        permissions,
      };
    });

    // Merge com os repositórios locais existentes sem colisão de nomes
    const remoteKeysMap = new Map<string, Record<string, unknown>>(
      formattedRemote.map((r) => [(String(r.full_name || `${r.owner}/${r.name}`)).toLowerCase(), r]),
    );

    for (const lr of localRepos) {
      const localKey = (String(lr.full_name || `${lr.owner}/${lr.name}`)).toLowerCase();
      const existingRemote = remoteKeysMap.get(localKey);
      if (existingRemote) {
        existingRemote.is_cloned_locally = true;
      } else {
        formattedRemote.push({
          ...lr,
          is_cloned_locally: true,
        });
      }
    }

    // Merge de convites pendentes de repositórios do usuário
    if (cfg.authenticated && cfg.token && cfg.token !== "local_mode") {
      try {
        const { statusCode: invStatus, data: invData } = await callGitProviderAPI(
          "/user/repository_invitations",
          cfg.token,
          "GET",
          null,
          { timeoutMs: 4000 }
        );
        if (invStatus === 200 && Array.isArray(invData)) {
          for (const inv of invData) {
            if (inv?.repository?.name) {
              const invOwner = inv.repository.owner?.login || "";
              const invFullName = inv.repository.full_name || `${invOwner}/${inv.repository.name}`;
              const invKey = invFullName.toLowerCase();

              const matchesScope = isPersonalScope
                ? (invOwner.toLowerCase() === userLogin || !inv.repository.owner?.type || inv.repository.owner?.type === "User")
                : (invOwner.toLowerCase() === normalizedTarget);

              if (matchesScope && !remoteKeysMap.has(invKey)) {
                const invRepo = {
                  name: inv.repository.name,
                  full_name: invFullName,
                  description: inv.repository.description || "Convite de colaboração pendente",
                  html_url: inv.repository.html_url,
                  is_private: Boolean(inv.repository.private),
                  default_branch: "main",
                  is_local: false,
                  is_cloned_locally: false,
                  owner: invOwner,
                  owner_type: inv.repository.owner?.type || (invOwner.toLowerCase() === userLogin ? "User" : "Organization"),
                  is_owner: false,
                  is_org: inv.repository.owner?.type === "Organization" || invOwner.toLowerCase() !== userLogin,
                  is_fork: false,
                  is_pending_invitation: true,
                  invitation_id: inv.id,
                  inviter: inv.inviter?.login || "Administrador",
                  permissions: {
                    admin: inv.permissions === "admin",
                    push: inv.permissions === "admin" || inv.permissions === "write",
                    pull: true,
                  },
                };
                formattedRemote.push(invRepo);
                remoteKeysMap.set(invKey, invRepo);
              }
            }
          }
        }
      } catch (invErr) {
        console.warn("[ReposService] Erro ao buscar convites pendentes para listagem:", invErr);
      }
    }

    // Ordenação fixa de A a Z
    formattedRemote.sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true, sensitivity: "base" }),
    );

    const result = {
      authenticated: !authError,
      auth_error: authError,
      repos: formattedRemote,
      active_repo: cfg.active_repo,
    };

    // Cacheia resultado apenas se não houver erro de autenticação transitório
    if (!authError) {
      reposCache.set(cacheKey, { timestamp: Date.now(), data: result });
    }

    return result;
  }

  async listOrgs() {
    if (orgsCache && Date.now() - orgsCache.timestamp < ORGS_CACHE_TTL_MS) {
      return orgsCache.data;
    }

    const cfg = loadConfig();
    const orgsMap = new Map<string, Record<string, unknown>>();

    // 1. Inclui conta pessoal do usuário como primeira opção de namespace se autenticado
    if (cfg.user?.login) {
      const userLogin = cfg.user.login;
      orgsMap.set(userLogin.toLowerCase(), {
        login: userLogin,
        avatar_url: cfg.user.avatar_url,
        description: 'Conta Pessoal',
        full_name: `${cfg.user.name || userLogin} (Pessoal)`,
        is_personal: true,
      });
    }

    // 2. Inclui orgs salvas anteriormente na configuração
    if (Array.isArray(cfg.orgs)) {
      for (const o of cfg.orgs) {
        if (o?.login) orgsMap.set(o.login.toLowerCase(), o);
      }
    }

    if (!cfg.authenticated || !cfg.token) {
      return { orgs: Array.from(orgsMap.values()) };
    }

    try {
      // 3. Busca lista direta de organizações do usuário (/user/orgs)
      const { statusCode, data } = await callGitProviderAPI(
        "/user/orgs?per_page=100",
        cfg.token,
      );
      if (statusCode === 200 && Array.isArray(data)) {
        for (const o of data) {
          if (o?.login) {
            orgsMap.set(o.login.toLowerCase(), {
              login: o.login,
              avatar_url: o.avatar_url,
              description: o.description || "",
              full_name: o.full_name || o.name || o.login,
            });
          }
        }
      }

      // 4. Busca memberships ativas do usuário (/user/memberships/orgs)
      try {
        const { statusCode: memStatus, data: memData } = await callGitProviderAPI(
          "/user/memberships/orgs?state=active&per_page=100",
          cfg.token,
        );
        if (memStatus === 200 && Array.isArray(memData)) {
          for (const item of memData) {
            const org = item.organization;
            if (org?.login) {
              orgsMap.set(org.login.toLowerCase(), {
                login: org.login,
                avatar_url: org.avatar_url,
                description: org.description || "",
                full_name: org.name || org.login,
                role: item.role,
              });
            }
          }
        }
      } catch (memErr) {
        console.warn("[ReposService] Erro ao buscar memberships de orgs:", memErr);
      }

      // 5. Auto-descobre organizações a partir dos repositórios que o usuário tem acesso (/user/repos)
      try {
        const { statusCode: repoStatus, data: repoData } = await callGitProviderAPI(
          "/user/repos?per_page=100&affiliation=owner,collaborator,organization_member&sort=updated",
          cfg.token,
        );
        if (repoStatus === 200 && Array.isArray(repoData)) {
          for (const r of repoData) {
            if (r.owner && (r.owner.type === "Organization" || r.owner.login?.toLowerCase() !== cfg.user?.login?.toLowerCase()) && r.owner.login) {
              const oLogin = r.owner.login;
              if (!orgsMap.has(oLogin.toLowerCase())) {
                orgsMap.set(oLogin.toLowerCase(), {
                  login: oLogin,
                  avatar_url: r.owner.avatar_url || `https://github.com/${encodeURIComponent(oLogin)}.png`,
                  description: "",
                  full_name: oLogin,
                });
              }
            }
          }
        }
      } catch (repoErr) {
        console.warn("[ReposService] Erro ao auto-descobrir orgs de repos:", repoErr);
      }

      // 6. Auto-descobre organizações a partir de pastas locais em projects/
      try {
        if (fs.existsSync(PROJECTS_DIR)) {
          const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const folderName = entry.name;
              const skip = ['default', '_default', 'local', 'node_modules', '.git'];
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
        console.warn("[ReposService] Erro ao escanear diretórios de projetos locais:", diskErr);
      }

      cfg.orgs = Array.from(orgsMap.values());
      saveConfig(cfg);
    } catch (e) {
      console.warn("[ReposService] Erro ao listar organizações:", e);
    }

    const result = { orgs: Array.from(orgsMap.values()) };
    orgsCache = { timestamp: Date.now(), data: result };
    return result;
  }

  async createOrg(payload: {
    username: string;
    full_name?: string;
    description?: string;
    visibility?: string;
  }) {
    const username = payload.username.trim().toLowerCase().replace(/\s+/g, "-");
    if (!username) {
      throw new Error("Nome da organização (identificador) é obrigatório.");
    }

    const cfg = loadConfig();
    if (!Array.isArray(cfg.orgs)) {
      cfg.orgs = [];
    }

    let orgAvatar = `https://github.com/${encodeURIComponent(username)}.png`;
    let orgFullName = payload.full_name || username;
    let orgDesc = payload.description || "";

    if (cfg.authenticated && cfg.token) {
      // Tenta buscar metadados enriquecidos da organização na API do GitHub
      try {
        const { statusCode: orgStatus, data: orgData } = await callGitProviderAPI(
          `/orgs/${username}`,
          cfg.token,
        );
        if (orgStatus === 200 && orgData) {
          orgAvatar = orgData.avatar_url || orgAvatar;
          orgFullName = orgData.name || orgFullName;
          orgDesc = orgData.description || orgDesc;
        }
      } catch (checkErr) {
        console.warn("[ReposService] Verificação de org /orgs/:name falhou:", checkErr);
      }
    }

    const linkedOrg = {
      login: username,
      full_name: orgFullName,
      description: orgDesc,
      avatar_url: orgAvatar,
    };

    const existingIdx = cfg.orgs.findIndex(
      (o: { login?: string }) => o?.login?.toLowerCase() === username.toLowerCase(),
    );
    if (existingIdx >= 0) {
      cfg.orgs[existingIdx] = linkedOrg;
    } else {
      cfg.orgs.push(linkedOrg);
    }
    saveConfig(cfg);

    return {
      success: true,
      org: linkedOrg,
      message: `Organização '${username}' vinculada com sucesso!`,
    };
  }
}

export const reposQueryService = new ReposQueryService();

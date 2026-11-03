import fs from "node:fs";
import path from "node:path";
import { PROJECTS_DIR, resolveRepoDir } from "../../config/constants.js";
import {
  loadConfig,
  saveConfig,
  ensureDefaultRepoFiles,
} from "../../config/storage.js";
import {
  callGitProviderAPI,
  applyBranchProtection,
  checkBranchProtection,
  ensureGitRepo,
  cloneGitRepo,
  pullGitRepo,
  executeGit,
  isGitRepo,
} from "../../utils/git.js";
import { parseRepoRef, resolveRepoDirPath, RepoRef } from "../../utils/repo-ref.js";
import { assertBranchName } from "../../utils/git-validate.js";
import { workspaceService } from "../workspace/workspace.service.js";
import { docsMetadataService } from "../workspace/docs-metadata.service.js";
import { governanceService } from "../governance/governance.service.js";
import { eventsService } from "../events/events.service.js";

export interface RepoDiagnosisCheckItem {
  exists: boolean;
  valid: boolean;
  path: string;
  label: string;
  details?: string;
}

export interface RepoDiagnosis {
  name: string;
  full_name: string;
  is_local: boolean;
  is_cloned_locally: boolean;
  is_owner: boolean;
  can_admin: boolean;
  checks: {
    project_config: RepoDiagnosisCheckItem;
    docs_metadata: RepoDiagnosisCheckItem;
    hidden_files: RepoDiagnosisCheckItem;
    codeowners: RepoDiagnosisCheckItem;
    dictionary: RepoDiagnosisCheckItem;
    templates: RepoDiagnosisCheckItem;
    spec_memory: RepoDiagnosisCheckItem;
    branch_protection: {
      supported: boolean;
      active: boolean;
      label: string;
      details?: string;
    };
  };
  is_ready: boolean;
  missing_essentials: string[];
}

export interface RepoInitializePayload {
  name: string;
  preset?: "recommended" | "custom" | "minimal";
  project_config?: {
    name?: string;
    description?: string;
    categories?: Array<{
      id: string;
      label: string;
      color?: string;
      description?: string;
    }>;
    tags?: Array<{ id: string; label: string; color?: string }>;
    statuses?: Array<{ id: string; label: string; color?: string }>;
    badges?: Array<{ id: string; label: string; color?: string }>;
    governance_rules?: { min_approvals_default: number };
  };
  security?: {
    enable_branch_protection?: boolean;
    required_approvals?: number;
    create_codeowners?: boolean;
  };
  folders?: string[];
  include_spec_memory?: boolean;
}

// Cache em memória para evitar consultas repetidas à API do GitHub
const reposCache = new Map<string, { timestamp: number; data: any }>();
const REPOS_CACHE_TTL_MS = 60_000;

let orgsCache: { timestamp: number; data: any } | null = null;
const ORGS_CACHE_TTL_MS = 5 * 60 * 1000;

export function clearReposCache() {
  reposCache.clear();
  orgsCache = null;
}

export class ReposService {
  async listRepos(targetOrg?: string) {
    const cfg = loadConfig();
    const localRepos: any[] = [];
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
    const remoteReposMap = new Map<string, any>();
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
            if (or?.name && or?.owner?.login) {
              const key = (or.full_name || `${or.owner.login}/${or.name}`).toLowerCase();
              remoteReposMap.set(key, or);
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
            if (r?.name && r?.owner?.login) {
              const key = (r.full_name || `${r.owner.login}/${r.name}`).toLowerCase();
              remoteReposMap.set(key, r);
            }
          }
        }
      }
    } catch (apiErr: any) {
      console.warn(`[ReposService] Erro ao consultar GitHub API para escopo [${rawTarget || "personal"}]:`, apiErr);
      if (apiErr?.message?.includes("401") || apiErr?.message?.includes("Bad credentials")) {
        authError = "Token do GitHub inválido ou expirado (401 Bad credentials). Por favor, desconecte e reconecte sua conta.";
      }
    }

    const remoteRepos = Array.from(remoteReposMap.values());

    const formattedRemote = remoteRepos.map((r: any) => {
      const ownerLogin = r.owner?.login || "";
      const isOwner = ownerLogin.toLowerCase() === userLogin;
      const isOrg =
        r.owner?.type === "Organization" || (!isOwner && ownerLogin !== "");
      const rawPerms = r.permissions || {};
      const permissions = {
        admin: typeof rawPerms.admin === "boolean" ? rawPerms.admin : isOwner,
        push: typeof rawPerms.push === "boolean" ? rawPerms.push : isOwner,
        pull: typeof rawPerms.pull === "boolean" ? rawPerms.pull : true,
      };

      const scopedDir = resolveRepoDir(r.name, ownerLogin);
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
        owner_type: r.owner?.type || (isOwner ? "User" : "Organization"),
        is_owner: isOwner,
        is_org: isOrg,
        is_fork: Boolean(r.fork),
        permissions,
      };
    });

    // Merge com os repositórios locais existentes sem colisão de nomes
    const remoteKeysMap = new Map(
      formattedRemote.map((r) => [(r.full_name || `${r.owner}/${r.name}`).toLowerCase(), r]),
    );

    for (const lr of localRepos) {
      const localKey = (lr.full_name || `${lr.owner}/${lr.name}`).toLowerCase();
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
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
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

  async diagnoseRepo(repoName: string, ownerOrOrg?: string, checkRemote: boolean = false): Promise<RepoDiagnosis> {
    if (!repoName) {
      throw new Error("Nome do repositório é obrigatório para diagnóstico");
    }

    const cfg = loadConfig();
    const repoDir = resolveRepoDir(repoName, ownerOrOrg || cfg.active_repo?.owner);
    const isClonedLocally =
      fs.existsSync(repoDir) && (fs.existsSync(path.join(repoDir, ".git")) || fs.existsSync(path.join(repoDir, ".project.config.json")));
    const isLocal =
      cfg.active_repo?.name === repoName
        ? Boolean(cfg.active_repo?.is_local)
        : !cfg.token;
    const fullName =
      cfg.active_repo?.name === repoName
        ? cfg.active_repo?.full_name || repoName
        : repoName;
    const isOwner =
      cfg.active_repo?.name === repoName
        ? Boolean(cfg.active_repo?.is_owner)
        : true;
    const canAdmin =
      isLocal || Boolean(cfg.active_repo?.permissions?.admin) || isOwner;

    // 1. Check .project.config.json
    const pConfigPath = path.join(repoDir, ".project.config.json");
    let hasPConfig = fs.existsSync(pConfigPath);
    let validPConfig = false;
    let pConfigDetails = "Não encontrado";
    if (hasPConfig) {
      try {
        const parsed = docsMetadataService.getProjectConfig(repoName);
        if (
          parsed &&
          typeof parsed === "object" &&
          Array.isArray(parsed.categories)
        ) {
          validPConfig = true;
          pConfigDetails = `${parsed.categories.length} categorias, ${parsed.tags?.length || 0} tags configuradas`;
        } else {
          pConfigDetails = "Arquivo corrompido ou formato inválido";
        }
      } catch {
        pConfigDetails = "JSON inválido";
      }
    }

    // 2. Check .docs.metadata.json (Catálogo de governança com auto-geração em cache local)
    const pMetaPath = path.join(repoDir, ".docs.metadata.json");
    let hasPMeta = fs.existsSync(pMetaPath);
    let validPMeta = false;
    let pMetaDetails = "Não encontrado";
    if (hasPMeta) {
      try {
        const metaList = docsMetadataService.loadDocsMetadata(repoName);
        validPMeta = true;
        pMetaDetails = `${metaList.length} documento(s) catalogado(s)`;
      } catch {
        pMetaDetails = "JSON inválido";
      }
    } else if (fs.existsSync(repoDir)) {
      // Auto-reconcilia no background se ainda não existir localmente
      docsMetadataService.scheduleBackgroundReconciliation(repoName);
      hasPMeta = true;
      validPMeta = true;
      pMetaDetails = "Catálogo gerado localmente em segundo plano";
    }

    // 3. Check .hidden_files.json
    const pHiddenPath = path.join(repoDir, ".hidden_files.json");
    const hasHidden = fs.existsSync(pHiddenPath);

    // 4. Check .github/CODEOWNERS
    const pCodeownersPath = path.join(repoDir, ".github", "CODEOWNERS");
    const hasCodeowners = fs.existsSync(pCodeownersPath);

    // 5. Check .dictionary.json
    const pDictPath = path.join(repoDir, ".dictionary.json");
    const hasDict = fs.existsSync(pDictPath);

    // 6. Check .templates.json
    const pTemplatesPath = path.join(repoDir, ".templates.json");
    const hasTemplates = fs.existsSync(pTemplatesPath);

    // 7. Check .spec-memory/
    const pSpecMemoryPath = path.join(repoDir, ".spec-memory");
    const hasSpecMemory =
      fs.existsSync(pSpecMemoryPath) &&
      fs.statSync(pSpecMemoryPath).isDirectory();

    // 8. Check Branch Protection (only if checkRemote is explicitly requested)
    let branchProtectionSupported = !isLocal && Boolean(cfg.token) && canAdmin;
    let branchProtectionActive = false;
    let branchProtectionDetails = isLocal
      ? "Não aplicável (modo local)"
      : "Não verificada";

    if (checkRemote && branchProtectionSupported && cfg.token && fullName.includes("/")) {
      const defaultBranch = cfg.active_repo?.default_branch || "main";
      const protCheck = await checkBranchProtection(
        fullName,
        defaultBranch,
        cfg.token,
      );
      branchProtectionActive = protCheck.isProtected;
      branchProtectionDetails =
        protCheck.details ||
        (branchProtectionActive
          ? "Ativa no provedor"
          : "Sem proteção configurada");
    }

    const missingEssentials: string[] = [];
    if (!hasPConfig || !validPConfig)
      missingEssentials.push(".project.config.json");
    if (!hasPMeta || !validPMeta) missingEssentials.push(".docs.metadata.json");
    if (!hasHidden) missingEssentials.push(".hidden_files.json");

    const isReady = isClonedLocally && missingEssentials.length === 0;

    return {
      name: repoName,
      full_name: fullName,
      is_local: isLocal,
      is_cloned_locally: isClonedLocally,
      is_owner: isOwner,
      can_admin: canAdmin,
      checks: {
        project_config: {
          exists: hasPConfig,
          valid: validPConfig,
          path: ".project.config.json",
          label: "Configurações de Taxonomia (.project.config.json)",
          details: pConfigDetails,
        },
        docs_metadata: {
          exists: hasPMeta,
          valid: validPMeta,
          path: ".docs.metadata.json",
          label: "Catálogo de Governança (.docs.metadata.json)",
          details: pMetaDetails,
        },
        hidden_files: {
          exists: hasHidden,
          valid: hasHidden,
          path: ".hidden_files.json",
          label: "Proteção de Arquivos (.hidden_files.json)",
          details: hasHidden ? "Configurado" : "Pendente",
        },
        codeowners: {
          exists: hasCodeowners,
          valid: hasCodeowners,
          path: ".github/CODEOWNERS",
          label: "Propriedade de Código (.github/CODEOWNERS)",
          details: hasCodeowners ? "Configurado" : "Pendente",
        },
        dictionary: {
          exists: hasDict,
          valid: hasDict,
          path: ".dictionary.json",
          label: "Dicionário Ubíquo (.dictionary.json)",
          details: hasDict ? "Configurado" : "Opcional",
        },
        templates: {
          exists: hasTemplates,
          valid: hasTemplates,
          path: ".templates.json",
          label: "Modelos de Documento (.templates.json)",
          details: hasTemplates ? "Configurado" : "Opcional",
        },
        spec_memory: {
          exists: hasSpecMemory,
          valid: hasSpecMemory,
          path: ".spec-memory/",
          label: "Memória Persistente de IA (.spec-memory/)",
          details: hasSpecMemory ? "Configurada" : "Opcional",
        },
        branch_protection: {
          supported: branchProtectionSupported,
          active: branchProtectionActive,
          label: "Proteção de Branch (main)",
          details: branchProtectionDetails,
        },
      },
      is_ready: isReady,
      missing_essentials: missingEssentials,
    };
  }

  async selectRepo(repo: any) {
    if (!repo || !repo.name) {
      throw new Error("Repositório inválido.");
    }

    const cfg = loadConfig();

    // 1. Determina owner efetivo da organização ou usuário
    let effectiveOwner =
      repo.owner ||
      (repo.full_name?.includes("/") ? repo.full_name.split("/")[0] : undefined);
    if (!effectiveOwner || effectiveOwner === "all" || effectiveOwner === "personal") {
      effectiveOwner = cfg.user?.login || "local";
    }

    // 2. Determina o full_name canônico (ex: enursy/teste ou mBaiadori/meu-repo)
    let fullName = repo.full_name;
    if (!fullName && repo.html_url) {
      fullName = repo.html_url
        .replace(/^https?:\/\/[^\/]+\//, "")
        .replace(/\.git$/, "");
    }
    if (!fullName) {
      fullName = effectiveOwner && effectiveOwner !== "local" ? `${effectiveOwner}/${repo.name}` : repo.name;
    }

    // 3. Determina a URL remota de clone/pull de forma determinística
    let htmlUrl = repo.html_url || "";
    if (!htmlUrl && (fullName.includes("/") || (effectiveOwner && effectiveOwner !== "local")) && cfg.token) {
      const canonicalFull = fullName.includes("/") ? fullName : `${effectiveOwner}/${repo.name}`;
      htmlUrl = `https://github.com/${canonicalFull}.git`;
    }

    const isLocal = repo.is_local !== undefined ? Boolean(repo.is_local) : (!htmlUrl && !cfg.token);

    const repoDir = resolveRepoDir(repo.name, effectiveOwner);
    let isClonedLocally = fs.existsSync(repoDir) && (await isGitRepo(repoDir));

    // Se o repositório ainda não está no disco, mas o usuário tem permissão de leitura/pull, clona automaticamente
    const hasPullPermission =
      !repo.permissions ||
      repo.permissions.pull === undefined ||
      Boolean(repo.permissions.pull || repo.permissions.admin || repo.is_owner);

    if (!isClonedLocally && hasPullPermission && !isLocal && (htmlUrl || fullName.includes("/") || cfg.token)) {
      // Se o repositório possuir convite pendente, auto-aceita no GitHub antes de clonar
      if (repo.is_pending_invitation && repo.invitation_id && cfg.token && cfg.token !== "local_mode") {
        try {
          await callGitProviderAPI(
            `/user/repository_invitations/${encodeURIComponent(String(repo.invitation_id))}`,
            cfg.token,
            "PATCH"
          );
        } catch (autoAcceptErr) {
          console.warn(`[selectRepo] Falha ao auto-aceitar convite para ${fullName}:`, autoAcceptErr);
        }
      }

      const cloneTargetUrl = htmlUrl || `https://github.com/${fullName}.git`;
      try {
        eventsService.broadcast("repo_progress", {
          repo: repo.name,
          owner: effectiveOwner,
          stage: "Sincronizando repositório...",
          percent: 30,
        });

        const cloneResult = await cloneGitRepo(
          repoDir,
          cloneTargetUrl,
          cfg.token,
          cfg.user,
          (p) => {
            eventsService.broadcast("repo_progress", {
              repo: repo.name,
              owner: effectiveOwner,
              ...p,
            });
          },
        );

        if (cloneResult.success) {
          isClonedLocally = true;
          reposCache.clear();
          eventsService.broadcast("repo_progress", {
            repo: repo.name,
            owner: effectiveOwner,
            stage: "Concluído",
            percent: 100,
          });
        }
      } catch (cloneErr) {
        console.warn(`[selectRepo] Não foi possível clonar ${fullName}:`, cloneErr);
        eventsService.broadcast("repo_progress", {
          repo: repo.name,
          owner: effectiveOwner,
          stage: "Falha na sincronização",
          percent: 0,
        });
      }
    }

    cfg.active_repo = {
      name: repo.name,
      full_name: fullName,
      html_url: htmlUrl,
      description: repo.description || "",
      is_private: Boolean(repo.is_private),
      default_branch: repo.default_branch || "main",
      is_local: isLocal,
      is_cloned_locally: isClonedLocally,
      owner: effectiveOwner,
      permissions: repo.permissions || { admin: true, push: true, pull: true },
    };

    saveConfig(cfg);

    if (!isClonedLocally) {
      return {
        success: true,
        is_ready: false,
        active_repo: cfg.active_repo,
        message: "Repositório não clonado localmente.",
      };
    }

    // Realiza o diagnóstico de compatibilidade do repositório clonado no disco
    const diagnosis = await this.diagnoseRepo(repo.name, effectiveOwner);

    return {
      success: true,
      is_ready: diagnosis.is_ready,
      active_repo: cfg.active_repo,
      diagnosis,
    };
  }

  async cloneLocalRepo(payload: { name: string; owner?: string }) {
    const cfg = loadConfig();
    const ref = parseRepoRef(payload.name, payload.owner || cfg.active_repo?.owner || cfg.user?.login);
    if (!ref) {
      throw new Error("Identificador de repositório inválido para clone.");
    }
    const repoDir = resolveRepoDirPath(ref);
    const remoteUrl = `https://github.com/${ref.owner}/${ref.repo}.git`;
    const res = await cloneGitRepo(
      repoDir,
      remoteUrl,
      cfg.token,
      cfg.user,
      (p) => {
        eventsService.broadcast("repo_progress", {
          repo: ref.repo,
          owner: ref.owner,
          ...p,
        });
      },
    );
    if (!res.success) {
      throw new Error(res.message);
    }
    workspaceService.invalidateTreeCache(ref.repo);
    reposCache.clear();
    eventsService.broadcast("repo_progress", {
      repo: ref.repo,
      owner: ref.owner,
      stage: "Concluído",
      percent: 100,
    });

    if (cfg.active_repo && cfg.active_repo.name.toLowerCase() === ref.repo.toLowerCase()) {
      cfg.active_repo.is_cloned_locally = true;
      saveConfig(cfg);
    }

    return {
      success: true,
      message: `Repositório ${ref.owner}/${ref.repo} clonado com sucesso para ${repoDir}`,
      repo_dir: repoDir,
      owner: ref.owner,
      name: ref.repo,
      full_name: `${ref.owner}/${ref.repo}`,
      is_cloned_locally: true,
    };
  }

  async createRepo(payload: {
    name: string;
    owner?: string;
    description?: string;
    is_private?: boolean;
    enable_protection?: boolean;
    required_approvals?: number;
    auto_initialize?: boolean;
    initialTeams?: Array<{ slug: string; permission?: string }>;
    initialCollaborators?: Array<{ username: string; permission?: string }>;
  }) {
    const repoName = payload.name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!repoName) {
      throw new Error("Nome do repositório é obrigatório");
    }

    const cfg = loadConfig();
    const owner = payload.owner?.trim() || cfg.user?.login;
    const userLogin = (cfg.user?.login || "").toLowerCase();
    const isPersonal =
      !owner ||
      owner.toLowerCase() === userLogin ||
      owner.toLowerCase() === "personal" ||
      owner.toLowerCase() === "all" ||
      owner.toLowerCase() === "local";
    const targetOwner = isPersonal ? (cfg.user?.login || owner || "local") : owner;
    const repoDir = resolveRepoDir(repoName, targetOwner);

    if (!cfg.authenticated || !cfg.token) {
      // Criação Local
      if (!fs.existsSync(repoDir)) {
        fs.mkdirSync(repoDir, { recursive: true });
      }
      await ensureGitRepo(repoDir, cfg.user);
      cfg.active_repo = {
        name: repoName,
        full_name: `${targetOwner}/${repoName}`,
        description: payload.description || "Repositório Local",
        is_private: false,
        default_branch: "main",
        is_local: true,
        is_cloned_locally: true,
        is_owner: true,
        permissions: { admin: true, push: true, pull: true },
      };
      saveConfig(cfg);

      if (payload.auto_initialize) {
        return await this.initializeRepo({
          name: repoName,
          preset: "recommended",
          project_config: {
            name: repoName,
            description:
              payload.description ||
              "Repositório de especificações e governança",
          },
        });
      }

      const diagnosis = await this.diagnoseRepo(repoName, targetOwner);
      return {
        success: true,
        message: `Repositório local '${repoName}' criado!`,
        repo: cfg.active_repo,
        is_ready: diagnosis.is_ready,
        diagnosis,
      };
    }

    const endpoint = isPersonal ? "/user/repos" : `/orgs/${targetOwner}/repos`;

    const { statusCode, data: respData } = await callGitProviderAPI(
      endpoint,
      cfg.token,
      "POST",
      {
        name: repoName,
        description: payload.description || "Repositório de Governança",
        private: payload.is_private ?? true,
        visibility: (payload.is_private ?? true) ? "private" : "public",
        auto_init: false, // Repositório mantido em branco
      },
    );

    if (statusCode !== 200 && statusCode !== 201) {
      let errDetail = respData?.message || "Falha na requisição";
      if (Array.isArray(respData?.errors) && respData.errors.length > 0) {
        const extra = respData.errors
          .map((e: any) => e.message || e.code || JSON.stringify(e))
          .join(", ");
        errDetail += ` (${extra})`;
      }
      throw new Error(`Erro ao criar repositório no GitHub: ${errDetail}`);
    }

    const ownerLogin = respData.owner?.login || targetOwner;
    const repoFullName = respData.full_name || `${ownerLogin}/${repoName}`;
    const defaultBranch = respData.default_branch || "main";
    const remoteUrl = respData.html_url || `https://github.com/${repoFullName}`;

    // Registra a organização na lista de orgs se não existir
    if (ownerLogin && ownerLogin.toLowerCase() !== userLogin) {
      if (!cfg.orgs) cfg.orgs = [];
      if (!cfg.orgs.some((o: any) => o.login?.toLowerCase() === ownerLogin.toLowerCase())) {
        cfg.orgs.push({
          login: ownerLogin,
          name: respData.owner?.name || ownerLogin,
          avatar_url: respData.owner?.avatar_url,
          description: respData.owner?.description,
        });
      }
    }

    // Clona ou inicializa o repositório em branco para a máquina
    await ensureGitRepo(repoDir, cfg.user, remoteUrl, cfg.token, repoName);

    cfg.active_repo = {
      name: repoName,
      full_name: repoFullName,
      html_url: remoteUrl,
      description: payload.description || "",
      is_private: payload.is_private ?? true,
      default_branch: defaultBranch,
      is_owner:
        ownerLogin.toLowerCase() === userLogin,
      permissions: { admin: true, push: true, pull: true },
    };
    saveConfig(cfg);

    // Se foram fornecidos times iniciais, associa na Organização do GitHub
    if (Array.isArray(payload.initialTeams) && payload.initialTeams.length > 0 && !isPersonal) {
      for (const t of payload.initialTeams) {
        if (t.slug) {
          try {
            await governanceService.addTeamToRepo({
              org: targetOwner,
              teamSlug: t.slug,
              owner: targetOwner,
              repo: repoName,
              permission: t.permission || "push",
            });
          } catch (tErr) {
            console.warn(`[ReposService] Falha ao associar time inicial ${t.slug} ao repo ${repoName}:`, tErr);
          }
        }
      }
    }

    // Se foram fornecidos colaboradores iniciais, convida no GitHub
    if (Array.isArray(payload.initialCollaborators) && payload.initialCollaborators.length > 0) {
      for (const c of payload.initialCollaborators) {
        if (c.username) {
          try {
            await governanceService.inviteCollaborator({
              username: c.username,
              permission: (c.permission as any) || "push",
              repo: repoName,
            });
          } catch (cErr) {
            console.warn(`[ReposService] Falha ao convidar colaborador inicial ${c.username} para o repo ${repoName}:`, cErr);
          }
        }
      }
    }

    if (payload.auto_initialize) {
      return await this.initializeRepo({
        name: repoName,
        preset: "recommended",
        project_config: {
          name: repoName,
          description:
            payload.description || "Repositório de especificações e governança",
        },
        security: {
          enable_branch_protection: payload.enable_protection ?? true,
          required_approvals: payload.required_approvals ?? 1,
          create_codeowners: true,
        },
      });
    }

    clearReposCache();
    const diagnosis = await this.diagnoseRepo(repoName, targetOwner);
    return {
      success: true,
      message: `Repositório ${repoFullName} criado com sucesso!`,
      repo: cfg.active_repo,
      is_ready: diagnosis.is_ready,
      diagnosis,
    };
  }

  async initializeRepo(payload: RepoInitializePayload) {
    const {
      name,
      preset = "recommended",
      project_config,
      security,
      folders,
      include_spec_memory,
    } = payload;
    if (!name) {
      throw new Error("Nome do repositório é obrigatório para inicialização");
    }

    const cfg = loadConfig();
    const repoDir = resolveRepoDir(name, cfg.active_repo?.owner);

    if (!fs.existsSync(repoDir)) {
      fs.mkdirSync(repoDir, { recursive: true });
    }

    // 1. .hidden_files.json
    const defaultHiddenFiles = [
      ".git",
      ".gitignore",
      ".DS_Store",
      "node_modules",
      ".project.config.json",
      ".docs.metadata.json",
      ".dictionary.json",
      ".templates.json",
      ".templates.metadata.json",
      ".spec-memory",
      ".skills",
      ".agents",
      ".tools",
      ".mcp.json",
      ".hidden_files.json",
    ];
    fs.writeFileSync(
      path.join(repoDir, ".hidden_files.json"),
      JSON.stringify(defaultHiddenFiles, null, 2),
      "utf-8",
    );

    // 2. .project.config.json (com taxonomias e cores dinâmicas)
    const defaultCategories = [
      {
        id: "visao-geral",
        label: "Visão Geral",
        color: "#1a73e8",
        description: "Arquitetura e visão geral",
      },
      {
        id: "especificacoes",
        label: "Especificações",
        color: "#10b981",
        description: "Regras de negócio e PRDs",
      },
      {
        id: "engenharia",
        label: "Engenharia",
        color: "#8b5cf6",
        description: "Guias técnicos e padrões de código",
      },
    ];

    const defaultTags = [
      { id: "core", label: "Core", color: "#1a73e8" },
      { id: "api", label: "API", color: "#06b6d4" },
      { id: "security", label: "Segurança", color: "#ef4444" },
      { id: "frontend", label: "Frontend", color: "#f59e0b" },
      { id: "database", label: "Banco de Dados", color: "#10b981" },
    ];

    const defaultStatuses = [
      { id: "draft", label: "Rascunho", color: "#94a3b8" },
      { id: "in_review", label: "Em Revisão", color: "#f59e0b" },
      { id: "approved", label: "Aprovado", color: "#10b981" },
      { id: "deprecated", label: "Depreciado", color: "#ef4444" },
    ];

    const defaultBadges = [
      { id: "ssot", label: "SSOT", color: "#1a73e8" },
      { id: "rfc", label: "RFC", color: "#8b5cf6" },
      { id: "sdd", label: "SDD", color: "#10b981" },
      { id: "prd", label: "PRD", color: "#06b6d4" },
    ];

    const targetProjectConfig = {
      project: {
        name: project_config?.name || name,
        description:
          project_config?.description ||
          "Repositório de documentação e especificações.",
        version: "1.0.0",
        architecture_pattern: "Documentação Viva & Git SSOT",
        repository_url: cfg.active_repo?.html_url || "",
        lead: cfg.user?.login ? `@${cfg.user.login}` : "@equipe",
      },
      categories: project_config?.categories || defaultCategories,
      tags: project_config?.tags || defaultTags,
      statuses: project_config?.statuses || defaultStatuses,
      badges: project_config?.badges || defaultBadges,
      governance_rules: project_config?.governance_rules || {
        min_approvals_default: 1,
      },
      reviewers: cfg.user?.login ? [`@${cfg.user.login}`] : [],
      ai_assistant_prompt:
        "Você é o assistente inteligente de documentação e engenharia do Context OS.",
    };

    fs.writeFileSync(
      path.join(repoDir, ".project.config.json"),
      JSON.stringify(targetProjectConfig, null, 2),
      "utf-8",
    );

    // 3. .docs.metadata.json
    const docsMetaPath = path.join(repoDir, ".docs.metadata.json");
    if (!fs.existsSync(docsMetaPath)) {
      fs.writeFileSync(docsMetaPath, JSON.stringify([], null, 2), "utf-8");
    }

    // 4. .dictionary.json & .templates.json
    const dictPath = path.join(repoDir, ".dictionary.json");
    if (!fs.existsSync(dictPath)) {
      fs.writeFileSync(
        dictPath,
        JSON.stringify({ version: "1.0.0", terms: [], domains: [] }, null, 2),
        "utf-8",
      );
    }

    const templatesPath = path.join(repoDir, ".templates.json");
    if (!fs.existsSync(templatesPath)) {
      fs.writeFileSync(templatesPath, JSON.stringify([], null, 2), "utf-8");
    }

    // 5. CODEOWNERS
    const shouldCreateCodeowners = security?.create_codeowners ?? true;
    if (shouldCreateCodeowners) {
      const githubDir = path.join(repoDir, ".github");
      if (!fs.existsSync(githubDir)) {
        fs.mkdirSync(githubDir, { recursive: true });
      }
      const ownerLogin =
        cfg.active_repo?.full_name?.split("/")[0] || cfg.user?.login || "admin";
      const codeownersContent = `# Context OS - Governança & Root of Trust
# Arquivos críticos de controle de acesso exigem aprovação do proprietário
.project.config.json @${ownerLogin}
.gitignore @${ownerLogin}
.github/ @${ownerLogin}
`;
      fs.writeFileSync(
        path.join(githubDir, "CODEOWNERS"),
        codeownersContent,
        "utf-8",
      );
    }

    // 6. Pastas de Trabalho Opcionais (apenas se especificadas)
    const targetFolders = folders || [];
    for (const folder of targetFolders) {
      const folderPath = path.join(repoDir, folder);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        const keepPath = path.join(folderPath, ".gitkeep");
        if (!fs.existsSync(keepPath)) {
          fs.writeFileSync(keepPath, "", "utf-8");
        }
      }
    }

    // 7. .spec-memory
    const shouldIncludeSpecMemory =
      include_spec_memory ?? preset === "recommended";
    if (shouldIncludeSpecMemory) {
      const specMemoryDir = path.join(repoDir, ".spec-memory");
      if (!fs.existsSync(specMemoryDir)) {
        fs.mkdirSync(specMemoryDir, { recursive: true });
        fs.writeFileSync(path.join(specMemoryDir, ".gitkeep"), "", "utf-8");
      }
    }

    // 8. Branch Protection no GitHub
    let protectionMessage = "Não aplicável";
    const shouldEnableProtection =
      security?.enable_branch_protection ?? preset === "recommended";
    if (
      shouldEnableProtection &&
      cfg.authenticated &&
      cfg.token &&
      cfg.active_repo?.full_name?.includes("/")
    ) {
      const defaultBranch = cfg.active_repo?.default_branch || "main";
      const pRes = await applyBranchProtection(
        cfg.active_repo.full_name,
        defaultBranch,
        cfg.token,
        security?.required_approvals || 1,
      );
      protectionMessage =
        pRes.statusCode === 200 || pRes.statusCode === 201
          ? "Ativada com sucesso"
          : `Pendente (${pRes.data?.message || "Aviso"})`;
    }

    // 9. Git Add, Commit e Push
    const isGit = await isGitRepo(repoDir);
    if (isGit) {
      try {
        await executeGit(["add", "-A"], repoDir);
        await executeGit(
          ["commit", "-m", "chore(context-os): inicializar governanca do framework"],
          repoDir,
        );

        if (cfg.token && cfg.active_repo?.html_url) {
          const defaultBranch = assertBranchName(cfg.active_repo?.default_branch || "main");
          await executeGit(["push", "origin", defaultBranch], repoDir);
        }
      } catch (gitErr: any) {
        console.warn(
          `[ReposService] Aviso no commit inicial em ${name}:`,
          gitErr.message,
        );
      }
    }

    // 10. Atualiza active_repo e invalida árvore
    if (!cfg.active_repo || cfg.active_repo.name !== name) {
      cfg.active_repo = {
        name,
        full_name: cfg.active_repo?.full_name || name,
        description: targetProjectConfig.project.description,
        is_private: cfg.active_repo?.is_private ?? false,
        default_branch: cfg.active_repo?.default_branch || "main",
        is_local: !cfg.token,
        permissions: { admin: true, push: true, pull: true },
      };
    }
    saveConfig(cfg);
    workspaceService.invalidateTreeCache(name);

    const diagnosis = await this.diagnoseRepo(name, cfg.active_repo?.owner);

    return {
      success: true,
      message: `Repositório '${name}' inicializado com sucesso!`,
      active_repo: cfg.active_repo,
      protection: protectionMessage,
      diagnosis,
    };
  }

  async deleteRepo(payload: {
    name: string;
    owner?: string;
    delete_remote?: boolean;
    delete_local?: boolean;
  }) {
    const { name, owner, delete_remote, delete_local = true } = payload;
    if (!name) {
      throw new Error("Nome do repositório é obrigatório para exclusão");
    }

    const cfg = loadConfig();
    let remoteDeleted = false;

    // Delete remote if requested and authenticated (never for default/local repos)
    if (
      delete_remote &&
      cfg.authenticated &&
      cfg.token &&
      name !== "default" &&
      name !== "_default" &&
      name !== "local"
    ) {
      const repoOwner = owner || cfg.user?.login;
      if (!repoOwner) {
        throw new Error(
          "Proprietário do repositório não encontrado para exclusão remota",
        );
      }
      const endpoint = `/repos/${repoOwner}/${name}`;
      const { statusCode, data } = await callGitProviderAPI(
        endpoint,
        cfg.token,
        "DELETE",
      );
      if (statusCode === 204 || statusCode === 200) {
        remoteDeleted = true;
      } else {
        throw new Error(
          data?.message ||
            `Falha ao excluir no provedor remoto (Status ${statusCode})`,
        );
      }
    }

    // Delete local directory if requested
    if (delete_local) {
      const localDir = resolveRepoDir(name, owner || cfg.active_repo?.owner);
      if (fs.existsSync(localDir)) {
        try {
          fs.rmSync(localDir, { recursive: true, force: true });
        } catch (err: any) {
          console.error(
            `[ReposService] Erro ao remover pasta local ${localDir}:`,
            err,
          );
        }
      }
      workspaceService.invalidateTreeCache(name);
    }

    // Reset active_repo if deleted
    if (cfg.active_repo?.name && cfg.active_repo.name.toLowerCase() === name.toLowerCase()) {
      cfg.active_repo = null;
      saveConfig(cfg);
    }

    clearReposCache();
    return {
      success: true,
      remoteDeleted,
      message: `Repositório '${name}' excluído com sucesso.`,
    };
  }

  async updateRepo(payload: {
    current_name: string;
    new_name?: string;
    description?: string;
    is_private?: boolean;
    owner?: string;
  }) {
    const { current_name, new_name, description, is_private, owner } = payload;
    if (!current_name) {
      throw new Error("Nome atual do repositório é obrigatório.");
    }

    const cfg = loadConfig();
    const repoOwner =
      owner || cfg.active_repo?.owner || cfg.user?.login || "local";
    const isLocal =
      !cfg.authenticated || !cfg.token || cfg.active_repo?.is_local;
    const targetName = (new_name || current_name)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");

    if (!targetName) {
      throw new Error("O novo nome do repositório não pode ser vazio.");
    }

    let remoteUpdated = false;
    let updatedRemoteUrl = cfg.active_repo?.html_url || "";
    let updatedFullName =
      cfg.active_repo?.full_name || `${repoOwner}/${targetName}`;

    // 1. Atualizar no Provedor Remoto se aplicável
    if (
      !isLocal &&
      cfg.token &&
      current_name !== "default" &&
      current_name !== "_default" &&
      current_name !== "local"
    ) {
      const endpoint = `/repos/${repoOwner}/${current_name}`;
      const updatePayload: any = {};
      if (new_name && new_name !== current_name) {
        updatePayload.name = targetName;
      }
      if (description !== undefined) {
        updatePayload.description = description;
      }
      if (is_private !== undefined) {
        updatePayload.private = is_private;
      }

      const { statusCode, data } = await callGitProviderAPI(
        endpoint,
        cfg.token,
        "PATCH",
        updatePayload,
      );
      if (statusCode === 200) {
        remoteUpdated = true;
        updatedRemoteUrl = data.html_url || updatedRemoteUrl;
        updatedFullName = data.full_name || `${repoOwner}/${targetName}`;
      } else {
        throw new Error(
          data?.message ||
            `Falha ao atualizar repositório no provedor remoto (Status ${statusCode})`,
        );
      }
    }

    // 2. Renomear pasta local se o nome mudou
    const oldDir = resolveRepoDir(current_name, repoOwner);
    const newDir = resolveRepoDir(targetName, repoOwner);

    if (targetName !== current_name && fs.existsSync(oldDir)) {
      try {
        fs.renameSync(oldDir, newDir);
        workspaceService.invalidateTreeCache(current_name);
        workspaceService.invalidateTreeCache(targetName);
      } catch (err: any) {
        console.error(
          `[ReposService] Erro ao renomear pasta local de ${oldDir} para ${newDir}:`,
          err,
        );
      }
    }

    // 3. Atualizar .project.config.json se existir
    const activeDir = fs.existsSync(newDir)
      ? newDir
      : fs.existsSync(oldDir)
        ? oldDir
        : null;
    if (activeDir) {
      const pConfigPath = path.join(activeDir, ".project.config.json");
      if (fs.existsSync(pConfigPath)) {
        try {
          const pConfig = JSON.parse(fs.readFileSync(pConfigPath, "utf-8"));
          if (pConfig && typeof pConfig === "object") {
            if (!pConfig.project) pConfig.project = {};
            if (targetName) pConfig.project.name = targetName;
            if (description !== undefined)
              pConfig.project.description = description;
            fs.writeFileSync(
              pConfigPath,
              JSON.stringify(pConfig, null, 2),
              "utf-8",
            );
          }
        } catch {}
      }
    }

    // 4. Atualizar config.json do Context OS se era o active_repo
    if (cfg.active_repo?.name === current_name) {
      cfg.active_repo = {
        ...cfg.active_repo,
        name: targetName,
        full_name: updatedFullName,
        html_url: updatedRemoteUrl,
        description:
          description !== undefined ? description : cfg.active_repo.description,
        is_private:
          is_private !== undefined ? is_private : cfg.active_repo.is_private,
      };
      saveConfig(cfg);
    }

    return {
      success: true,
      remoteUpdated,
      message: `Repositório '${targetName}' atualizado com sucesso.`,
      repo: {
        name: targetName,
        full_name: updatedFullName,
        html_url: updatedRemoteUrl,
        description: description,
        is_private: is_private,
      },
    };
  }

  async cloneRepo(payload: {
    source_name: string;
    new_name: string;
    owner?: string;
    description?: string;
    is_private?: boolean;
  }) {
    const { source_name, new_name, owner, description, is_private } = payload;
    if (!source_name) {
      throw new Error("Nome do repositório de origem é obrigatório.");
    }
    const targetName = new_name?.trim().toLowerCase().replace(/\s+/g, "-");
    if (!targetName) {
      throw new Error("Novo nome do repositório clonado é obrigatório.");
    }

    const cfg = loadConfig();
    const targetOwner = owner || cfg.active_repo?.owner || cfg.user?.login || "local";
    const sourceDir = resolveRepoDir(source_name, owner || cfg.active_repo?.owner);

    // 1. Criar o novo repositório (local ou remoto)
    const createResult = await this.createRepo({
      name: targetName,
      owner: targetOwner,
      description: description || `Cópia clonada de ${source_name}`,
      is_private: is_private ?? true,
      auto_initialize: false,
    });

    const targetDir = resolveRepoDir(targetName, targetOwner);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 2. Copiar todos os arquivos de source_name para target_name (exceto .git)
    if (fs.existsSync(sourceDir)) {
      const copyRecursive = (src: string, dest: string) => {
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === ".git") continue; // nunca copia a pasta .git
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          if (entry.isDirectory()) {
            if (!fs.existsSync(destPath))
              fs.mkdirSync(destPath, { recursive: true });
            copyRecursive(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      };
      copyRecursive(sourceDir, targetDir);
    }

    // 3. Atualizar o nome no .project.config.json do clone
    const pConfigPath = path.join(targetDir, ".project.config.json");
    if (fs.existsSync(pConfigPath)) {
      try {
        const pConfig = JSON.parse(fs.readFileSync(pConfigPath, "utf-8"));
        if (pConfig && typeof pConfig === "object") {
          if (!pConfig.project) pConfig.project = {};
          pConfig.project.name = targetName;
          if (description) pConfig.project.description = description;
          fs.writeFileSync(
            pConfigPath,
            JSON.stringify(pConfig, null, 2),
            "utf-8",
          );
        }
      } catch {}
    }

    // 4. Se houver git no repositório destino, commitar e fazer push
    const clonedRepo =
      (createResult as any).repo || (createResult as any).active_repo;
    if (fs.existsSync(path.join(targetDir, ".git"))) {
      await executeGit(["add", "-A"], targetDir);
      await executeGit(
        ["commit", "-m", `feat: initial cloned structure from ${source_name}`],
        targetDir,
      ).catch(() => {});
      if (cfg.authenticated && cfg.token && !clonedRepo?.is_local) {
        await executeGit(["push", "-u", "origin", "main"], targetDir).catch(() => {});
      }
    }

    workspaceService.invalidateTreeCache(targetName);

    return {
      success: true,
      message: `Repositório '${targetName}' clonado a partir de '${source_name}' com sucesso!`,
      repo: clonedRepo,
    };
  }

  async listOrgs() {
    if (orgsCache && Date.now() - orgsCache.timestamp < ORGS_CACHE_TTL_MS) {
      return orgsCache.data;
    }

    const cfg = loadConfig();
    const orgsMap = new Map<string, any>();

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
      (o: any) => o?.login?.toLowerCase() === username.toLowerCase(),
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

export const reposService = new ReposService();

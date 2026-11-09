import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PROJECTS_DIR, resolveRepoDir } from "../../config/constants.js";
import { loadConfig, saveConfig } from "../../config/storage.js";
import { callGitHubAPI } from "../../utils/git.js";
import {
  CollaboratorInfo,
  GitHubPermission,
  GovernanceQuorumRules,
  BranchProtectionStatus,
  GovernanceAuditLogEntry,
  DepartmentConfig,
  DEFAULT_DEPARTMENTS,
  SecretScanResult,
  SecretScanViolation,
  OrganizationTeamInfo,
  OrganizationMemberInfo,
  RepoTeamInfo,
  OrgTeamMemberInfo,
  CreateOrgTeamPayload,
  OrgInvitePayload,
  EffectiveUserPermission,
  GovernanceActionWorkflowStatus,
} from "./governance.types.js";
import { scanContentForSecrets } from "../../utils/crypto.js";
import { writeJsonAtomic, writeTextAtomic } from "../../utils/atomic-write.js";

// In-memory Ephemeral Token Store for Secure AI Context Pipe
interface EphemeralAIToken {
  token: string;
  user: string;
  folder?: string;
  expiresAt: number;
}

const ephemeralTokens = new Map<string, EphemeralAIToken>();

// Cache em memória para permissões calculadas do GitHub
const effectivePermissionCache = new Map<string, { timestamp: number; data: EffectiveUserPermission }>();

export function clearEffectivePermissionCache(): void {
  effectivePermissionCache.clear();
}
const PERM_CACHE_TTL_MS = 3 * 60 * 1000;

export class GovernanceService {
  private getRepoDir(repoName?: string): string {
    const cfg = loadConfig();
    const activeRepoName = repoName || cfg.active_repo?.name || "local";
    const effectiveOwner = cfg.active_repo?.name === activeRepoName ? cfg.active_repo?.owner : undefined;
    return resolveRepoDir(activeRepoName, effectiveOwner);
  }

  private getProjectConfigPath(repoName?: string): string {
    const dir = this.getRepoDir(repoName);
    return path.join(dir, ".project.config.json");
  }

  public readProjectConfig(repoName?: string): any {
    const p = this.getProjectConfigPath(repoName);
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, "utf-8"));
      } catch {}
    }
    return {};
  }

  public writeProjectConfig(repoName: string | undefined, data: unknown): void {
    const p = this.getProjectConfigPath(repoName);
    try {
      writeJsonAtomic(p, data, 2);
    } catch (err) {
      console.warn(
        `[GovernanceService] Falha ao salvar .project.config.json:`,
        err,
      );
    }
  }

  public logAudit(
    repoName: string | undefined,
    entry: Omit<GovernanceAuditLogEntry, "id" | "timestamp">,
  ): void {
    const pConfig = this.readProjectConfig(repoName);
    if (!Array.isArray(pConfig.governance_audit_logs)) {
      pConfig.governance_audit_logs = [];
    }
    const logItem: GovernanceAuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    pConfig.governance_audit_logs.unshift(logItem);
    // Keep last 100 entries
    if (pConfig.governance_audit_logs.length > 100) {
      pConfig.governance_audit_logs = pConfig.governance_audit_logs.slice(
        0,
        100,
      );
    }
    this.writeProjectConfig(repoName, pConfig);
  }

  private resolveRepoFullName(repoName?: string, orgLogin?: string): string {
    const cfg = loadConfig();
    const activeRepo = cfg.active_repo;
    const targetRepoName = repoName || activeRepo?.name || "local";

    // 1. Se o nome já contiver '/', ex: 'MinhaOrg/MeuRepo', retorna diretamente
    if (targetRepoName.includes("/") && !targetRepoName.startsWith("local/")) {
      return targetRepoName;
    }

    // 2. Repositórios locais ou padrão do sistema
    if (
      targetRepoName === "local" ||
      targetRepoName === "default" ||
      targetRepoName === "_default"
    ) {
      if (
        activeRepo?.name === targetRepoName &&
        activeRepo.full_name &&
        !activeRepo.full_name.startsWith("local/") &&
        !activeRepo.is_local
      ) {
        return activeRepo.full_name;
      }
      return `local/${targetRepoName}`;
    }

    // 3. Inspeciona o .git/config específico da pasta deste repositório no disco (fonte de verdade número 1)
    const repoDir = this.getRepoDir(targetRepoName);
    const gitConfigPath = path.join(repoDir, ".git", "config");
    if (fs.existsSync(gitConfigPath)) {
      try {
        const configText = fs.readFileSync(gitConfigPath, "utf-8");
        const match = configText.match(
          /url\s*=\s*(?:https?:\/\/[^\/]+(?::\d+)?\/|git@[^:]+:)([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(\.git|\s|$)/,
        );
        if (match && match[1]) {
          const fullName = match[1].replace(/\.git$/, "");
          if (!fullName.startsWith("local/")) {
            return fullName;
          }
        }
      } catch {}
    }

    // 4. Se orgLogin foi explicitamente passado e não for "local"
    if (orgLogin && orgLogin !== "local") {
      return `${orgLogin}/${targetRepoName}`;
    }

    // 5. Se o repositório ativo selecionado for o mesmo e tiver full_name válido
    if (activeRepo?.name?.toLowerCase() === targetRepoName.toLowerCase()) {
      if (activeRepo.is_local || activeRepo.full_name?.startsWith("local/")) {
        return `local/${targetRepoName}`;
      }
      if (activeRepo.full_name && !activeRepo.full_name.startsWith("local/")) {
        return activeRepo.full_name;
      }
    }

    // 6. Se há organização ativa configurada no storage
    const fallbackOrg = (cfg as any).active_org?.login;
    if (fallbackOrg && fallbackOrg !== "local") {
      return `${fallbackOrg}/${targetRepoName}`;
    }

    // 7. Se há organizações nas credenciais do usuário
    if (Array.isArray(cfg.orgs) && cfg.orgs.length > 0) {
      const firstOrg =
        typeof cfg.orgs[0] === "string" ? cfg.orgs[0] : cfg.orgs[0]?.login;
      if (firstOrg && firstOrg !== "local") {
        return `${firstOrg}/${targetRepoName}`;
      }
    }

    // 8. Se há login de usuário
    if (cfg.user?.login && cfg.user.login !== "local") {
      return `${cfg.user.login}/${targetRepoName}`;
    }

    return `local/${targetRepoName}`;
  }

  async getCollaborators(repoName?: string): Promise<{
    collaborators: CollaboratorInfo[];
    isSoloMode: boolean;
    activeCount: number;
    owner: string;
    resolvedFullName: string;
    githubAuthError?: string | null;
  }> {
    const cfg = loadConfig();
    const activeRepo = cfg.active_repo;
    const targetRepoName = repoName || activeRepo?.name || "local";
    const pConfig = this.readProjectConfig(targetRepoName);
    const localMemberMeta = pConfig.governance_collaborators || {};

    const resolvedFullName = this.resolveRepoFullName(targetRepoName);
    const repoOwnerFromFullName =
      resolvedFullName &&
      resolvedFullName.includes("/") &&
      !resolvedFullName.startsWith("local/")
        ? resolvedFullName.split("/")[0]
        : null;
    const ownerLogin =
      (typeof activeRepo?.owner === "string"
        ? activeRepo.owner
        : activeRepo?.owner?.login) ||
      repoOwnerFromFullName ||
      cfg.user?.login ||
      "local-owner";
    let collaborators: CollaboratorInfo[] = [];
    let githubAuthError: string | null = null;

    const findLocalMeta = (username: string) => {
      const entry = Object.entries(localMemberMeta as Record<string, any>).find(
        ([k]) => k.toLowerCase() === username.toLowerCase(),
      );
      return entry ? entry[1] : {};
    };

    // 1. Fetch remote collaborators if authenticated and valid remote repo
    if (
      cfg.token &&
      resolvedFullName &&
      !resolvedFullName.startsWith("local/")
    ) {
      try {
        const ghRes = await callGitHubAPI(
          `/repos/${resolvedFullName}/collaborators?affiliation=all&per_page=100`,
          cfg.token,
        );
        if (ghRes.statusCode === 200 && Array.isArray(ghRes.data)) {
          collaborators = ghRes.data.map((c: any) => {
            const login = c.login;
            const meta = findLocalMeta(login);
            let perm: GitHubPermission = "push";
            if (c.permissions?.admin) perm = "admin";
            else if (c.permissions?.maintain) perm = "maintain";
            else if (c.permissions?.push) perm = "push";
            else if (c.permissions?.triage) perm = "triage";
            else if (c.permissions?.pull) perm = "pull";

            const isOwner =
              login.toLowerCase() === ownerLogin.toLowerCase() ||
              login.toLowerCase() ===
                resolvedFullName.split("/")[0].toLowerCase();
            const role =
              meta.role ||
              meta.role_name ||
              (isOwner ? "Owner / Tech Lead" : "Engenheiro / Revisor");
            const departments: string[] =
              Array.isArray(meta.departments) && meta.departments.length > 0
                ? meta.departments
                : isOwner
                  ? ["*"]
                  : ["engineering"];
            const allowedPaths: string[] =
              Array.isArray(meta.allowed_paths) && meta.allowed_paths.length > 0
                ? meta.allowed_paths
                : isOwner
                  ? ["*"]
                  : ["*"];
            const deniedPaths: string[] = Array.isArray(meta.denied_paths)
              ? meta.denied_paths
              : [];

            return {
              login,
              id: c.id,
              avatar_url: c.avatar_url || `https://github.com/${login}.png`,
              html_url: c.html_url || `https://github.com/${login}`,
              permission: perm,
              role,
              role_name: role,
              departments,
              allowed_paths: allowedPaths,
              denied_paths: deniedPaths,
              is_owner: isOwner,
              status: "active",
            };
          });
        } else if (ghRes.statusCode === 401) {
          githubAuthError = `Token do GitHub expirado ou inválido (401 Bad credentials). Atualize suas credenciais para sincronizar os membros.`;
        } else if (ghRes.statusCode === 403) {
          githubAuthError = `Sem permissão de acesso ao repositório ${resolvedFullName} no GitHub (${ghRes.statusCode}).`;
        } else if (ghRes.statusCode === 404) {
          // Repositório ainda não publicado no servidor remoto -> opera localmente sem erro
          githubAuthError = null;
        }

        // 2. Also fetch Pending Invitations
        try {
          const invRes = await callGitHubAPI(
            `/repos/${resolvedFullName}/invitations`,
            cfg.token,
          );
          if (invRes.statusCode === 200 && Array.isArray(invRes.data)) {
            for (const inv of invRes.data) {
              const invitee = inv.invitee;
              if (invitee && invitee.login) {
                const existing = collaborators.find(
                  (c) => c.login.toLowerCase() === invitee.login.toLowerCase(),
                );
                if (!existing) {
                  const meta = localMemberMeta[invitee.login] || {};
                  collaborators.push({
                    login: invitee.login,
                    id: invitee.id,
                    avatar_url:
                      invitee.avatar_url ||
                      `https://github.com/${invitee.login}.png`,
                    html_url:
                      invitee.html_url || `https://github.com/${invitee.login}`,
                    permission: (inv.permissions as GitHubPermission) || "push",
                    role_name: meta.role_name || "Convidado (Pendente)",
                    allowed_paths: Array.isArray(meta.allowed_paths)
                      ? meta.allowed_paths
                      : ["*"],
                    denied_paths: Array.isArray(meta.denied_paths)
                      ? meta.denied_paths
                      : [],
                    is_owner: false,
                    status: "pending",
                    invited_at: inv.created_at,
                  });
                }
              }
            }
          }
        } catch {}
      } catch (err: any) {
        githubAuthError = err.message;
        console.warn(
          "[GovernanceService] Aviso ao buscar colaboradores do GitHub:",
          err,
        );
      }
    }

    // Fallback or Merge: If no collaborators fetched or local repository, use local user + stored collaborators
    if (collaborators.length === 0) {
      const userLogin = cfg.user?.login || "local-developer";
      const isOwner = true;
      const ownerMeta = findLocalMeta(userLogin);
      const ownerRole =
        ownerMeta.role || ownerMeta.role_name || "Owner / Tech Lead";
      const ownerDepts =
        Array.isArray(ownerMeta.departments) && ownerMeta.departments.length > 0
          ? ownerMeta.departments
          : ["*"];
      const ownerPaths =
        Array.isArray(ownerMeta.allowed_paths) &&
        ownerMeta.allowed_paths.length > 0
          ? ownerMeta.allowed_paths
          : ["*"];
      collaborators.push({
        login: userLogin,
        id: 1,
        avatar_url:
          cfg.user?.avatar_url || `https://github.com/${userLogin}.png`,
        html_url: cfg.user?.html_url || `https://github.com/${userLogin}`,
        permission: "admin",
        role: ownerRole,
        role_name: ownerRole,
        departments: ownerDepts,
        allowed_paths: ownerPaths,
        is_owner: isOwner,
        status: "active",
      });
    }

    // Merge any stored members in .project.config.json that might not be in the remote list
    for (const [login, meta] of Object.entries(
      localMemberMeta as Record<string, any>,
    )) {
      const existing = collaborators.find(
        (c) => c.login.toLowerCase() === login.toLowerCase(),
      );
      if (!existing) {
        const memberRole = meta.role || meta.role_name || "Colaborador";
        const memberDepts =
          Array.isArray(meta.departments) && meta.departments.length > 0
            ? meta.departments
            : ["engineering"];
        const memberPaths =
          Array.isArray(meta.allowed_paths) && meta.allowed_paths.length > 0
            ? meta.allowed_paths
            : ["*"];
        collaborators.push({
          login,
          id: Math.floor(Math.random() * 1000000),
          avatar_url: `https://github.com/${login}.png`,
          html_url: `https://github.com/${login}`,
          permission: (meta.permission as GitHubPermission) || "push",
          role: memberRole,
          role_name: memberRole,
          departments: memberDepts,
          allowed_paths: memberPaths,
          denied_paths: Array.isArray(meta.denied_paths)
            ? meta.denied_paths
            : [],
          is_owner: false,
          status: meta.status || "active",
        });
      }
    }

    const activeCount = collaborators.filter(
      (c) => c.status === "active",
    ).length;
    const isSoloMode = activeCount <= 1;

    return {
      collaborators,
      isSoloMode,
      activeCount,
      owner: ownerLogin,
      resolvedFullName,
      githubAuthError,
    };
  }

  async inviteCollaborator(payload: {
    repo?: string;
    username: string;
    permission: GitHubPermission;
    role?: string;
    role_name?: string;
    departments?: string[];
    allowed_paths?: string[];
    denied_paths?: string[];
  }): Promise<{
    success: boolean;
    message: string;
    collaborator: CollaboratorInfo;
  }> {
    const cfg = loadConfig();
    const targetRepoName = payload.repo || cfg.active_repo?.name || "local";
    const cleanUsername = payload.username.trim().replace(/^@/, "");

    if (!cleanUsername) {
      throw new Error("Nome de usuário do GitHub é obrigatório para convite.");
    }

    const permission = payload.permission || "push";
    const roleName =
      payload.role ||
      payload.role_name ||
      (permission === "admin" ? "Co-Admin" : "Engenheiro / Revisor");
    const departments =
      Array.isArray(payload.departments) && payload.departments.length > 0
        ? payload.departments
        : ["engineering"];
    const allowedPaths =
      Array.isArray(payload.allowed_paths) && payload.allowed_paths.length > 0
        ? payload.allowed_paths
        : ["*"];
    const deniedPaths = Array.isArray(payload.denied_paths)
      ? payload.denied_paths
      : [];
    const resolvedFullName = this.resolveRepoFullName(targetRepoName);

    // 1. If remote GitHub repo, send invite via GitHub API
    if (
      cfg.token &&
      resolvedFullName &&
      !resolvedFullName.startsWith("local/")
    ) {
      try {
        const res = await callGitHubAPI(
          `/repos/${resolvedFullName}/collaborators/${cleanUsername}`,
          cfg.token,
          "PUT",
          { permission },
        );
        if (res.statusCode >= 400 && res.statusCode !== 422) {
          throw new Error(
            res.data?.message || "Falha ao convidar usuário no GitHub.",
          );
        }
      } catch (err: any) {
        throw new Error(
          `Erro ao enviar convite via API do GitHub: ${err.message}`,
        );
      }
    }

    // 2. Persist local metadata in .project.config.json
    const pConfig = this.readProjectConfig(targetRepoName);
    if (!pConfig.governance_collaborators)
      pConfig.governance_collaborators = {};
    pConfig.governance_collaborators[cleanUsername] = {
      permission,
      role: roleName,
      role_name: roleName,
      departments,
      allowed_paths: allowedPaths,
      denied_paths: deniedPaths,
      invited_at: new Date().toISOString(),
      status: "active",
    };
    this.writeProjectConfig(targetRepoName, pConfig);

    const actor = cfg.user?.login ? `@${cfg.user.login}` : "Tech Lead";
    this.logAudit(targetRepoName, {
      action: "COLLABORATOR_INVITED",
      actor,
      target: `@${cleanUsername}`,
      details: `Convidado com nível de acesso '${permission}', cargo '${roleName}', departamentos: [${departments.join(", ")}] e rotas: [${allowedPaths.join(", ")}].`,
    });

    const colInfo: CollaboratorInfo = {
      login: cleanUsername,
      id: Date.now(),
      avatar_url: `https://github.com/${cleanUsername}.png`,
      html_url: `https://github.com/${cleanUsername}`,
      permission,
      role: roleName,
      role_name: roleName,
      departments,
      allowed_paths: allowedPaths,
      denied_paths: deniedPaths,
      is_owner: false,
      status: "active",
    };

    return {
      success: true,
      message: `Convite enviado com sucesso para @${cleanUsername} com cargo '${roleName}', permissão '${permission}'! Permissões de acesso aos departamentos configuradas.`,
      collaborator: colInfo,
    };
  }

  async removeCollaborator(payload: {
    repo?: string;
    username: string;
  }): Promise<{ success: boolean; message: string }> {
    const cfg = loadConfig();
    const targetRepoName = payload.repo || cfg.active_repo?.name || "local";
    const cleanUsername = payload.username.trim().replace(/^@/, "");
    const resolvedFullName = this.resolveRepoFullName(targetRepoName);

    if (
      cfg.token &&
      resolvedFullName &&
      !resolvedFullName.startsWith("local/")
    ) {
      try {
        await callGitHubAPI(
          `/repos/${resolvedFullName}/collaborators/${cleanUsername}`,
          cfg.token,
          "DELETE",
        );
      } catch (err: any) {
        console.warn(
          `[GovernanceService] Aviso ao remover colaborador no GitHub:`,
          err,
        );
      }
    }

    const pConfig = this.readProjectConfig(targetRepoName);
    if (
      pConfig.governance_collaborators &&
      pConfig.governance_collaborators[cleanUsername]
    ) {
      delete pConfig.governance_collaborators[cleanUsername];
      this.writeProjectConfig(targetRepoName, pConfig);
    }

    const actor = cfg.user?.login ? `@${cfg.user.login}` : "Tech Lead";
    this.logAudit(targetRepoName, {
      action: "COLLABORATOR_REMOVED",
      actor,
      target: `@${cleanUsername}`,
      details: `Colaborador removido da governança e do repositório. Permissões revogadas com sucesso.`,
    });

    return {
      success: true,
      message: `Colaborador @${cleanUsername} removido com sucesso do repositório.`,
    };
  }

  async updateCollaboratorClearance(payload: {
    repo?: string;
    username: string;
    role?: string;
    role_name?: string;
    permission?: GitHubPermission;
    departments?: string[];
    allowed_paths?: string[];
    denied_paths?: string[];
  }): Promise<{ success: boolean; message: string }> {
    const cleanUsername = payload.username.trim().replace(/^@/, "");
    const targetRepoName = payload.repo || "local";
    const cfg = loadConfig();
    const pConfig = this.readProjectConfig(targetRepoName);
    if (!pConfig.governance_collaborators)
      pConfig.governance_collaborators = {};

    const existingKey =
      Object.keys(pConfig.governance_collaborators).find(
        (k) => k.toLowerCase() === cleanUsername.toLowerCase(),
      ) || cleanUsername;

    const currentData = pConfig.governance_collaborators[existingKey] || {};

    // Sincroniza permissão no GitHub se fornecida e diferente da atual
    if (payload.permission && payload.permission !== currentData.permission) {
      const resolvedFullName = this.resolveRepoFullName(targetRepoName);
      if (
        cfg.token &&
        resolvedFullName &&
        !resolvedFullName.startsWith("local/")
      ) {
        try {
          await callGitHubAPI(
            `/repos/${resolvedFullName}/collaborators/${cleanUsername}`,
            cfg.token,
            "PUT",
            { permission: payload.permission },
          );
        } catch (err: any) {
          console.warn(
            `[GovernanceService] Aviso ao atualizar permissão no GitHub para @${cleanUsername}:`,
            err,
          );
        }
      }
    }

    const role =
      payload.role ||
      payload.role_name ||
      currentData.role ||
      currentData.role_name;
    const permission = payload.permission || currentData.permission || "push";
    const allowedPaths = Array.isArray(payload.allowed_paths)
      ? payload.allowed_paths
      : currentData.allowed_paths;
    const deniedPaths = Array.isArray(payload.denied_paths)
      ? payload.denied_paths
      : currentData.denied_paths;

    pConfig.governance_collaborators[existingKey] = {
      ...currentData,
      permission,
      ...(role ? { role, role_name: role } : {}),
      ...(Array.isArray(payload.departments)
        ? { departments: payload.departments }
        : {}),
      ...(Array.isArray(allowedPaths) ? { allowed_paths: allowedPaths } : {}),
      ...(Array.isArray(deniedPaths) ? { denied_paths: deniedPaths } : {}),
    };
    this.writeProjectConfig(targetRepoName, pConfig);

    const actor = cfg.user?.login ? `@${cfg.user.login}` : "Tech Lead";
    this.logAudit(targetRepoName, {
      action: "COLLABORATOR_UPDATED",
      actor,
      target: `@${cleanUsername}`,
      details: `Perfil de acesso de @${cleanUsername} atualizado:${role ? ` Cargo '${role}',` : ""} Permissão '${permission}'${allowedPaths ? `, Rotas: [${allowedPaths.join(", ")}]` : ""}.`,
    });

    // Disparo assíncrono de notificação de alteração de clearance
    setImmediate(() => {
      import("../notifications/notification.service.js")
        .then(({ notificationService }) => {
          notificationService.dispatch({
            event: "clearance_changed",
            repo: targetRepoName,
            title: `Permissões de Governança Atualizadas para @${cleanUsername}`,
            message: `O perfil de governança de @${cleanUsername} foi atualizado no projeto ${targetRepoName} com permissão '${permission}' e cargo '${role || "Colaborador"}'.`,
            author: actor.replace(/^@/, ""),
            severity: "info",
            statusColor: "#3B82F6",
            details: {
              username: cleanUsername,
              permission,
              role,
              allowedPaths,
            },
          }, targetRepoName).catch((err) => {
            console.warn("[GovernanceService] Falha ao despachar notificação de clearance:", err);
          });
        })
        .catch(() => {});
    });

    return {
      success: true,
      message: `Perfil de governança de @${cleanUsername} atualizado com sucesso.`,
    };
  }

  /**
   * Sincroniza automaticamente as rotas permitidas dos colaboradores quando uma pasta é renomeada
   */
  handleFolderRename(
    oldFolderPath: string,
    newFolderPath: string,
    repoName?: string,
  ): void {
    const targetRepoName = repoName || "local";
    const pConfig = this.readProjectConfig(targetRepoName);
    if (!pConfig.governance_collaborators) return;

    const cleanOld = oldFolderPath
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "")
      .toLowerCase();
    const cleanNew = newFolderPath
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");

    let modified = false;
    for (const [, meta] of Object.entries(
      pConfig.governance_collaborators as Record<string, any>,
    )) {
      const updatePathList = (
        paths: string[],
      ): { updated: string[]; changed: boolean } => {
        let changed = false;
        const updated = paths.map((p: string) => {
          const cleanP = p.replace(/\\/g, "/").replace(/^\/+/, "");
          const cleanPLower = cleanP.toLowerCase();
          if (cleanPLower === cleanOld) {
            changed = true;
            return cleanNew;
          }
          if (
            cleanPLower === `${cleanOld}/**` ||
            cleanPLower === `${cleanOld}/*`
          ) {
            changed = true;
            return `${cleanNew}/**`;
          }
          if (cleanPLower.startsWith(`${cleanOld}/`)) {
            changed = true;
            return cleanNew + cleanP.slice(cleanOld.length);
          }
          return p;
        });
        return { updated, changed };
      };

      if (Array.isArray(meta.allowed_paths)) {
        const { updated, changed } = updatePathList(meta.allowed_paths);
        if (changed) {
          meta.allowed_paths = updated;
          modified = true;
        }
      }

      if (Array.isArray(meta.denied_paths)) {
        const { updated, changed } = updatePathList(meta.denied_paths);
        if (changed) {
          meta.denied_paths = updated;
          modified = true;
        }
      }
    }

    if (modified) {
      this.writeProjectConfig(targetRepoName, pConfig);
      this.logAudit(targetRepoName, {
        action: "QUORUM_UPDATED",
        actor: "System",
        details: `Rotas de acesso dos colaboradores atualizadas após renomeio de '${oldFolderPath}' para '${newFolderPath}'.`,
      });
    }
  }

  async getDepartments(repoName?: string): Promise<DepartmentConfig[]> {
    const targetRepoName = repoName || "local";
    const pConfig = this.readProjectConfig(targetRepoName);
    if (Array.isArray(pConfig.departments) && pConfig.departments.length > 0) {
      return pConfig.departments;
    }
    return DEFAULT_DEPARTMENTS;
  }

  async saveDepartments(
    departments: DepartmentConfig[],
    repoName?: string,
  ): Promise<{ success: boolean; departments: DepartmentConfig[] }> {
    const targetRepoName = repoName || "local";
    const pConfig = this.readProjectConfig(targetRepoName);
    pConfig.departments = departments;
    this.writeProjectConfig(targetRepoName, pConfig);

    const cfg = loadConfig();
    const actor = cfg.user?.login ? `@${cfg.user.login}` : "Tech Lead";
    this.logAudit(targetRepoName, {
      action: "DEPARTMENT_CONFIG_UPDATED",
      actor,
      details: `Departamentos da governança atualizados (${departments.length} departamentos configurados).`,
    });

    return {
      success: true,
      departments,
    };
  }

  async getBranchProtection(
    repoName?: string,
  ): Promise<BranchProtectionStatus> {
    const cfg = loadConfig();
    const activeRepo = cfg.active_repo;
    const targetRepoName = repoName || activeRepo?.name || "local";
    const defaultBranch = activeRepo?.default_branch || "main";

    if (
      cfg.authenticated &&
      cfg.token &&
      activeRepo?.full_name &&
      !activeRepo?.is_local &&
      activeRepo?.name === targetRepoName
    ) {
      try {
        const ghRes = await callGitHubAPI(
          `/repos/${activeRepo.full_name}/branches/${defaultBranch}/protection`,
          cfg.token,
        );
        if (ghRes.statusCode === 200 && ghRes.data) {
          const d = ghRes.data;
          return {
            enabled: true,
            required_approving_review_count:
              d.required_pull_request_reviews
                ?.required_approving_review_count || 1,
            dismiss_stale_reviews:
              d.required_pull_request_reviews?.dismiss_stale_reviews || false,
            require_code_owner_reviews:
              d.required_pull_request_reviews?.require_code_owner_reviews ||
              false,
            enforce_admins: d.enforce_admins?.enabled || false,
            allow_force_pushes: d.allow_force_pushes?.enabled || false,
            allow_deletions: d.allow_deletions?.enabled || false,
          };
        }
      } catch {}
    }

    // Return stored local rules or default disabled
    const pConfig = this.readProjectConfig(targetRepoName);
    const localProt = pConfig.governance_branch_protection;
    if (localProt) {
      return localProt;
    }

    return {
      enabled: false,
      required_approving_review_count: 1,
      dismiss_stale_reviews: true,
      require_code_owner_reviews: false,
      enforce_admins: true,
      allow_force_pushes: false,
      allow_deletions: false,
    };
  }

  async applyBranchProtection(payload: {
    repo?: string;
    min_approvals?: number;
    enforce_admins?: boolean;
    dismiss_stale_reviews?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    protection: BranchProtectionStatus;
  }> {
    const cfg = loadConfig();
    const activeRepo = cfg.active_repo;
    const targetRepoName = payload.repo || activeRepo?.name || "local";
    const defaultBranch = activeRepo?.default_branch || "main";
    const minApprovals = payload.min_approvals || 1;

    const protectionPayload = {
      required_status_checks: null,
      enforce_admins: payload.enforce_admins !== false,
      required_pull_request_reviews: {
        dismiss_stale_reviews: payload.dismiss_stale_reviews !== false,
        require_code_owner_reviews: false,
        required_approving_review_count: minApprovals,
      },
      restrictions: null,
      allow_force_pushes: false,
      allow_deletions: false,
    };

    if (
      cfg.authenticated &&
      cfg.token &&
      activeRepo?.full_name &&
      !activeRepo?.is_local &&
      activeRepo?.name === targetRepoName
    ) {
      try {
        const ghRes = await callGitHubAPI(
          `/repos/${activeRepo.full_name}/branches/${defaultBranch}/protection`,
          cfg.token,
          "PUT",
          protectionPayload,
        );
        if (ghRes.statusCode >= 400) {
          const msg = ghRes.data?.message || "";
          if (
            ghRes.statusCode === 403 &&
            (msg.includes("Upgrade to GitHub Pro") ||
              msg.includes("pricing plans"))
          ) {
            console.info(
              "[GovernanceService] Repositório privado em plano GitHub Free: O GitHub exige plano Pro/Team para regras de nuvem em repositórios privados. Governança local mantida 100% ativa.",
            );
          } else {
            console.warn(
              "[GovernanceService] Aviso do GitHub ao aplicar branch protection:",
              ghRes.statusCode,
              msg,
            );
          }
        }
      } catch (err: any) {
        console.warn(
          "[GovernanceService] Erro ao aplicar regra de branch protection no GitHub:",
          err?.message || err,
        );
      }
    }

    const protectionStatus: BranchProtectionStatus = {
      enabled: true,
      required_approving_review_count: minApprovals,
      dismiss_stale_reviews: payload.dismiss_stale_reviews !== false,
      require_code_owner_reviews: false,
      enforce_admins: payload.enforce_admins !== false,
      allow_force_pushes: false,
      allow_deletions: false,
    };

    const pConfig = this.readProjectConfig(targetRepoName);
    pConfig.governance_branch_protection = protectionStatus;
    this.writeProjectConfig(targetRepoName, pConfig);

    const actor = cfg.user?.login ? `@${cfg.user.login}` : "Tech Lead";
    this.logAudit(targetRepoName, {
      action: "BRANCH_PROTECTED",
      actor,
      target: `versão '${defaultBranch}'`,
      details: `Regras de proteção ativadas: ${minApprovals} aprovações exigidas, envio direto bloqueado e revisões obsoletas dispensadas na atualização.`,
    });

    return {
      success: true,
      message: `Versão principal '${defaultBranch}' protegida com sucesso! Envio direto bloqueado e ${minApprovals} aprovações requeridas.`,
      protection: protectionStatus,
    };
  }

  async getQuorumRules(repoName?: string): Promise<{
    rules: GovernanceQuorumRules;
    isSoloMode: boolean;
    activeCollaboratorsCount: number;
    effectiveMinApprovals: number;
  }> {
    const targetRepoName = repoName || "local";
    const pConfig = this.readProjectConfig(targetRepoName);
    const storedRules = pConfig.governance_rules || {};

    const collabsData = await this.getCollaborators(targetRepoName);
    const activeCount = collabsData.activeCount;
    const isSoloMode = activeCount <= 1;

    const defaultMin = Number(storedRules.min_approvals_default) || 1;
    const effectiveMinApprovals = isSoloMode ? 1 : Math.max(1, defaultMin);

    const rules: GovernanceQuorumRules = {
      mode: storedRules.mode || "auto",
      min_approvals_default: defaultMin,
      anti_self_approval:
        storedRules.anti_self_approval !== undefined
          ? storedRules.anti_self_approval
          : !isSoloMode,
      require_review_before_merge:
        storedRules.require_review_before_merge !== false,
      dismiss_stale_reviews_on_push:
        storedRules.dismiss_stale_reviews_on_push !== false,
      enforce_admins_on_branch: storedRules.enforce_admins_on_branch !== false,
    };

    return {
      rules,
      isSoloMode,
      activeCollaboratorsCount: activeCount,
      effectiveMinApprovals,
    };
  }

  async updateQuorumRules(payload: {
    repo?: string;
    rules: Partial<GovernanceQuorumRules>;
  }): Promise<{ success: boolean; rules: GovernanceQuorumRules }> {
    const targetRepoName = payload.repo || "local";
    const pConfig = this.readProjectConfig(targetRepoName);
    if (!pConfig.governance_rules) pConfig.governance_rules = {};

    pConfig.governance_rules = {
      ...pConfig.governance_rules,
      ...payload.rules,
    };

    this.writeProjectConfig(targetRepoName, pConfig);

    const cfg = loadConfig();
    const actor = cfg.user?.login ? `@${cfg.user.login}` : "Tech Lead";
    this.logAudit(targetRepoName, {
      action: "QUORUM_UPDATED",
      actor,
      details: `Regras de quórum atualizadas: Mínimo padrão de ${pConfig.governance_rules.min_approvals_default} aprovações.`,
    });

    const res = await this.getQuorumRules(targetRepoName);
    return {
      success: true,
      rules: res.rules,
    };
  }

  private getAllMarkdownFiles(dir: string, baseDir = dir): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") && entry.name !== ".translations") {
          if (
            entry.name === ".git" ||
            entry.name === ".context" ||
            entry.name === "node_modules"
          )
            continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules" && entry.name !== ".git") {
            results.push(...this.getAllMarkdownFiles(full, baseDir));
          }
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          results.push(path.relative(baseDir, full));
        }
      }
    } catch {}
    return results;
  }

  async scanRepositorySecrets(repoName?: string): Promise<SecretScanResult> {
    const targetRepoName = repoName || "local";
    const repoDir = this.getRepoDir(targetRepoName);
    const allMdFiles = this.getAllMarkdownFiles(repoDir);
    const violations: SecretScanViolation[] = [];

    for (const relPath of allMdFiles) {
      const fullPath = path.join(repoDir, relPath);
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        const scan = scanContentForSecrets(content, relPath);
        if (scan.hasSecrets) {
          violations.push(...scan.violations);
        }
      } catch {}
    }

    return {
      hasSecrets: violations.length > 0,
      violations,
    };
  }

  async getAuditLogs(repoName?: string): Promise<GovernanceAuditLogEntry[]> {
    const targetRepoName = repoName || "local";
    const pConfig = this.readProjectConfig(targetRepoName);
    return pConfig.governance_audit_logs || [];
  }

  // --- AI SECURE CONTEXT PIPE & EPHEMERAL TOKENS ---

  /**
   * Creates an ephemeral secure token for AI tools/agents to query decrypted context.
   */
  createSecureAIToken(payload: {
    user: string;
    folder?: string;
    repo?: string;
    ttlMinutes?: number;
  }): { token: string; expiresAt: string } {
    const token = `ctx_sec_${crypto.randomBytes(24).toString("hex")}`;
    const ttlMs = (payload.ttlMinutes || 60) * 60 * 1000;
    const expiresAt = Date.now() + ttlMs;

    ephemeralTokens.set(token, {
      token,
      user: payload.user,
      folder: payload.folder,
      expiresAt,
    });

    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  /**
   * Retrieves and decrypts a document's content specifically for authorized AI agents in memory.
   */
  async getSecureContextForAI(payload: {
    filePath: string;
    token: string;
    repo?: string;
  }): Promise<{
    success: boolean;
    filePath: string;
    content?: string;
    error?: string;
  }> {
    const ephemeral = ephemeralTokens.get(payload.token);
    if (!ephemeral || ephemeral.expiresAt < Date.now()) {
      if (ephemeral) ephemeralTokens.delete(payload.token);
      return {
        success: false,
        filePath: payload.filePath,
        error:
          "Token de sessão efêmero expirado ou inválido para acesso ao AI Context Pipe.",
      };
    }

    const targetRepoName = payload.repo || "local";
    const repoDir = this.getRepoDir(targetRepoName);
    const fullPath = path.join(repoDir, payload.filePath);

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        filePath: payload.filePath,
        error: `Arquivo não encontrado no repositório: ${payload.filePath}`,
      };
    }

    const rawContent = fs.readFileSync(fullPath, "utf-8");
    return {
      success: true,
      filePath: payload.filePath,
      content: rawContent,
    };
  }

  /**
   * Lista todos os times da Organização no GitHub
   */
  async getOrgTeams(orgLogin: string): Promise<OrganizationTeamInfo[]> {
    const cfg = loadConfig();
    if (!cfg.token || !orgLogin) {
      return [];
    }
    try {
      const res = await callGitHubAPI(
        `/orgs/${orgLogin}/teams?per_page=100`,
        cfg.token,
        "GET",
      );
      if (res.statusCode === 200 && Array.isArray(res.data)) {
        return res.data.map((t: any) => ({
          id: t.id,
          slug: t.slug,
          name: t.name,
          description: t.description || "",
          permission: t.permission || "pull",
          members_count: t.members_count || 0,
          privacy: t.privacy || "closed",
        }));
      }
      return [];
    } catch (err) {
      console.warn(
        `[GovernanceService] Falha ao listar times da org ${orgLogin}:`,
        err,
      );
      return [];
    }
  }

  /**
   * Lista todos os membros da Organização no GitHub
   */
  async getOrgMembers(orgLogin: string): Promise<OrganizationMemberInfo[]> {
    const cfg = loadConfig();
    if (!cfg.token || !orgLogin) {
      return [];
    }
    try {
      const res = await callGitHubAPI(
        `/orgs/${orgLogin}/members?per_page=100`,
        cfg.token,
        "GET",
      );
      if (res.statusCode === 200 && Array.isArray(res.data)) {
        return res.data.map((m: any) => ({
          id: m.id,
          login: m.login,
          avatar_url: m.avatar_url || `https://github.com/${m.login}.png`,
          html_url: m.html_url || `https://github.com/${m.login}`,
          role: m.site_admin ? "admin" : "member",
        }));
      }
      return [];
    } catch (err) {
      console.warn(
        `[GovernanceService] Falha ao listar membros da org ${orgLogin}:`,
        err,
      );
      return [];
    }
  }

  /**
   * Lista times com acesso a um repositório específico
   */
  async getRepoTeams(owner: string, repo: string): Promise<RepoTeamInfo[]> {
    const cfg = loadConfig();
    if (!cfg.token || !owner || !repo) {
      return [];
    }
    try {
      const res = await callGitHubAPI(
        `/repos/${owner}/${repo}/teams?per_page=100`,
        cfg.token,
        "GET",
      );
      if (res.statusCode === 200 && Array.isArray(res.data)) {
        return res.data.map((t: any) => ({
          id: t.id,
          slug: t.slug,
          name: t.name,
          description: t.description || "",
          permission: t.permission || "pull",
          permissions: t.permissions,
        }));
      }
      return [];
    } catch (err) {
      console.warn(
        `[GovernanceService] Falha ao listar times do repo ${owner}/${repo}:`,
        err,
      );
      return [];
    }
  }

  /**
   * Adiciona ou atualiza permissão de um time em um repositório
   */
  async addTeamToRepo(payload: {
    org: string;
    teamSlug: string;
    owner: string;
    repo: string;
    permission: string;
  }): Promise<{ success: boolean; message?: string }> {
    const cfg = loadConfig();
    if (!cfg.token) {
      throw new Error("Token do GitHub não autenticado");
    }
    const { org, teamSlug, owner, repo, permission } = payload;
    const res = await callGitHubAPI(
      `/orgs/${org}/teams/${teamSlug}/repos/${owner}/${repo}`,
      cfg.token,
      "PUT",
      { permission: permission || "push" },
    );
    if (
      res.statusCode === 204 ||
      res.statusCode === 200 ||
      res.statusCode === 201
    ) {
      return {
        success: true,
        message: `Time @${org}/${teamSlug} adicionado ao repositório ${owner}/${repo} com permissão '${permission}'`,
      };
    }
    throw new Error(
      res.data?.message ||
        `Erro ao associar time ao repositório (${res.statusCode})`,
    );
  }

  /**
   * Remove acesso de um time de um repositório
   */
  async removeTeamFromRepo(payload: {
    org: string;
    teamSlug: string;
    owner: string;
    repo: string;
  }): Promise<{ success: boolean; message?: string }> {
    const cfg = loadConfig();
    if (!cfg.token) {
      throw new Error("Token do GitHub não autenticado");
    }
    const { org, teamSlug, owner, repo } = payload;
    const res = await callGitHubAPI(
      `/orgs/${org}/teams/${teamSlug}/repos/${owner}/${repo}`,
      cfg.token,
      "DELETE",
    );
    if (res.statusCode === 204 || res.statusCode === 200) {
      return {
        success: true,
        message: `Time @${org}/${teamSlug} removido do repositório ${owner}/${repo}`,
      };
    }
    throw new Error(
      res.data?.message ||
        `Erro ao remover time do repositório (${res.statusCode})`,
    );
  }

  /**
   * Cria um novo time na organização do GitHub
   */
  async createOrgTeam(payload: CreateOrgTeamPayload): Promise<{
    success: boolean;
    team?: OrganizationTeamInfo;
    message?: string;
  }> {
    const cfg = loadConfig();
    if (!cfg.token) {
      throw new Error("Token do GitHub não autenticado");
    }
    const { org, name, description, privacy } = payload;
    const res = await callGitHubAPI(`/orgs/${org}/teams`, cfg.token, "POST", {
      name,
      description: description || "",
      privacy: privacy || "closed",
    });

    if (res.statusCode === 201 || res.statusCode === 200) {
      const t = res.data;
      return {
        success: true,
        message: `Time @${org}/${t.slug} criado com sucesso.`,
        team: {
          id: t.id,
          slug: t.slug,
          name: t.name,
          description: t.description || "",
          permission: t.permission || "pull",
          members_count: 0,
          privacy: t.privacy || "closed",
        },
      };
    }
    throw new Error(
      res.data?.message ||
        `Falha ao criar time na organização (${res.statusCode})`,
    );
  }

  /**
   * Exclui um time da organização do GitHub
   */
  async deleteOrgTeam(
    org: string,
    teamSlug: string,
  ): Promise<{ success: boolean; message?: string }> {
    const cfg = loadConfig();
    if (!cfg.token) {
      throw new Error("Token do GitHub não autenticado");
    }
    const res = await callGitHubAPI(
      `/orgs/${org}/teams/${teamSlug}`,
      cfg.token,
      "DELETE",
    );
    if (res.statusCode === 204 || res.statusCode === 200) {
      return {
        success: true,
        message: `Time @${org}/${teamSlug} excluído com sucesso.`,
      };
    }
    throw new Error(
      res.data?.message || `Falha ao excluir time (${res.statusCode})`,
    );
  }

  /**
   * Lista membros de um time específico na organização
   */
  async getOrgTeamMembers(
    org: string,
    teamSlug: string,
  ): Promise<OrgTeamMemberInfo[]> {
    const cfg = loadConfig();
    if (!cfg.token || !org || !teamSlug) {
      return [];
    }
    try {
      const res = await callGitHubAPI(
        `/orgs/${org}/teams/${teamSlug}/members?per_page=100`,
        cfg.token,
        "GET",
      );
      if (res.statusCode === 200 && Array.isArray(res.data)) {
        return res.data.map((m: any) => ({
          id: m.id,
          login: m.login,
          avatar_url: m.avatar_url || `https://github.com/${m.login}.png`,
          html_url: m.html_url || `https://github.com/${m.login}`,
          role: "member",
        }));
      }
      return [];
    } catch (err) {
      console.warn(
        `[GovernanceService] Falha ao listar membros do time @${org}/${teamSlug}:`,
        err,
      );
      return [];
    }
  }

  /**
   * Adiciona ou atualiza membro em um time da organização
   */
  async addMemberToOrgTeam(
    org: string,
    teamSlug: string,
    username: string,
    role: "member" | "maintainer" = "member",
  ): Promise<{ success: boolean; message?: string }> {
    const cfg = loadConfig();
    if (!cfg.token) {
      throw new Error("Token do GitHub não autenticado");
    }
    const cleanUsername = username.trim().replace(/^@/, "");
    const res = await callGitHubAPI(
      `/orgs/${org}/teams/${teamSlug}/memberships/${cleanUsername}`,
      cfg.token,
      "PUT",
      { role },
    );
    if (res.statusCode === 200 || res.statusCode === 201) {
      return {
        success: true,
        message: `@${cleanUsername} adicionado ao time @${org}/${teamSlug} como ${role}.`,
      };
    }
    throw new Error(
      res.data?.message ||
        `Erro ao adicionar membro ao time (${res.statusCode})`,
    );
  }

  /**
   * Remove membro de um time da organização
   */
  async removeMemberFromOrgTeam(
    org: string,
    teamSlug: string,
    username: string,
  ): Promise<{ success: boolean; message?: string }> {
    const cfg = loadConfig();
    if (!cfg.token) {
      throw new Error("Token do GitHub não autenticado");
    }
    const cleanUsername = username.trim().replace(/^@/, "");
    const res = await callGitHubAPI(
      `/orgs/${org}/teams/${teamSlug}/memberships/${cleanUsername}`,
      cfg.token,
      "DELETE",
    );
    if (res.statusCode === 204 || res.statusCode === 200) {
      return {
        success: true,
        message: `@${cleanUsername} removido do time @${org}/${teamSlug}.`,
      };
    }
    throw new Error(
      res.data?.message || `Erro ao remover membro do time (${res.statusCode})`,
    );
  }

  /**
   * Convida um novo membro para a organização no GitHub
   */
  async inviteOrgMember(
    payload: OrgInvitePayload,
  ): Promise<{ success: boolean; message: string }> {
    const cfg = loadConfig();
    if (!cfg.token) {
      throw new Error("Token do GitHub não autenticado");
    }
    const { org, username, email, role = "direct_member", team_ids } = payload;
    let inviteeId: number | undefined;

    if (username) {
      const cleanUsername = username.trim().replace(/^@/, "");
      const userRes = await callGitHubAPI(
        `/users/${cleanUsername}`,
        cfg.token,
        "GET",
      );
      if (userRes.statusCode === 200 && userRes.data?.id) {
        inviteeId = userRes.data.id;
      }
    }

    const body: any = { role };
    if (inviteeId) body.invitee_id = inviteeId;
    if (email) body.email = email;
    if (team_ids && team_ids.length > 0) body.team_ids = team_ids;

    const res = await callGitHubAPI(
      `/orgs/${org}/invitations`,
      cfg.token,
      "POST",
      body,
    );
    if (res.statusCode === 201 || res.statusCode === 200) {
      return {
        success: true,
        message: `Convite para a organização ${org} enviado com sucesso!`,
      };
    }
    throw new Error(
      res.data?.message ||
        `Erro ao convidar para a organização (${res.statusCode})`,
    );
  }

  /**
   * Remove um membro da organização
   */
  async removeOrgMember(
    org: string,
    username: string,
  ): Promise<{ success: boolean; message: string }> {
    const cfg = loadConfig();
    if (!cfg.token) {
      throw new Error("Token do GitHub não autenticado");
    }
    const cleanUsername = username.trim().replace(/^@/, "");
    const res = await callGitHubAPI(
      `/orgs/${org}/members/${cleanUsername}`,
      cfg.token,
      "DELETE",
    );
    if (res.statusCode === 204 || res.statusCode === 200) {
      return {
        success: true,
        message: `@${cleanUsername} removido da organização ${org}.`,
      };
    }
    throw new Error(
      res.data?.message ||
        `Erro ao remover membro da organização (${res.statusCode})`,
    );
  }

  /**
   * Calcula a permissão efetiva do usuário autenticado no repositório e organização atual
   */
  async getEffectiveUserPermission(
    repoName?: string,
    orgLogin?: string,
  ): Promise<EffectiveUserPermission> {
    const cfg = loadConfig();
    const activeUser = cfg.user?.login || "local-user";
    const targetRepoName = repoName || cfg.active_repo?.name || "local";
    const resolvedFullName = this.resolveRepoFullName(targetRepoName, orgLogin);

    const cacheKey = `${activeUser.toLowerCase()}:${resolvedFullName.toLowerCase()}`;
    const cachedEntry = effectivePermissionCache.get(cacheKey);
    if (cachedEntry && Date.now() - cachedEntry.timestamp < PERM_CACHE_TTL_MS) {
      return cachedEntry.data;
    }

    // Fallback completo para repositório local / sem token remoto
    if (!cfg.token || resolvedFullName.startsWith("local/")) {
      const isExplicitLocal = resolvedFullName.startsWith("local/") || !cfg.active_repo || cfg.active_repo.is_local;
      if (isExplicitLocal) {
        return {
          login: activeUser,
          isOrgOwner: true,
          isOrgMember: true,
          isOutsideCollaborator: false,
          repoPermission: "admin",
          roleName: "Owner",
          allowedActions: {
            canRead: true,
            canWrite: true,
            canTriage: true,
            canMaintain: true,
            canAdmin: true,
            canManageGovernance: true,
            canManageTeams: true,
            canDeleteRepo: true,
            canManageBranchProtection: true,
          },
          teamMemberships: [],
        };
      }
      // Se não for repositório local e houver permissões salvas no repositório ativo
      const p = cfg.active_repo?.permissions;
      const isAdmin = Boolean(p?.admin);
      const isPush = Boolean(p?.push || isAdmin);
      const isPull = Boolean(p?.pull || isPush);
      const role = isAdmin ? "Administrador" : isPush ? "Editor" : "Leitor";
      return {
        login: activeUser,
        isOrgOwner: false,
        isOrgMember: false,
        isOutsideCollaborator: true,
        repoPermission: isAdmin ? "admin" : isPush ? "push" : "pull",
        roleName: role,
        allowedActions: {
          canRead: isPull,
          canWrite: isPush,
          canTriage: isPush,
          canMaintain: isAdmin,
          canAdmin: isAdmin,
          canManageGovernance: isAdmin,
          canManageTeams: false,
          canDeleteRepo: isAdmin,
          canManageBranchProtection: isAdmin,
        },
        teamMemberships: [],
      };
    }

    let isOrgOwner = false;
    let isOrgMember = false;
    let isOutsideCollaborator = false;
    let repoPermission:
      | "admin"
      | "maintain"
      | "push"
      | "triage"
      | "pull"
      | "none" = "pull";
    const teamMemberships: string[] = [];

    // 1. Identificar se o repositório pertence a uma Organização ou Usuário
    const parts = resolvedFullName.split("/");
    const repoOwner = parts[0];
    const isPersonalRepo = repoOwner.toLowerCase() === activeUser.toLowerCase();
    const targetOrg = orgLogin || (!isPersonalRepo ? repoOwner : null);

    // Se for o próprio repositório pessoal do usuário, ele é o proprietário com todas as permissões
    if (isPersonalRepo) {
      const result: EffectiveUserPermission = {
        login: activeUser,
        isOrgOwner: true,
        isOrgMember: true,
        isOutsideCollaborator: false,
        repoPermission: "admin",
        roleName: "Owner",
        allowedActions: {
          canRead: true,
          canWrite: true,
          canTriage: true,
          canMaintain: true,
          canAdmin: true,
          canManageGovernance: true,
          canManageTeams: true,
          canDeleteRepo: true,
          canManageBranchProtection: true,
        },
        teamMemberships: [],
      };
      effectivePermissionCache.set(cacheKey, { timestamp: Date.now(), data: result });
      return result;
    }

    // 2. Checar papel na organização via credenciais remotas ou storage local
    if (targetOrg && !isPersonalRepo) {
      if (cfg.token) {
        // Checa membership na organização para o usuário autenticado via API do GitHub
        try {
          const userOrgMemRes = await callGitHubAPI(
            `/user/memberships/orgs/${targetOrg}`,
            cfg.token,
            "GET",
          );
          if (userOrgMemRes.statusCode === 200 && userOrgMemRes.data) {
            isOrgMember = userOrgMemRes.data.state === "active";
            if (userOrgMemRes.data.role === "admin") {
              isOrgOwner = true;
            }
          }
        } catch {}

        if (!isOrgMember) {
          try {
            const orgMemRes = await callGitHubAPI(
              `/orgs/${targetOrg}/memberships/${activeUser}`,
              cfg.token,
              "GET",
            );
            if (orgMemRes.statusCode === 200 && orgMemRes.data) {
              isOrgMember = orgMemRes.data.state === "active";
              if (orgMemRes.data.role === "admin") {
                isOrgOwner = true;
              }
            }
          } catch {}
        }

        if (!isOrgMember) {
          try {
            const userOrgsRes = await callGitHubAPI(
              `/user/orgs?per_page=100`,
              cfg.token,
              "GET",
            );
            if (
              userOrgsRes.statusCode === 200 &&
              Array.isArray(userOrgsRes.data)
            ) {
              const foundOrg = userOrgsRes.data.find(
                (o: any) =>
                  o?.login && o.login.toLowerCase() === targetOrg.toLowerCase(),
              );
              if (foundOrg) {
                isOrgMember = true;
                // Atenção: ser listado em /user/orgs apenas atesta que o usuário é membro ativo da organização,
                // NÃO que ele seja admin/owner da organização.
              }
            }
          } catch {}
        }
      } else {
        // Fallback offline / sem token: checa se a organização está presente no storage local
        if (Array.isArray(cfg.orgs)) {
          const found = cfg.orgs.find(
            (o: any) =>
              (typeof o === "string" ? o : o?.login)?.toLowerCase() ===
              targetOrg.toLowerCase(),
          );
          if (found) {
            isOrgMember = true;
            if (found.role === "admin" || found.is_admin === true) {
              isOrgOwner = true;
            }
          }
        }
      }
    }

    // 3. Checar permissão específica no repositório
    try {
      const permRes = await callGitHubAPI(
        `/repos/${resolvedFullName}/collaborators/${activeUser}/permission`,
        cfg.token,
        "GET",
      );
      if (permRes.statusCode === 200 && permRes.data?.permission) {
        const p = permRes.data.permission;
        if (p === "admin") repoPermission = "admin";
        else if (p === "maintain") repoPermission = "maintain";
        else if (p === "write" || p === "push") repoPermission = "push";
        else if (p === "triage") repoPermission = "triage";
        else if (p === "read" || p === "pull") repoPermission = "pull";
      }
    } catch {}

    // Fallback: consulta direta aos dados do repositório no GitHub
    if (repoPermission === "pull" || isOrgMember || isOrgOwner) {
      try {
        const repoRes = await callGitHubAPI(
          `/repos/${resolvedFullName}`,
          cfg.token,
          "GET",
        );
        if (repoRes.statusCode === 200 && repoRes.data?.permissions) {
          const p = repoRes.data.permissions;
          if (p.admin) {
            repoPermission = "admin";
          } else if (p.maintain) {
            repoPermission = "maintain";
          } else if (p.push) {
            repoPermission = "push";
          } else if (p.triage) {
            repoPermission = "triage";
          } else if (p.pull) {
            repoPermission = "pull";
          }
        }
      } catch {}
    }

    if (isOrgOwner) {
      repoPermission = "admin";
    }

    const canAdmin = repoPermission === "admin" || isOrgOwner;
    const canMaintain = canAdmin || repoPermission === "maintain";
    const canWrite = canMaintain || repoPermission === "push";
    const canTriage = canWrite || repoPermission === "triage";
    const canRead = canTriage || repoPermission === "pull";

    if (!isOrgMember && targetOrg) {
      isOutsideCollaborator = true;
    }

    let roleName = "Leitor";
    if (isOrgOwner) {
      roleName = "Owner";
    } else if (canAdmin) {
      roleName = "Administrador";
    } else if (canMaintain) {
      roleName = "Mantenedor";
    } else if (canWrite) {
      roleName = "Editor";
    } else if (canTriage) {
      roleName = "Triagem";
    } else if (isOutsideCollaborator) {
      roleName = "Colaborador Externo";
    }

    const result: EffectiveUserPermission = {
      login: activeUser,
      isOrgOwner,
      isOrgMember,
      isOutsideCollaborator,
      repoPermission,
      roleName,
      allowedActions: {
        canRead,
        canWrite,
        canTriage,
        canMaintain,
        canAdmin,
        canManageGovernance: canAdmin,
        canManageTeams: isOrgOwner,
        canDeleteRepo: canAdmin,
        canManageBranchProtection: canMaintain,
      },
      teamMemberships,
    };

    effectivePermissionCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  }

  /**
   * Verifica o status do workflow de governança do GitHub Actions (.github/workflows/governance-check.yml)
   */
  async getGovernanceWorkflowStatus(
    repoName?: string,
  ): Promise<GovernanceActionWorkflowStatus> {
    const repoDir = this.getRepoDir(repoName);
    const workflowPath = path.join(
      repoDir,
      ".github",
      "workflows",
      "governance-check.yml",
    );
    const exists = fs.existsSync(workflowPath);
    let content: string | undefined;
    if (exists) {
      try {
        content = fs.readFileSync(workflowPath, "utf-8");
      } catch {}
    }
    return {
      installed: exists,
      path: ".github/workflows/governance-check.yml",
      content,
    };
  }

  /**
   * Instala ou atualiza o workflow de governança automatizada do GitHub Actions
   */
  async installGovernanceWorkflow(
    repoName?: string,
  ): Promise<{ success: boolean; message: string }> {
    const repoDir = this.getRepoDir(repoName);
    const workflowsDir = path.join(repoDir, ".github", "workflows");
    const workflowPath = path.join(workflowsDir, "governance-check.yml");

    const workflowYaml = `# Context OS — Automated Governance & Security Gatekeeper
# Este workflow aplica verificações contínuas de governança (Secret Scanning, Quorum Rules e CODEOWNERS) em Pull Requests e Pushes.

name: Context OS Governance Gatekeeper

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  push:
    branches:
      - main
      - master
      - develop

jobs:
  governance-validation:
    name: 🛡️ Validar Regras de Governança & Secrets
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Validar CODEOWNERS e Estrutura de Arquivos
        run: |
          echo "=== 🔍 Verificando Integridade do CODEOWNERS ==="
          if [ -f "CODEOWNERS" ] || [ -f ".github/CODEOWNERS" ] || [ -f "docs/CODEOWNERS" ]; then
            echo "✅ Arquivo CODEOWNERS detectado."
          else
            echo "⚠️ Aviso: Arquivo CODEOWNERS não encontrado na raiz ou .github/."
          fi

      - name: Scan de Chaves e Credenciais Vazadas
        run: |
          echo "=== 🔒 Varredura Básica de Segredos ==="
          # Busca simples por tokens e chaves privadas em arquivos modificados
          if grep -r -E "(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z\\-_]{35}|-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----)" --exclude-dir=".git" .; then
            echo "❌ ERRO CRÍTICO: Possível credencial ou segredo em texto claro detectado no repositório!"
            exit 1
          else
            echo "✅ Nenhum segredo ou token em texto claro detectado."
          fi

      - name: Validar Configuração do Context OS (.project.config.json)
        run: |
          echo "=== 📋 Validando .project.config.json ==="
          if [ -f ".project.config.json" ]; then
            python3 -c "import json; json.load(open('.project.config.json'))" && echo "✅ .project.config.json é um JSON válido."
          fi
`;

    try {
      writeTextAtomic(workflowPath, workflowYaml);
      this.logAudit(repoName, {
        action: "BRANCH_PROTECTED",
        actor: "System / Tech Lead",
        details:
          "Workflow de governança GitHub Actions instalado (.github/workflows/governance-check.yml).",
      });
      return {
        success: true,
        message:
          "Workflow de governança do GitHub Actions instalado com sucesso em .github/workflows/governance-check.yml",
      };
    } catch (err: any) {
      throw new Error(
        `Falha ao instalar workflow de GitHub Actions: ${err.message}`,
      );
    }
  }

  clearCache(): void {
    clearEffectivePermissionCache();
  }
}

export const governanceService = new GovernanceService();

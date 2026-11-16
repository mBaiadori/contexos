import { loadConfig } from "../../config/storage.js";
import { callGitHubAPI } from "../../utils/git.js";
import {
  CollaboratorInfo,
  GitHubPermission,
  DepartmentConfig,
  DEFAULT_DEPARTMENTS,
} from "./governance.types.js";
import { governanceConfigService } from "./governance-config.service.js";

export class GovernanceCollaboratorsService {
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
    const pConfig = governanceConfigService.readProjectConfig(targetRepoName);
    const localMemberMeta = pConfig.governance_collaborators || {};

    const resolvedFullName = governanceConfigService.resolveRepoFullName(targetRepoName);
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
    const resolvedFullName = governanceConfigService.resolveRepoFullName(targetRepoName);

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
    const pConfig = governanceConfigService.readProjectConfig(targetRepoName);
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
    governanceConfigService.writeProjectConfig(targetRepoName, pConfig);

    const actor = cfg.user?.login ? `@${cfg.user.login}` : "Tech Lead";
    governanceConfigService.logAudit(targetRepoName, {
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
    const resolvedFullName = governanceConfigService.resolveRepoFullName(targetRepoName);

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

    const pConfig = governanceConfigService.readProjectConfig(targetRepoName);
    if (
      pConfig.governance_collaborators &&
      pConfig.governance_collaborators[cleanUsername]
    ) {
      delete pConfig.governance_collaborators[cleanUsername];
      governanceConfigService.writeProjectConfig(targetRepoName, pConfig);
    }

    const actor = cfg.user?.login ? `@${cfg.user.login}` : "Tech Lead";
    governanceConfigService.logAudit(targetRepoName, {
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
    const pConfig = governanceConfigService.readProjectConfig(targetRepoName);
    if (!pConfig.governance_collaborators)
      pConfig.governance_collaborators = {};

    const existingKey =
      Object.keys(pConfig.governance_collaborators).find(
        (k) => k.toLowerCase() === cleanUsername.toLowerCase(),
      ) || cleanUsername;

    const currentData = pConfig.governance_collaborators[existingKey] || {};

    // Sincroniza permissão no GitHub se fornecida e diferente da atual
    if (payload.permission && payload.permission !== currentData.permission) {
      const resolvedFullName = governanceConfigService.resolveRepoFullName(targetRepoName);
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
    governanceConfigService.writeProjectConfig(targetRepoName, pConfig);

    const actor = cfg.user?.login ? `@${cfg.user.login}` : "Tech Lead";
    governanceConfigService.logAudit(targetRepoName, {
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

  handleFolderRename(
    oldFolderPath: string,
    newFolderPath: string,
    repoName?: string,
  ): void {
    const targetRepoName = repoName || "local";
    const pConfig = governanceConfigService.readProjectConfig(targetRepoName);
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
      governanceConfigService.writeProjectConfig(targetRepoName, pConfig);
      governanceConfigService.logAudit(targetRepoName, {
        action: "QUORUM_UPDATED",
        actor: "System",
        details: `Rotas de acesso dos colaboradores atualizadas após renomeio de '${oldFolderPath}' para '${newFolderPath}'.`,
      });
    }
  }

  async getDepartments(repoName?: string): Promise<DepartmentConfig[]> {
    const targetRepoName = repoName || "local";
    const pConfig = governanceConfigService.readProjectConfig(targetRepoName);
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
    const pConfig = governanceConfigService.readProjectConfig(targetRepoName);
    pConfig.departments = departments;
    governanceConfigService.writeProjectConfig(targetRepoName, pConfig);

    const cfg = loadConfig();
    const actor = cfg.user?.login ? `@${cfg.user.login}` : "Tech Lead";
    governanceConfigService.logAudit(targetRepoName, {
      action: "DEPARTMENT_CONFIG_UPDATED",
      actor,
      details: `Departamentos da governança atualizados (${departments.length} departamentos configurados).`,
    });

    return {
      success: true,
      departments,
    };
  }
}

export const governanceCollaboratorsService = new GovernanceCollaboratorsService();

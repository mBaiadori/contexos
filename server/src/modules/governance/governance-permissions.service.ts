import { loadConfig } from "../../config/storage.js";
import { callGitHubAPI } from "../../utils/git.js";
import { EffectiveUserPermission } from "./governance.types.js";
import { governanceConfigService } from "./governance-config.service.js";

const effectivePermissionCache = new Map<string, { timestamp: number; data: EffectiveUserPermission }>();
const PERM_CACHE_TTL_MS = 3 * 60 * 1000;

export function clearEffectivePermissionCache(): void {
  effectivePermissionCache.clear();
}

export class GovernancePermissionsService {
  clearCache(): void {
    clearEffectivePermissionCache();
  }

  async getEffectiveUserPermission(
    repoName?: string,
    orgLogin?: string,
  ): Promise<EffectiveUserPermission> {
    const cfg = loadConfig();
    const activeUser = cfg.user?.login || "local-user";
    const targetRepoName = repoName || cfg.active_repo?.name || "local";
    const resolvedFullName = governanceConfigService.resolveRepoFullName(targetRepoName, orgLogin);

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
                (o: { login?: string }) =>
                  o?.login && o.login.toLowerCase() === targetOrg.toLowerCase(),
              );
              if (foundOrg) {
                isOrgMember = true;
              }
            }
          } catch {}
        }
      } else {
        // Fallback offline / sem token: checa se a organização está presente no storage local
        if (Array.isArray(cfg.orgs)) {
          const found = cfg.orgs.find(
            (o: { login?: string; role?: string; is_admin?: boolean } | string) =>
              (typeof o === "string" ? o : o?.login)?.toLowerCase() ===
              targetOrg.toLowerCase(),
          );
          if (found) {
            isOrgMember = true;
            if (typeof found !== "string" && (found.role === "admin" || found.is_admin === true)) {
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
}

export const governancePermissionsService = new GovernancePermissionsService();

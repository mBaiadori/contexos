import { loadConfig } from "../../config/storage.js";
import { callGitHubAPI } from "../../utils/git.js";
import {
  OrganizationTeamInfo,
  OrganizationMemberInfo,
  RepoTeamInfo,
  OrgTeamMemberInfo,
  CreateOrgTeamPayload,
  OrgInvitePayload,
} from "./governance.types.js";

export class GovernanceTeamsService {
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
        return res.data.map(
          (t: {
            id: number;
            slug: string;
            name: string;
            description?: string;
            permission?: string;
            permissions?: RepoTeamInfo['permissions'];
            members_count?: number;
            privacy?: string;
          }) => ({
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
        return res.data.map(
          (m: {
            id: number;
            login: string;
            avatar_url?: string;
            html_url?: string;
            site_admin?: boolean;
          }) => ({
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
        return res.data.map(
          (t: {
            id: number;
            slug: string;
            name: string;
            description?: string;
            permission?: string;
            permissions?: RepoTeamInfo['permissions'];
            members_count?: number;
            privacy?: string;
          }) => ({
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
        return res.data.map(
          (m: {
            id: number;
            login: string;
            avatar_url?: string;
            html_url?: string;
            site_admin?: boolean;
          }) => ({
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

    const body: Record<string, unknown> = { role };
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
}

export const governanceTeamsService = new GovernanceTeamsService();

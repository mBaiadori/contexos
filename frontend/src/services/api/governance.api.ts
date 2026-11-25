import type { ApiResponse } from './client';

export const governanceApi = {
  // Project Governance Status & Bootstrap
  async getProjectStatus(): Promise<ApiResponse<any>> {
    const res = await fetch('/api/project/status');
    return { ok: res.ok, data: await res.json() };
  },

  async bootstrapProject(starter_pack = 'standard'): Promise<ApiResponse<any>> {
    const res = await fetch('/api/project/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starter_pack })
    });
    return { ok: res.ok, data: await res.json() };
  },

  // Governance Collaborators, Quorum & Clearance
  async getGovernanceCollaborators(repo?: string): Promise<ApiResponse<{
    collaborators: Array<{
      login: string;
      id: number;
      avatar_url: string;
      html_url: string;
      permission: string;
      role_name?: string;
      departments?: string[];
      allowed_paths?: string[];
      is_owner?: boolean;
      status?: string;
    }>;
    isSoloMode: boolean;
    activeCount: number;
    owner: string;
    resolvedFullName?: string;
    githubAuthError?: string | null;
  }>> {
    const res = await fetch(`/api/governance/collaborators${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`);
    return { ok: res.ok, data: await res.json() };
  },

  async getCollaborators(repo?: string) {
    return governanceApi.getGovernanceCollaborators(repo);
  },

  async inviteCollaborator(payload: {
    username: string;
    permission: string;
    role?: string;
    role_name?: string;
    departments?: string[];
    allowed_paths?: string[];
    denied_paths?: string[];
    repo?: string;
  }): Promise<ApiResponse<{ success: boolean; message: string; collaborator?: Record<string, unknown>; error?: string }>> {
    const res = await fetch('/api/governance/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async removeCollaborator(username: string, repo?: string): Promise<ApiResponse<{ success: boolean; message: string; error?: string }>> {
    const res = await fetch(`/api/governance/collaborators/${encodeURIComponent(username)}${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`, {
      method: 'DELETE'
    });
    return { ok: res.ok, data: await res.json() };
  },

  async updateCollaboratorClearance(payload: {
    username: string;
    role?: string;
    role_name?: string;
    permission?: string;
    departments?: string[];
    allowed_paths?: string[];
    denied_paths?: string[];
    repo?: string;
  }): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const res = await fetch('/api/governance/clearance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async getBranchProtection(repo?: string): Promise<ApiResponse<{
    enabled: boolean;
    required_approving_review_count?: number;
    dismiss_stale_reviews?: boolean;
    enforce_admins?: boolean;
    allow_force_pushes?: boolean;
  }>> {
    const res = await fetch(`/api/governance/branch-protection${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`);
    return { ok: res.ok, data: await res.json() };
  },

  async applyBranchProtection(payload: {
    min_approvals?: number;
    enforce_admins?: boolean;
    dismiss_stale_reviews?: boolean;
    repo?: string;
  }): Promise<ApiResponse<{ success: boolean; message: string; protection: Record<string, unknown>; error?: string }>> {
    const res = await fetch('/api/governance/branch-protection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async getQuorumRules(repo?: string): Promise<ApiResponse<{
    rules: {
      mode: 'auto' | 'manual';
      min_approvals_default: number;
      anti_self_approval: boolean;
      require_review_before_merge: boolean;
      dismiss_stale_reviews_on_push: boolean;
      enforce_admins_on_branch: boolean;
    };
    isSoloMode: boolean;
    activeCollaboratorsCount: number;
    effectiveMinApprovals: number;
  }>> {
    const res = await fetch(`/api/governance/quorum${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`);
    return { ok: res.ok, data: await res.json() };
  },

  async updateQuorumRules(payload: {
    rules: Record<string, unknown>;
    repo?: string;
  }): Promise<ApiResponse<{ success: boolean; rules: Record<string, unknown> }>> {
    const res = await fetch('/api/governance/quorum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async getGovernanceAuditLogs(repo?: string): Promise<ApiResponse<{ logs: Array<Record<string, unknown>> }>> {
    const res = await fetch(`/api/governance/audit-logs${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`);
    return { ok: res.ok, data: await res.json() };
  },

  async createSecureAIToken(payload: {
    user?: string;
    folder?: string;
    repo?: string;
    ttlMinutes?: number;
  }): Promise<ApiResponse<{ token: string; expiresAt: string; error?: string }>> {
    const res = await fetch('/api/governance/ai-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async getDepartments(repo?: string): Promise<ApiResponse<{ departments: Array<Record<string, unknown>> }>> {
    const res = await fetch(`/api/governance/departments${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`);
    return { ok: res.ok, data: await res.json() };
  },

  async saveDepartments(departments: Array<Record<string, unknown>>, repo?: string): Promise<ApiResponse<{ success: boolean; departments: Array<Record<string, unknown>> }>> {
    const res = await fetch('/api/governance/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ departments, repo })
    });
    return { ok: res.ok, data: await res.json() };
  },

  async scanSecrets(repo?: string): Promise<ApiResponse<{ hasSecrets: boolean; violations: Array<Record<string, unknown>> }>> {
    const res = await fetch(`/api/governance/scan-secrets${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`);
    return { ok: res.ok, data: await res.json() };
  },

  async getOrgTeams(org: string): Promise<ApiResponse<{ teams: Array<Record<string, unknown>> }>> {
    const res = await fetch(`/api/governance/orgs/${encodeURIComponent(org)}/teams`);
    return { ok: res.ok, data: await res.json() };
  },

  async getOrgMembers(org: string): Promise<ApiResponse<{ members: Array<Record<string, unknown>> }>> {
    const res = await fetch(`/api/governance/orgs/${encodeURIComponent(org)}/members`);
    return { ok: res.ok, data: await res.json() };
  },

  async getRepoTeams(owner: string, repo: string): Promise<ApiResponse<{ teams: Array<Record<string, unknown>> }>> {
    const res = await fetch(`/api/governance/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/teams`);
    return { ok: res.ok, data: await res.json() };
  },

  async addTeamToRepo(payload: {
    org?: string;
    teamSlug: string;
    owner: string;
    repo: string;
    permission: string;
  }): Promise<ApiResponse<{ success: boolean; message?: string }>> {
    const res = await fetch(`/api/governance/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/teams/${encodeURIComponent(payload.teamSlug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async removeTeamFromRepo(payload: {
    org?: string;
    teamSlug: string;
    owner: string;
    repo: string;
  }): Promise<ApiResponse<{ success: boolean; message?: string }>> {
    const query = payload.org ? `?org=${encodeURIComponent(payload.org)}` : '';
    const res = await fetch(`/api/governance/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/teams/${encodeURIComponent(payload.teamSlug)}${query}`, {
      method: 'DELETE'
    });
    return { ok: res.ok, data: await res.json() };
  },

  async createOrgTeam(payload: {
    org: string;
    name: string;
    description?: string;
    privacy?: 'closed' | 'secret';
  }): Promise<ApiResponse<{ success: boolean; team?: Record<string, unknown>; message?: string }>> {
    const res = await fetch(`/api/governance/orgs/${encodeURIComponent(payload.org)}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: await res.json() };
  },

  async deleteOrgTeam(org: string, teamSlug: string): Promise<ApiResponse<{ success: boolean; message?: string }>> {
    const res = await fetch(`/api/governance/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}`, {
      method: 'DELETE',
    });
    return { ok: res.ok, data: await res.json() };
  },

  async getOrgTeamMembers(org: string, teamSlug: string): Promise<ApiResponse<{ members: Array<Record<string, unknown>> }>> {
    const res = await fetch(`/api/governance/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}/members`);
    return { ok: res.ok, data: await res.json() };
  },

  async addMemberToOrgTeam(
    org: string,
    teamSlug: string,
    username: string,
    role: 'member' | 'maintainer' = 'member'
  ): Promise<ApiResponse<{ success: boolean; message?: string }>> {
    const res = await fetch(
      `/api/governance/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}/members/${encodeURIComponent(username)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      }
    );
    return { ok: res.ok, data: await res.json() };
  },

  async removeMemberFromOrgTeam(
    org: string,
    teamSlug: string,
    username: string
  ): Promise<ApiResponse<{ success: boolean; message?: string }>> {
    const res = await fetch(
      `/api/governance/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}/members/${encodeURIComponent(username)}`,
      {
        method: 'DELETE',
      }
    );
    return { ok: res.ok, data: await res.json() };
  },

  async inviteOrgMember(payload: {
    org: string;
    username?: string;
    email?: string;
    role?: 'admin' | 'direct_member' | 'billing_manager';
    team_ids?: number[];
  }): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const res = await fetch(`/api/governance/orgs/${encodeURIComponent(payload.org)}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: await res.json() };
  },

  async removeOrgMember(org: string, username: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const res = await fetch(`/api/governance/orgs/${encodeURIComponent(org)}/members/${encodeURIComponent(username)}`, {
      method: 'DELETE',
    });
    return { ok: res.ok, data: await res.json() };
  },

  async getEffectiveUserPermission(
    repo?: string,
    org?: string
  ): Promise<ApiResponse<any>> {
    const params = new URLSearchParams();
    if (repo) params.append('repo', repo);
    if (org) params.append('org', org);
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/governance/effective-permission${query}`);
    return { ok: res.ok, data: await res.json() };
  },

  async getGovernanceWorkflow(repo?: string): Promise<ApiResponse<{ installed: boolean; path: string; content?: string }>> {
    const res = await fetch(`/api/governance/actions-workflow${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`);
    return { ok: res.ok, data: await res.json() };
  },

  async installGovernanceWorkflow(repo?: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const res = await fetch('/api/governance/actions-workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo }),
    });
    return { ok: res.ok, data: await res.json() };
  }
};

import { loadConfig } from '../../config/storage.js';
import { callGitHubAPI } from '../../utils/git.js';

export interface RepoInvitation {
  id: number;
  type: 'repository';
  repo_name: string;
  full_name: string;
  owner: string;
  inviter: string;
  permissions: string;
  created_at: string;
  html_url: string;
}

export interface OrgInvitation {
  id: number;
  type: 'org';
  org_login: string;
  org_name: string;
  avatar_url?: string;
  role: string;
  state: string;
}

export interface PendingInvitationsResult {
  repository_invitations: RepoInvitation[];
  org_invitations: OrgInvitation[];
  total: number;
}

export class InvitationsService {
  async getPendingInvitations(): Promise<PendingInvitationsResult> {
    const cfg = loadConfig();
    if (!cfg.authenticated || !cfg.token || cfg.token === 'local_mode') {
      return { repository_invitations: [], org_invitations: [], total: 0 };
    }

    const repoInvitations: RepoInvitation[] = [];
    const orgInvitations: OrgInvitation[] = [];

    // 1. Busca convites para repositórios (/user/repository_invitations)
    try {
      const { statusCode, data } = await callGitHubAPI(
        '/user/repository_invitations',
        cfg.token,
        'GET',
        null,
        { timeoutMs: 6000 }
      );
      if (statusCode === 200 && Array.isArray(data)) {
        for (const item of data) {
          if (item?.id && item?.repository) {
            repoInvitations.push({
              id: item.id,
              type: 'repository',
              repo_name: item.repository.name,
              full_name: item.repository.full_name || `${item.repository.owner?.login}/${item.repository.name}`,
              owner: item.repository.owner?.login || '',
              inviter: item.inviter?.login || 'Administrador',
              permissions: item.permissions || 'write',
              created_at: item.created_at || new Date().toISOString(),
              html_url: item.html_url || `https://github.com/${item.repository.full_name}/invitations`,
            });
          }
        }
      }
    } catch (err) {
      console.warn('[InvitationsService] Erro ao buscar convites de repositórios:', err);
    }

    // 2. Busca convites para organizações (/user/memberships/orgs?state=pending)
    try {
      const { statusCode, data } = await callGitHubAPI(
        '/user/memberships/orgs?state=pending',
        cfg.token,
        'GET',
        null,
        { timeoutMs: 6000 }
      );
      if (statusCode === 200 && Array.isArray(data)) {
        for (const item of data) {
          if (item?.organization?.login) {
            orgInvitations.push({
              id: item.organization.id || 0,
              type: 'org',
              org_login: item.organization.login,
              org_name: item.organization.description || item.organization.login,
              avatar_url: item.organization.avatar_url,
              role: item.role || 'member',
              state: item.state || 'pending',
            });
          }
        }
      }
    } catch (err) {
      console.warn('[InvitationsService] Erro ao buscar convites de organizações:', err);
    }

    return {
      repository_invitations: repoInvitations,
      org_invitations: orgInvitations,
      total: repoInvitations.length + orgInvitations.length,
    };
  }

  async acceptInvitation(payload: {
    type: 'repository' | 'org';
    id?: number | string;
    org?: string;
  }): Promise<{ success: boolean; message?: string; error?: string }> {
    const cfg = loadConfig();
    if (!cfg.authenticated || !cfg.token || cfg.token === 'local_mode') {
      throw new Error('Você precisa estar autenticado no GitHub para aceitar convites.');
    }

    if (payload.type === 'repository') {
      if (!payload.id) {
        throw new Error('ID do convite de repositório é obrigatório.');
      }
      const { statusCode, data } = await callGitHubAPI(
        `/user/repository_invitations/${encodeURIComponent(String(payload.id))}`,
        cfg.token,
        'PATCH'
      );
      if (statusCode === 204 || statusCode === 200) {
        return { success: true, message: 'Convite para o repositório aceito com sucesso!' };
      }
      throw new Error(`Falha ao aceitar convite: ${data?.message || `HTTP ${statusCode}`}`);
    }

    if (payload.type === 'org') {
      const orgLogin = payload.org;
      if (!orgLogin) {
        throw new Error('Nome da organização é obrigatório.');
      }
      const { statusCode, data } = await callGitHubAPI(
        `/user/memberships/orgs/${encodeURIComponent(orgLogin)}`,
        cfg.token,
        'PATCH',
        { state: 'active' }
      );
      if (statusCode === 200) {
        return { success: true, message: `Convite para a organização ${orgLogin} aceito com sucesso!` };
      }
      throw new Error(
        data?.message || `Falha ao aceitar convite da organização (HTTP ${statusCode}).`
      );
    }

    throw new Error(`Tipo de convite inválido: ${payload.type}`);
  }

  async declineInvitation(payload: {
    type: 'repository' | 'org';
    id?: number | string;
    org?: string;
  }): Promise<{ success: boolean; message?: string; error?: string }> {
    const cfg = loadConfig();
    if (!cfg.authenticated || !cfg.token || cfg.token === 'local_mode') {
      throw new Error('Você precisa estar autenticado no GitHub para recusar convites.');
    }

    if (payload.type === 'repository') {
      if (!payload.id) {
        throw new Error('ID do convite de repositório é obrigatório.');
      }
      const { statusCode, data } = await callGitHubAPI(
        `/user/repository_invitations/${encodeURIComponent(String(payload.id))}`,
        cfg.token,
        'DELETE'
      );
      if (statusCode === 204 || statusCode === 200) {
        return { success: true, message: 'Convite do repositório recusado.' };
      }
      throw new Error(
        data?.message || `Falha ao recusar convite (HTTP ${statusCode}).`
      );
    }

    if (payload.type === 'org') {
      const orgLogin = payload.org;
      if (!orgLogin) {
        throw new Error('Nome da organização é obrigatório.');
      }
      const { statusCode, data } = await callGitHubAPI(
        `/user/memberships/orgs/${encodeURIComponent(orgLogin)}`,
        cfg.token,
        'DELETE'
      );
      if (statusCode === 204 || statusCode === 200) {
        return { success: true, message: `Convite da organização ${orgLogin} recusado.` };
      }
      throw new Error(
        data?.message || `Falha ao recusar convite da organização (HTTP ${statusCode}).`
      );
    }

    throw new Error(`Tipo de convite inválido: ${payload.type}`);
  }
}

export const invitationsService = new InvitationsService();


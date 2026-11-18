import type { Repo, RepoDiagnosis, RepoInitializePayload, TreeNode, DocumentMetadataItem } from '../../types';
import { safeParseJson, type ApiResponse } from './client';

export const reposApi = {
  async getRepos(org?: string): Promise<ApiResponse<{ repos: Repo[]; auth_error?: string; authenticated?: boolean; active_repo?: Repo }>> {
    const url = org ? `/api/repos?org=${encodeURIComponent(org)}` : '/api/repos';
    const res = await fetch(url);
    return { ok: res.ok, data: await safeParseJson(res, { repos: [] }) };
  },

  async createRepo(payload: { 
    name: string; 
    owner?: string; 
    description?: string; 
    enable_protection?: boolean; 
    required_approvals?: number; 
    is_private?: boolean;
    initialTeams?: Array<{ slug: string; permission?: string }>;
    initialCollaborators?: Array<{ username: string; permission?: string }>;
  }): Promise<ApiResponse<any>> {
    const res = await fetch('/api/repos/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async selectRepo(repo: Partial<Repo>): Promise<ApiResponse<{ success: boolean; is_ready?: boolean; active_repo?: Repo; diagnosis?: RepoDiagnosis; error?: string }>> {
    const res = await fetch('/api/repos/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(repo)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async cloneLocalRepo(payload: { name: string; owner?: string }): Promise<ApiResponse<{ success: boolean; message: string; repo_dir?: string; is_cloned_locally?: boolean; error?: string }>> {
    const res = await fetch('/api/repos/clone-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async pullLocalRepo(payload: { repo: string; owner?: string; branch?: string }): Promise<ApiResponse<{ success: boolean; message: string; error?: string }>> {
    const res = await fetch('/api/git/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async diagnoseRepo(name: string): Promise<ApiResponse<RepoDiagnosis>> {
    const res = await fetch('/api/repos/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    return { ok: res.ok, data: await res.json() };
  },

  async initializeRepo(payload: RepoInitializePayload): Promise<ApiResponse<{ success: boolean; message: string; active_repo: Repo; diagnosis?: RepoDiagnosis; error?: string }>> {
    const res = await fetch('/api/repos/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async getOrgs(): Promise<ApiResponse<{ orgs: Array<{ login: string; full_name?: string; avatar_url?: string; description?: string }> }>> {
    const res = await fetch('/api/repos/orgs');
    return { ok: res.ok, data: await res.json() };
  },

  async createOrg(payload: { username: string; full_name?: string; description?: string; visibility?: string }): Promise<ApiResponse<{ success: boolean; org?: any; requires_web_flow?: boolean; web_url?: string; message?: string; error?: string }>> {
    const res = await fetch('/api/repos/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async deleteRepo(payload: {
    name: string;
    owner?: string;
    delete_remote?: boolean;
    delete_local?: boolean;
  }): Promise<ApiResponse<any>> {
    const res = await fetch('/api/repos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async updateRepo(payload: {
    current_name: string;
    new_name?: string;
    description?: string;
    is_private?: boolean;
    owner?: string;
  }): Promise<ApiResponse<{ success: boolean; remoteUpdated?: boolean; message?: string; repo?: any; error?: string }>> {
    const res = await fetch('/api/repos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async cloneRepo(payload: {
    source_name: string;
    new_name: string;
    owner?: string;
    description?: string;
    is_private?: boolean;
  }): Promise<ApiResponse<{ success: boolean; message?: string; repo?: any; error?: string }>> {
    const res = await fetch('/api/repos/clone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async getProjectFile(path: string, repo?: string): Promise<{ path: string; content: string; meta?: any; source?: string; error?: string }> {
    const res = await fetch(`/api/project/file?path=${encodeURIComponent(path)}${repo ? `&repo=${encodeURIComponent(repo)}` : ''}`);
    return res.json();
  },

  async createProjectFile(payload: { path: string; is_folder?: boolean; content?: string; meta?: any; templateId?: string; repo?: string }): Promise<ApiResponse<any>> {
    const res = await fetch('/api/project/file/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async importFiles(payload: {
    target_folder?: string;
    files: Array<{
      name: string;
      relativePath?: string;
      content?: string;
      base64?: string;
      meta?: any;
    }>;
    repo?: string;
  }): Promise<ApiResponse<{ success: boolean; importedFiles: Array<{ path: string; name: string; isBinary: boolean; size: number }>; errors?: string[]; error?: string; tree?: TreeNode[] }>> {
    const res = await fetch('/api/project/files/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async deleteProjectFile(path: string, repo?: string): Promise<ApiResponse<any>> {
    const res = await fetch(`/api/project/file?path=${encodeURIComponent(path)}${repo ? `&repo=${encodeURIComponent(repo)}` : ''}`, {
      method: 'DELETE'
    });
    return { ok: res.ok, data: await res.json() };
  },

  async duplicateProjectFile(path: string, repo?: string): Promise<ApiResponse<{
    success: boolean;
    originalPath?: string;
    newPath?: string;
    repo?: string;
    tree?: TreeNode[];
    error?: string;
  }>> {
    const res = await fetch('/api/project/file/duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, repo }),
    });
    return { ok: res.ok, data: await res.json() };
  },

  async renameProjectFile(payload: {
    old_path: string;
    new_path: string;
    repo?: string;
    source_repo?: string;
    target_repo?: string;
  }): Promise<ApiResponse<any>> {
    const res = await fetch('/api/project/file/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: await res.json() };
  },

  async moveProjectFile(payload: {
    source_path: string;
    target_path: string;
    source_repo?: string;
    target_repo?: string;
  }): Promise<ApiResponse<{
    success: boolean;
    sourceRepo?: string;
    targetRepo?: string;
    oldPath?: string;
    newPath?: string;
    sourceTree?: TreeNode[];
    targetTree?: TreeNode[];
    error?: string;
  }>> {
    const res = await fetch('/api/project/file/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: await res.json() };
  },

  async openInOS(path?: string, repo?: string): Promise<ApiResponse<{ success?: boolean; message?: string; fullPath?: string; error?: string }>> {
    const res = await fetch('/api/project/open-in-os', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, repo })
    });
    return { ok: res.ok, data: await res.json() };
  },

  async getProjectTree(repo?: string, org?: string): Promise<{ repo: Repo; tree: TreeNode[] }> {
    const params = new URLSearchParams();
    if (repo) params.set('repo', repo);
    if (org) params.set('org', org);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/project/tree${qs}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `Erro ao carregar árvore (${res.status})`);
    }
    return data;
  },

  async getProjectMetadata(repo?: string): Promise<ApiResponse<DocumentMetadataItem[]>> {
    const res = await fetch(`/api/project/metadata${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`);
    return { ok: res.ok, data: await res.json() };
  },

  async getProjectMetadataOptions(repo?: string): Promise<ApiResponse<{ categories: string[]; statuses: Array<{ key: string; label: string; badge?: string }>; tags: string[] }>> {
    const res = await fetch(`/api/project/metadata/options${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`);
    return { ok: res.ok, data: await res.json() };
  },

  async getProjectConfig(repo?: string): Promise<ApiResponse<any>> {
    const res = await fetch(`/api/project/config${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`);
    return { ok: res.ok, data: await res.json() };
  },

  async saveProjectConfig(configData: any, repo?: string): Promise<ApiResponse<any>> {
    const res = await fetch('/api/project/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: configData, repo })
    });
    return { ok: res.ok, data: await res.json() };
  },

  async updateDocumentMetadataItem(payload: { path: string; meta: Partial<DocumentMetadataItem>; repo?: string }): Promise<ApiResponse<{ success: boolean; meta: DocumentMetadataItem; tree: TreeNode[] }>> {
    const res = await fetch('/api/project/metadata/item', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async syncFrontmatters(repo?: string): Promise<ApiResponse<{ success: boolean; synced: number; total: number }>> {
    const res = await fetch('/api/project/metadata/sync-frontmatters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo })
    });
    return { ok: res.ok, data: await res.json() };
  },

  async reconcileMetadata(repo?: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const res = await fetch('/api/project/metadata/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo })
    });
    return { ok: res.ok, data: await res.json() };
  },

  async getDocumentContext(path: string, repo?: string): Promise<any> {
    const res = await fetch(`/api/project/document-context?path=${encodeURIComponent(path)}${repo ? `&repo=${encodeURIComponent(repo)}` : ''}`);
    return res.json();
  },

  async scaffoldEntity(data: any): Promise<ApiResponse<any>> {
    const res = await fetch('/api/project/scaffold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return { ok: res.ok, data: await res.json() };
  },
};

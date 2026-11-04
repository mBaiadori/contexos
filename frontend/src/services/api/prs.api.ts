import type { PR, Repo } from '../../types';
import type { ApiResponse } from './client';

export const prsApi = {
  async getPRs(
    repo?: string,
    params?: { page?: number; limit?: number; status?: string; search?: string }
  ): Promise<{ 
    prs: PR[]; 
    repo?: Repo; 
    selected_repo?: string; 
    all_prs_count?: number; 
    total?: number;
    page?: number;
    limit?: number;
    total_pages?: number;
    counts?: { all: number; open: number; merged: number; closed: number };
    repoOpenCounts?: Record<string, number>;
    available_repos?: Array<{ name: string; count: number }>;
    governance?: any; 
  }> {
    const q = new URLSearchParams();
    if (repo) q.set('repo', repo);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.status && params.status !== 'all') q.set('status', params.status);
    if (params?.search) q.set('search', params.search);
    const queryString = q.toString() ? `?${q.toString()}` : '';
    const res = await fetch(`/api/prs${queryString}`);
    return res.json();
  },

  async checkConflicts(
    files?: string[],
    repo?: string
  ): Promise<ApiResponse<{ hasConflicts: boolean; conflicts: Array<{ id: number | string; title: string; branch: string; author?: string; matchingFiles: string[] }> }>> {
    const res = await fetch('/api/prs/check-conflicts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files, repo }),
    });
    return { ok: res.ok, data: await res.json() };
  },

  async createPR(payload: { title: string; content?: string; path?: string; repo?: string }): Promise<ApiResponse<any>> {
    const res = await fetch('/api/prs/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async approvePR(
    id: number | string,
    options?: { approver?: string; role?: string; comment?: string; repo?: string }
  ): Promise<ApiResponse<any>> {
    const res = await fetch('/api/prs/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...(options || {}) })
    });
    return { ok: res.ok, data: await res.json() };
  },

  async getPRFile(params: {
    pr_id: number | string;
    path: string;
    repo?: string;
  }): Promise<ApiResponse<{ pr_id: number | string; branch: string; head_sha: string; filePath: string; content: string }>> {
    const query = new URLSearchParams();
    query.set('pr_id', String(params.pr_id));
    query.set('path', params.path);
    if (params.repo) query.set('repo', params.repo);
    const res = await fetch(`/api/prs/file?${query.toString()}`);
    return { ok: res.ok, data: await res.json() };
  },

  async editPRFile(payload: {
    id: number | string;
    filePath: string;
    content: string;
    commitMessage?: string;
    expectedBaseSha?: string;
    author?: string;
    repo?: string;
  }): Promise<ApiResponse<any>> {
    const res = await fetch('/api/prs/edit-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async getPRMergeability(params: {
    pr_id: number | string;
    repo?: string;
  }): Promise<ApiResponse<{ mergeable: boolean; behind_by: number; ahead_by: number; conflicts: Array<{ path: string; is_encrypted: boolean }> }>> {
    const query = new URLSearchParams();
    query.set('pr_id', String(params.pr_id));
    if (params.repo) query.set('repo', params.repo);
    const res = await fetch(`/api/prs/mergeability?${query.toString()}`);
    return { ok: res.ok, data: await res.json() };
  },

  async getPRConflict(params: {
    pr_id: number | string;
    path: string;
    repo?: string;
  }): Promise<ApiResponse<{ filePath: string; base: string; ours: string; theirs: string; merged: string; hasConflicts: boolean; conflictCount: number }>> {
    const query = new URLSearchParams();
    query.set('pr_id', String(params.pr_id));
    query.set('path', params.path);
    if (params.repo) query.set('repo', params.repo);
    const res = await fetch(`/api/prs/conflict?${query.toString()}`);
    return { ok: res.ok, data: await res.json() };
  },

  async resolvePRConflict(payload: {
    pr_id: number | string;
    filePath: string;
    resolvedContent: string;
    repo?: string;
  }): Promise<ApiResponse<{ success?: boolean; commitHash?: string; error?: string }>> {
    const res = await fetch('/api/prs/resolve-conflict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async updatePRFromBase(payload: {
    pr_id: number | string;
    repo?: string;
  }): Promise<ApiResponse<{ success?: boolean; message?: string; newCommitHash?: string; error?: string }>> {
    const res = await fetch('/api/prs/update-from-base', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async mergePR(id: number | string, repo?: string): Promise<ApiResponse<any>> {
    const res = await fetch('/api/prs/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, repo })
    });
    return { ok: res.ok, data: await res.json() };
  },

  async rejectPR(id: number | string, reason?: string, repo?: string): Promise<ApiResponse<any>> {
    const res = await fetch('/api/prs/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, reason, repo })
    });
    return { ok: res.ok, data: await res.json() };
  },

  async rollbackVersion(payload: { id?: number | string; commit_hash?: string; repo?: string }): Promise<ApiResponse<{ success?: boolean; message?: string; new_commit_hash?: string; error?: string }>> {
    const res = await fetch('/api/prs/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async getPRFileDiff(params: { path: string; commit?: string; pr_id?: number | string; repo?: string }): Promise<ApiResponse<{ diff: string; old_content?: string; new_content?: string; additions?: number; deletions?: number; restricted?: boolean; error?: string; message?: string }>> {
    const query = new URLSearchParams();
    query.set('path', params.path);
    if (params.commit) query.set('commit', params.commit);
    if (params.pr_id) query.set('pr_id', String(params.pr_id));
    if (params.repo) query.set('repo', params.repo);
    const res = await fetch(`/api/prs/file-diff?${query.toString()}`);
    return { ok: res.ok, data: await res.json() };
  },
};

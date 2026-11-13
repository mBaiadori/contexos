import type { GitStatus, GitCommitInfo, WhatsNewSummary, VersionGraphData, SafeSwitchResult, StashDetails, DiscardedDraftItem } from '../../types';
import type { ApiResponse } from './client';

export const gitApi = {
  async getFileBlame(path: string): Promise<ApiResponse<any>> {
    const res = await fetch(`/api/git/blame?path=${encodeURIComponent(path)}`);
    return { ok: res.ok, data: await res.json() };
  },

  async getFileGitHistory(path: string, limit = 30): Promise<ApiResponse<{ repo_name: string; file_path: string; commits: GitCommitInfo[] }>> {
    const res = await fetch(`/api/git/file-history?path=${encodeURIComponent(path)}&limit=${limit}`);
    return { ok: res.ok, data: await res.json() };
  },

  async getFileVersion(path: string, hash: string): Promise<ApiResponse<{ success: boolean; content: string; error?: string }>> {
    const res = await fetch(`/api/git/file-version?path=${encodeURIComponent(path)}&hash=${encodeURIComponent(hash)}`);
    return { ok: res.ok, data: await res.json() };
  },

  async getGitStatus(repo?: string): Promise<ApiResponse<GitStatus>> {
    const res = await fetch(`/api/git/status${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`);
    return { ok: res.ok, data: await res.json() };
  },

  async getGitLog(limit = 20, repo?: string): Promise<ApiResponse<{ repo_name: string; commits: GitCommitInfo[] }>> {
    const res = await fetch(`/api/git/log?limit=${limit}${repo ? `&repo=${encodeURIComponent(repo)}` : ''}`);
    return { ok: res.ok, data: await res.json() };
  },

  async getGitBranches(repo?: string): Promise<ApiResponse<{ current: string; branches: string[] }>> {
    const res = await fetch(`/api/git/branches${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`);
    return { ok: res.ok, data: await res.json() };
  },

  async getVersionGraph(repo?: string): Promise<ApiResponse<VersionGraphData>> {
    const res = await fetch(`/api/git/version-graph${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`);
    return { ok: res.ok, data: await res.json() };
  },

  async safeSwitch(payload: {
    branch?: string;
    commitHash?: string;
    repo?: string;
    action?: 'check' | 'switch' | 'stash' | 'discard';
  }): Promise<ApiResponse<SafeSwitchResult>> {
    const res = await fetch('/api/git/safe-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: await res.json() };
  },

  async popStash(payload?: { repo?: string; stashId?: string }): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const res = await fetch('/api/git/stash-pop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    return { ok: res.ok, data: await res.json() };
  },

  async dropStash(payload?: { repo?: string; stashId?: string }): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const res = await fetch('/api/git/stash-drop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    return { ok: res.ok, data: await res.json() };
  },

  async clearStash(payload?: { repo?: string }): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const res = await fetch('/api/git/stash-clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    return { ok: res.ok, data: await res.json() };
  },

  async createOrSwitchBranch(
    branch: string,
    repo?: string,
    baseBranch?: string,
    displayTitle?: string,
  ): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const res = await fetch('/api/git/branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch, repo, baseBranch, displayTitle })
    });
    return { ok: res.ok, data: await res.json() };
  },

  async mergeBranch(payload: {
    sourceBranch: string;
    targetBranch?: string;
    message?: string;
    repo?: string;
  }): Promise<ApiResponse<{ success: boolean; message: string; commitHash?: string; hasConflicts?: boolean; conflictFiles?: string[] }>> {
    const res = await fetch('/api/git/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: await res.json() };
  },

  async commitGitChanges(payload: { message: string; files?: string[]; repo?: string }): Promise<ApiResponse<{ success: boolean; message: string; commitHash?: string }>> {
    const res = await fetch('/api/git/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async syncGit(branch?: string, repo?: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const res = await fetch('/api/git/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch, repo })
    });
    return { ok: res.ok, data: await res.json() };
  },

  async checkRemoteGitUpdates(repo?: string, branch?: string): Promise<ApiResponse<{ hasUpdates: boolean; localHash: string; remoteHash?: string; branch?: string; error?: string }>> {
    const params = new URLSearchParams();
    if (repo) params.set('repo', repo);
    if (branch) params.set('branch', branch);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/git/check-remote${qs}`);
    return { ok: res.ok, data: await res.json() };
  },

  async getGitDiff(path?: string, repo?: string): Promise<ApiResponse<{ diff: string }>> {
    const params = new URLSearchParams();
    if (path) params.set('path', path);
    if (repo) params.set('repo', repo);
    const query = params.toString();
    const url = query ? `/api/git/diff?${query}` : '/api/git/diff';
    const res = await fetch(url);
    return { ok: res.ok, data: await res.json() };
  },

  async getGitDiagnostic(): Promise<ApiResponse<{ version: string; installed: boolean }>> {
    const res = await fetch('/api/git/diagnostic');
    return { ok: res.ok, data: await res.json() };
  },

  async getWhatsNew(lastSeenHash?: string, repo?: string): Promise<ApiResponse<WhatsNewSummary>> {
    const params = new URLSearchParams();
    if (lastSeenHash) params.set('lastSeenHash', lastSeenHash);
    if (repo) params.set('repo', repo);
    const query = params.toString();
    const url = query ? `/api/git/whats-new?${query}` : '/api/git/whats-new';
    const res = await fetch(url);
    return { ok: res.ok, data: await res.json() };
  },

  async getWhatsNewFileDiff(path: string, lastSeenHash?: string, repo?: string): Promise<ApiResponse<{ diff: string }>> {
    const query = new URLSearchParams({ path });
    if (lastSeenHash) query.set('lastSeenHash', lastSeenHash);
    if (repo) query.set('repo', repo);
    const res = await fetch(`/api/git/whats-new-diff?${query.toString()}`);
    return { ok: res.ok, data: await res.json() };
  },

  async getStashDetails(stashId?: string, repo?: string): Promise<ApiResponse<StashDetails>> {
    const params = new URLSearchParams();
    if (stashId) params.set('stashId', stashId);
    if (repo) params.set('repo', repo);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/git/stash-details${qs}`);
    return { ok: res.ok, data: await res.json() };
  },

  async getTrash(repo?: string): Promise<ApiResponse<{ trash: DiscardedDraftItem[] }>> {
    const params = new URLSearchParams();
    if (repo) params.set('repo', repo);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/git/trash${qs}`);
    return { ok: res.ok, data: await res.json() };
  },

  async restoreTrash(id: string, repo?: string): Promise<ApiResponse<{ success: boolean; message: string; appliedFiles?: string[] }>> {
    const res = await fetch('/api/git/trash/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, repo }),
    });
    return { ok: res.ok, data: await res.json() };
  },

  async deleteTrashItem(id: string, repo?: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const params = new URLSearchParams();
    if (repo) params.set('repo', repo);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/git/trash/${encodeURIComponent(id)}${qs}`, {
      method: 'DELETE',
    });
    return { ok: res.ok, data: await res.json() };
  },

  async clearTrash(repo?: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const params = new URLSearchParams();
    if (repo) params.set('repo', repo);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/git/trash${qs}`, {
      method: 'DELETE',
    });
    return { ok: res.ok, data: await res.json() };
  },
};

import type { WorkspaceChange } from '../../types';
import type { ApiResponse } from './client';

export const workspaceApi = {
  async getWorkspaceChanges(repo?: string): Promise<{ 
    changes: WorkspaceChange[]; 
    system_changes?: WorkspaceChange[];
    total_additions: number; 
    total_deletions: number; 
    guardrail: string;
  }> {
    const res = await fetch(`/api/workspace/changes${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`);
    return res.json();
  },

  async saveWorkspaceFile(payload: { path: string; content: string; meta?: any; repo?: string }): Promise<ApiResponse<any>> {
    const res = await fetch('/api/workspace/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async saveProjectFile(payload: { path: string; content: string; meta?: any; repo?: string }): Promise<ApiResponse<any>> {
    return workspaceApi.saveWorkspaceFile(payload);
  },

  async generatePRSummaryAI(repo?: string): Promise<ApiResponse<{ success?: boolean; title?: string; description?: string; is_ai_generated?: boolean }>> {
    const res = await fetch('/api/workspace/generate-pr-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(repo ? { repo } : {})
    });
    return { ok: res.ok, data: await res.json() };
  },

  async createUnifiedPR(payload: {
    title: string;
    description: string;
    branch?: string;
    targetProposalId?: number | string;
    repo?: string;
  }): Promise<ApiResponse<any>> {
    const res = await fetch('/api/workspace/create-pr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async discardWorkspaceChanges(path: string | null = null, repo?: string): Promise<ApiResponse<any>> {
    const res = await fetch('/api/workspace/discard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(path ? { path, repo } : { repo })
    });
    return { ok: res.ok, data: await res.json() };
  },
};

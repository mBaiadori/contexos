import type { ApiResponse } from './client';

export const systemApi = {
  async getSettings(): Promise<any> {
    const res = await fetch('/api/settings');
    return res.json();
  },

  async saveSettings(settings: Record<string, unknown>): Promise<ApiResponse<{ success?: boolean; error?: string }>> {
    const res = await fetch('/api/settings/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings })
    });
    return { ok: res.ok, data: await res.json() };
  },

  async getOnboardingStatus(): Promise<{ needed: boolean; stepCompleted: { license: boolean; ai: boolean; workspace: boolean } }> {
    const res = await fetch('/api/system/onboarding/status');
    return res.json();
  },

  async completeOnboarding(payload: {
    license_key?: string;
    ai_provider?: string;
    ai_model?: string;
    ai_api_key?: string;
    create_demo_workspace?: boolean;
    workspace_name?: string;
  }): Promise<ApiResponse<{ success: boolean; active_repo: string }>> {
    const res = await fetch('/api/system/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async getDiagnostics(): Promise<ApiResponse<any>> {
    const res = await fetch('/api/system/diagnostics');
    return { ok: res.ok, data: await res.json() };
  },

  async getLicenseStatus(): Promise<ApiResponse<any>> {
    const res = await fetch('/api/system/license');
    return { ok: res.ok, data: await res.json() };
  },

  async activateLicense(key: string): Promise<ApiResponse<{ success: boolean; message: string; license: Record<string, unknown> }>> {
    const res = await fetch('/api/system/license/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    return { ok: res.ok, data: await res.json() };
  },

  async createDemoWorkspace(name?: string): Promise<ApiResponse<{ success: boolean; path: string }>> {
    const res = await fetch('/api/workspace/demo/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    return { ok: res.ok, data: await res.json() };
  },
};

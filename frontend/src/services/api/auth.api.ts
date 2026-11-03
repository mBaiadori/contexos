import type { WorkspaceStatus, User, SavedAccount, PendingInvitationsResult } from '../../types';
import { safeParseJson, type ApiResponse } from './client';

export const authApi = {
  async getStatus(): Promise<WorkspaceStatus> {
    const res = await fetch('/api/status');
    return safeParseJson(res, { authenticated: false } as WorkspaceStatus);
  },

  async loginWithToken(token: string): Promise<ApiResponse<{ success?: boolean; user?: User; error?: string }>> {
    const res = await fetch('/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    return { ok: res.ok, data: await safeParseJson(res) };
  },

  async requestDeviceCode(clientId?: string): Promise<ApiResponse<{
    success: boolean;
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    expires_in?: number;
    interval?: number;
    error?: string;
  }>> {
    const res = await fetch('/api/auth/device/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId })
    });
    return { ok: res.ok, data: await safeParseJson(res) };
  },

  async pollDeviceToken(deviceCode: string, clientId?: string): Promise<ApiResponse<{
    status: 'pending' | 'slow_down' | 'expired' | 'denied' | 'success' | 'error';
    interval?: number;
    error?: string;
    message?: string;
    authenticated?: boolean;
    user?: User;
    orgs?: any[];
    accounts?: SavedAccount[];
  }>> {
    const res = await fetch('/api/auth/device/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: deviceCode, client_id: clientId })
    });
    return { ok: res.ok, data: await safeParseJson(res) };
  },

  async getAccounts(): Promise<ApiResponse<{ accounts: SavedAccount[] }>> {
    const res = await fetch('/api/auth/accounts');
    return { ok: res.ok, data: await safeParseJson(res, { accounts: [] }) };
  },

  async switchAccount(accountId: string): Promise<ApiResponse<{ success?: boolean; user?: User; error?: string; accounts?: SavedAccount[] }>> {
    const res = await fetch('/api/auth/accounts/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId })
    });
    return { ok: res.ok, data: await safeParseJson(res) };
  },

  async removeAccount(accountId: string): Promise<ApiResponse<{ success?: boolean; accounts?: SavedAccount[]; user?: User; authenticated?: boolean }>> {
    const res = await fetch(`/api/auth/accounts/${encodeURIComponent(accountId)}`, {
      method: 'DELETE'
    });
    return { ok: res.ok, data: await safeParseJson(res) };
  },

  async logout(): Promise<{ success: boolean }> {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    return safeParseJson(res, { success: true });
  },

  async getPendingInvitations(): Promise<ApiResponse<PendingInvitationsResult>> {
    const res = await fetch('/api/auth/invitations');
    return {
      ok: res.ok,
      data: await safeParseJson(res, { repository_invitations: [], org_invitations: [], total: 0 }),
    };
  },

  async acceptInvitation(payload: {
    type: 'repository' | 'org';
    id?: number | string;
    org?: string;
  }): Promise<ApiResponse<{ success?: boolean; message?: string; error?: string }>> {
    const res = await fetch('/api/auth/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: await safeParseJson(res) };
  },

  async declineInvitation(payload: {
    type: 'repository' | 'org';
    id?: number | string;
    org?: string;
  }): Promise<ApiResponse<{ success?: boolean; message?: string; error?: string }>> {
    const res = await fetch('/api/auth/invitations/decline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: await safeParseJson(res) };
  },
};

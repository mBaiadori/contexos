import type { AISettingsState, ToolCallRecord, AgentDefinition, MCPServerDefinition, ToolItem, CustomToolItem, CommunityToolItem, ChatMediaAttachment } from '../../types';
import type { ApiResponse } from './client';

export const aiApi = {
  async askAI(payload: { prompt: string; content?: string; path?: string; history?: any[] }): Promise<ApiResponse<any>> {
    return aiApi.sendChatMessage(payload);
  },

  async sendChatMessage(payload: { 
    prompt: string; 
    content?: string; 
    path?: string; 
    history?: any[]; 
    assistant_prompt?: string; 
    raw_mode?: boolean;
    session_id?: string; 
    repo?: string;
    skill_id?: string;
    allowed_tools?: string[];
    provider_id?: string;
    attachments?: Array<Omit<ChatMediaAttachment, 'previewUrl'>>;
  }): Promise<ApiResponse<{ reply: string; diff?: any; actions?: any[]; tool_calls?: ToolCallRecord[]; steps_count?: number; provider?: string; model?: string; usage?: any; telemetry_turn?: any }>> {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async streamChatMessage(
    payload: {
      prompt: string;
      content?: string;
      path?: string;
      history?: any[];
      assistant_prompt?: string;
      raw_mode?: boolean;
      session_id?: string;
      repo?: string;
      skill_id?: string;
      allowed_tools?: string[];
      provider_id?: string;
      attachments?: Array<Omit<ChatMediaAttachment, 'previewUrl'>>;
    },
    onEvent: (event: any) => void
  ): Promise<void> {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Falha no streaming: ${res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            onEvent(data);
          } catch {}
        }
      }
    }
  },

  async getAIProviders(): Promise<ApiResponse<{ providers: Array<{ id: string; name: string; description: string; mode: string; isAvailable: boolean; isAuthenticated: boolean; statusMessage?: string; models?: Array<{ id: string; name: string; badge?: string }> }> }>> {
    const res = await fetch('/api/ai/providers');
    return { ok: res.ok, data: await res.json() };
  },

  async sendSessionApproval(payload: { session_id: string; approved: boolean; custom_input?: string; provider_id?: string }): Promise<ApiResponse<any>> {
    const res = await fetch('/api/ai/session/approval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: await res.json() };
  },

  async stopSession(payload: { session_id: string; provider_id?: string }): Promise<ApiResponse<any>> {
    const res = await fetch('/api/ai/session/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: await res.json() };
  },

  async getMemoryBrief(params: { repo?: string; path?: string } = {}): Promise<ApiResponse<any>> {
    const query = new URLSearchParams();
    if (params.repo) query.set('repo', params.repo);
    if (params.path) query.set('path', params.path);
    const res = await fetch(`/api/chat/memory/brief?${query.toString()}`);
    return { ok: res.ok, data: await res.json() };
  },

  async getMemoryHistory(params: { repo?: string; path?: string } = {}): Promise<ApiResponse<any>> {
    const query = new URLSearchParams();
    if (params.repo) query.set('repo', params.repo);
    if (params.path) query.set('path', params.path);
    const res = await fetch(`/api/chat/memory/history?${query.toString()}`);
    return { ok: res.ok, data: await res.json() };
  },

  async getMemorySession(params: { repo?: string; session_id?: string } = {}): Promise<ApiResponse<any>> {
    const query = new URLSearchParams();
    if (params.repo) query.set('repo', params.repo);
    if (params.session_id) query.set('session_id', params.session_id);
    const res = await fetch(`/api/chat/memory/session?${query.toString()}`);
    return { ok: res.ok, data: await res.json() };
  },

  async deleteMemorySession(params: { repo?: string; session_id: string }): Promise<ApiResponse<any>> {
    const query = new URLSearchParams();
    if (params.repo) query.set('repo', params.repo);
    query.set('session_id', params.session_id);
    const res = await fetch(`/api/chat/memory/session?${query.toString()}`, {
      method: 'DELETE'
    });
    return { ok: res.ok, data: await res.json() };
  },

  async getMemoryWiki(params: { repo?: string; category?: string; query?: string } = {}): Promise<ApiResponse<any>> {
    const query = new URLSearchParams();
    if (params.repo) query.set('repo', params.repo);
    if (params.category && params.category !== 'all') query.set('category', params.category);
    if (params.query) query.set('q', params.query);
    const res = await fetch(`/api/chat/memory/wiki?${query.toString()}`);
    return { ok: res.ok, data: await res.json() };
  },

  async saveMemoryWikiEntry(payload: { repo?: string; category: string; slug: string; title: string; content: string }): Promise<ApiResponse<any>> {
    const res = await fetch('/api/chat/memory/wiki', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async deleteMemoryWikiEntry(payload: { repo?: string; category: string; slug: string }): Promise<ApiResponse<any>> {
    const res = await fetch('/api/chat/memory/wiki/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async resetMemoryScope(payload: { repo?: string; scope: string }): Promise<ApiResponse<any>> {
    const res = await fetch('/api/chat/memory/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async finalizeMemorySession(payload: { repo?: string; path?: string; session_id?: string; summary?: string }): Promise<ApiResponse<any>> {
    const res = await fetch('/api/chat/memory/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  async getMemoryActor(): Promise<ApiResponse<any>> {
    const res = await fetch('/api/chat/memory/actor');
    return { ok: res.ok, data: await res.json() };
  },

  async getAISettings(): Promise<ApiResponse<AISettingsState>> {
    const res = await fetch('/api/ai/settings');
    return { ok: res.ok, data: await res.json() };
  },

  async getAIModels(params: { provider?: string; api_key?: string; custom_endpoint?: string } = {}): Promise<ApiResponse<{
    provider?: string;
    models: string[];
    detailedModels?: Array<{ id: string; name: string; description?: string }>;
    isDynamic?: boolean;
    message?: string;
    error?: string;
  }>> {
    const res = await fetch('/api/ai/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return { ok: res.ok, data: await res.json() };
  },

  async saveAISettings(payload: {
    provider?: string;
    model?: string;
    api_key?: string;
    custom_endpoint?: string;
    default_provider?: string;
    antigravity_cli_path?: string;
    claude_cli_path?: string;
    agent_effort?: 'low' | 'medium' | 'high';
    agent_model?: string;
    claude_model?: string;
  }): Promise<ApiResponse<any>> {
    const res = await fetch('/api/ai/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, data: await res.json() };
  },

  // --- AI Center: Agents ---
  async getAgentsHub(): Promise<ApiResponse<{ agents: AgentDefinition[] }>> {
    const res = await fetch('/api/aicenter/agents/hub');
    return { ok: res.ok, data: await res.json() };
  },

  async getAgentsProject(repo?: string): Promise<ApiResponse<{ repo: string; agents: AgentDefinition[] }>> {
    const qs = repo ? `?repo=${encodeURIComponent(repo)}` : '';
    const res = await fetch(`/api/aicenter/agents/project${qs}`);
    return { ok: res.ok, data: await res.json() };
  },

  async installAgent(agentId: string, repo?: string): Promise<ApiResponse<{ success: boolean; agent: AgentDefinition }>> {
    const res = await fetch('/api/aicenter/agents/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId, repo })
    });
    return { ok: res.ok, data: await res.json() };
  },

  async uninstallAgent(agentId: string, repo?: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const qs = repo ? `?repo=${encodeURIComponent(repo)}` : '';
    const res = await fetch(`/api/aicenter/agents/uninstall/${encodeURIComponent(agentId)}${qs}`, {
      method: 'DELETE'
    });
    return { ok: res.ok, data: await res.json() };
  },

  // --- AI Center: Tools ---
  async getTools(): Promise<ApiResponse<{ tools: ToolItem[] }>> {
    const res = await fetch('/api/aicenter/tools');
    return { ok: res.ok, data: await res.json() };
  },

  async getCommunityTools(): Promise<ApiResponse<{ tools: CommunityToolItem[] }>> {
    const res = await fetch('/api/aicenter/tools/community');
    return { ok: res.ok, data: await res.json() };
  },

  async executeToolTest(toolName: string, args: Record<string, any>, repo?: string): Promise<ApiResponse<any>> {
    const res = await fetch('/api/aicenter/tools/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_name: toolName, args, repo })
    });
    return { ok: res.ok, data: await res.json() };
  },

  // --- AI Center: MCP Connectors ---
  async getMcpTemplates(): Promise<ApiResponse<{ templates: MCPServerDefinition[] }>> {
    const res = await fetch('/api/aicenter/mcp/templates');
    return { ok: res.ok, data: await res.json() };
  },

  async getMcpProject(repo?: string): Promise<ApiResponse<{ repo: string; servers: MCPServerDefinition[] }>> {
    const qs = repo ? `?repo=${encodeURIComponent(repo)}` : '';
    const res = await fetch(`/api/aicenter/mcp/project${qs}`);
    return { ok: res.ok, data: await res.json() };
  },

  async saveMcpServer(server: MCPServerDefinition, repo?: string): Promise<ApiResponse<{ success: boolean; server: MCPServerDefinition }>> {
    const res = await fetch('/api/aicenter/mcp/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server, repo })
    });
    return { ok: res.ok, data: await res.json() };
  },

  async removeMcpServer(serverId: string, repo?: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const qs = repo ? `?repo=${encodeURIComponent(repo)}` : '';
    const res = await fetch(`/api/aicenter/mcp/remove/${encodeURIComponent(serverId)}${qs}`, {
      method: 'DELETE'
    });
    return { ok: res.ok, data: await res.json() };
  },

  // --- AI Center: Custom Project Tools ---
  async getCustomTools(repo?: string): Promise<ApiResponse<{ repo: string; tools: CustomToolItem[] }>> {
    const qs = repo ? `?repo=${encodeURIComponent(repo)}` : '';
    const res = await fetch(`/api/aicenter/custom-tools${qs}`);
    return { ok: res.ok, data: await res.json() };
  },

  async saveCustomTool(tool: Partial<CustomToolItem>, repo?: string): Promise<ApiResponse<{ success: boolean; tool: CustomToolItem }>> {
    const res = await fetch('/api/aicenter/custom-tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, repo })
    });
    return { ok: res.ok, data: await res.json() };
  },

  async deleteCustomTool(toolId: string, repo?: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const qs = repo ? `?repo=${encodeURIComponent(repo)}` : '';
    const res = await fetch(`/api/aicenter/custom-tools/${encodeURIComponent(toolId)}${qs}`, {
      method: 'DELETE'
    });
    return { ok: res.ok, data: await res.json() };
  },

  async testCustomTool(tool: Partial<CustomToolItem>, args: Record<string, any>, repo?: string): Promise<ApiResponse<any>> {
    const res = await fetch('/api/aicenter/custom-tools/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, args, repo })
    });
    return { ok: res.ok, data: await res.json() };
  },

  async requestCustomToolApproval(toolId: string, repo?: string): Promise<ApiResponse<{ challenge_id: string; expires_in_sec: number }>> {
    const res = await fetch(`/api/aicenter/custom-tools/${encodeURIComponent(toolId)}/request-approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo }),
    });
    return { ok: res.ok, data: await res.json() };
  },

  async approveCustomTool(toolId: string, hash: string, challengeId: string, repo?: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const res = await fetch(`/api/aicenter/custom-tools/${encodeURIComponent(toolId)}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ContextOS-Confirm': hash,
        'X-ContextOS-Challenge': challengeId,
      },
      body: JSON.stringify({ repo }),
    });
    return { ok: res.ok, data: await res.json() };
  },
};

import { IAgentProvider, ProviderCapabilities, ProviderId, ProviderMessage, ProviderMode, ProviderSessionConfig, ProviderStatus, ProviderStreamEvent, ChatMediaAttachment } from './provider.types.js';
import type { ToolCallExecutionRecord } from '../tools/tool.types.js';
import { aiService } from '../ai.service.js';
import { loadConfig } from '../../../config/storage.js';

export class DirectApiProvider implements IAgentProvider {
  readonly id: ProviderId = 'direct-api';
  readonly name = 'Direct API (Gemini / OpenAI / Anthropic)';
  readonly description = 'Chamadas diretas de LLM via API Cloud com ferramentas e suporte a Modo RAW';
  readonly mode: ProviderMode = 'direct';

  readonly capabilities: ProviderCapabilities = {
    supportsTools: true,
    supportsStreaming: true,
    supportsApprovals: false,
    supportsLocalFileSystem: false,
    supportsTerminalExecution: false,
  };

  private sessions = new Map<string, ProviderSessionConfig>();

  async getStatus(): Promise<ProviderStatus> {
    const cfg = loadConfig();
    const aiSettings = cfg.ai_settings || {};
    const hasKey = Boolean(aiSettings.api_key || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

    return {
      id: this.id,
      name: this.name,
      description: this.description,
      mode: this.mode,
      isAvailable: true,
      isAuthenticated: hasKey,
      statusMessage: hasKey ? `Configurado (${aiSettings.provider || 'gemini'})` : 'Chave de API não informada',
      capabilities: this.capabilities,
    };
  }

  async startSession(config: ProviderSessionConfig): Promise<void> {
    this.sessions.set(config.sessionId, config);
  }

  async sendMessage(
    sessionId: string,
    message: string,
    onEvent: (event: ProviderStreamEvent) => void,
    options?: {
      history?: ProviderMessage[];
      briefing?: string;
      contextPointers?: string[];
      content?: string;
      attachments?: ChatMediaAttachment[];
    }
  ): Promise<{ reply: string; toolCalls?: ToolCallExecutionRecord[] }> {
    const session = this.sessions.get(sessionId);
    const repoName = session?.repoName || 'local';
    const cfg = loadConfig();
    const aiSettings = cfg.ai_settings || { provider: 'gemini', model: 'gemini-2.5-flash', api_key: '' };

    onEvent({
      type: 'start',
      provider: this.id,
      sessionId,
      data: { model: aiSettings.model, provider: aiSettings.provider },
      timestamp: Date.now(),
    });

    const systemPrompt = [
      session?.systemPrompt || cfg.settings?.global_system_prompt || '',
      options?.briefing || '',
      options?.contextPointers && options.contextPointers.length > 0 ? `\n\n### Diretrizes de Contexto:\n${options.contextPointers.join('\n')}` : '',
    ].filter(Boolean).join('\n\n');

    try {
      const result = await aiService.callLLM(
        aiSettings,
        message,
        options?.content || '',
        'index.md',
        (options?.history || []).map((h) => ({ role: h.role, text: h.content })),
        systemPrompt,
        repoName,
        options?.attachments
      );

      if (result.tool_calls && result.tool_calls.length > 0) {
        for (const tc of result.tool_calls) {
          onEvent({
            type: 'tool_call',
            provider: this.id,
            sessionId,
            toolName: tc.tool,
            toolArgs: tc.args,
            timestamp: Date.now(),
          });

          onEvent({
            type: 'tool_result',
            provider: this.id,
            sessionId,
            toolName: tc.tool,
            data: tc.result,
            timestamp: Date.now(),
          });
        }
      }

      onEvent({
        type: 'token',
        provider: this.id,
        sessionId,
        text: result.reply,
        timestamp: Date.now(),
      });

      if (result.usage) {
        onEvent({
          type: 'stream_telemetry',
          provider: this.id,
          sessionId,
          data: {
            usage: result.usage,
            toolCalls: result.tool_calls,
            model: result.model,
            duration_ms: result.duration_ms,
          },
          timestamp: Date.now(),
        });
      }

      onEvent({
        type: 'done',
        provider: this.id,
        sessionId,
        data: {
          reply: result.reply,
          model: result.model,
          usage: result.usage,
          duration_ms: result.duration_ms,
        },
        timestamp: Date.now(),
      });

      return {
        reply: result.reply,
        toolCalls: result.tool_calls,
      };
    } catch (err: unknown) {
      onEvent({
        type: 'error',
        provider: this.id,
        sessionId,
        data: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      });
      throw err;
    }
  }

  async sendApproval(_sessionId: string, _approved: boolean, _customInput?: string): Promise<void> {
    // Modo direto com tools integradas roda no loop automático de ReAct
  }

  async stopSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}

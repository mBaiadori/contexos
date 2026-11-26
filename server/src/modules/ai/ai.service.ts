import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenerativeAI, type Content, type Part } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { PROJECTS_DIR, DEFAULT_GLOBAL_SYSTEM_PROMPT, resolveRepoDir } from '../../config/constants.js';
import { loadConfig } from '../../config/storage.js';
import type { ChatMediaAttachment } from './providers/provider.types.js';
import { toolRegistry } from './tools/ToolRegistry.js';
import { ToolCallExecutionRecord } from './tools/tool.types.js';
import { estimateTokens, calculateTokenCost } from './tokens.helper.js';
import { wikiService } from '../wiki/wiki.service.js';
import { checkAiPolicy } from './ai-policy.service.js';
import { sessionStoreService } from './session-store.service.js';

export interface ChatMessage {
  role: 'user' | 'model' | 'assistant' | 'system';
  content?: string;
  text?: string;
}

export interface AIServiceCallOptions {
  provider?: string;
  model?: string;
  api_key?: string;
  custom_endpoint?: string;
  allowed_tools?: string[];
  repoName?: string;
  max_steps?: number;
}

export interface RawTurnMetrics {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  is_estimated?: boolean;
  cost_usd: number;
  pricing_formula?: string;
  duration_ms?: number;
}

export interface RawTurnTelemetryRecord {
  turn_id: string;
  turn_index: number;
  session_id: string;
  timestamp: string;
  duration_ms?: number;
  provider: string;
  model: string;
  raw_mode: boolean;
  skill_id?: string;
  request: {
    prompt: string;
    system_prompt?: string;
    context_files?: Array<{ path: string; size?: number; snippet?: string }>;
    dynamic_context?: string;
    history_messages?: Array<{ role: string; content?: string; text?: string }>;
    tools_schema?: unknown[];
    full_payload?: unknown;
  };
  response: {
    reply: string;
    tool_calls?: unknown[];
    stream_events?: unknown[];
    finish_reason?: string;
    raw_response?: unknown;
  };
  metrics: RawTurnMetrics;
}

export interface AIExecutionResult {
  reply: string;
  provider: string;
  model: string;
  tool_calls?: ToolCallExecutionRecord[];
  steps_count?: number;
  duration_ms?: number;
  usage?: RawTurnMetrics;
  raw_response?: unknown;
}

export interface SessionEventRecord {
  role: string;
  text: string;
  timestamp?: string;
  content?: string;
  [key: string]: unknown;
}

export interface SessionDataRecord {
  session_id: string;
  title?: string;
  path: string;
  created_at: string;
  updated_at: string;
  author: { name: string; role: string };
  model: string;
  events: SessionEventRecord[];
  telemetry_turns: RawTurnTelemetryRecord[];
  metrics?: {
    rounds: number;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_cost_usd: number;
    event_count: number;
    turns_count: number;
  };
}

export function sanitizeSessionEvents(events: SessionEventRecord[]): SessionEventRecord[] {
  if (!Array.isArray(events)) return [];
  return events.map((ev) => {
    if (typeof ev?.text === 'string' && ev.text.includes('Converting circular structure to JSON')) {
      return {
        ...ev,
        text: '⚠️ [Registro recuperado]: A resposta deste turno foi transmitida em tempo real pelo agente. A serialização histórica do servidor sofreu um conflito circular que foi corrigido.',
      };
    }
    return ev;
  });
}

export class AIService {
  private getSessionsDir(repoName?: string): string {
    const cfg = loadConfig();
    const resolvedRepo =
      repoName && repoName !== 'local' && repoName !== 'default'
        ? repoName
        : cfg.active_repo?.name || 'default';

    const targetDir = path.join(resolveRepoDir(resolvedRepo), '.sessions');
    if (!fs.existsSync(targetDir) && cfg.active_repo?.name) {
      const activeDir = path.join(resolveRepoDir(cfg.active_repo.name), '.sessions');
      if (fs.existsSync(activeDir)) {
        return activeDir;
      }
    }
    return targetDir;
  }

  getBriefing(_repoName: string, _filePath: string): string {
    return '';
  }

  async callLLM(
    aiSettings: { provider?: string; model?: string; api_key?: string; custom_endpoint?: string; allowed_tools?: string[] },
    prompt: string,
    docContext: string = '',
    filePath: string = 'index.md',
    history: ChatMessage[] = [],
    customSystemPrompt?: string,
    repoName: string = 'local',
    attachments: ChatMediaAttachment[] = []
  ): Promise<AIExecutionResult> {
    const startTime = Date.now();
    const provider = (aiSettings.provider || 'gemini').toLowerCase();
    const model = aiSettings.model || 'gemini-2.5-flash';
    const apiKey = aiSettings.api_key || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '';

    const cfg = loadConfig();
    const activeUser = cfg.user?.login || 'local';
    const isOwner = activeUser.toLowerCase() === (cfg.active_repo?.full_name?.split('/')[0] || cfg.user?.login || '').toLowerCase();
    const governanceContext = `\n\n[Contexos Governance Guard]\nUsuário Ativo: @${activeUser} | Papel: ${isOwner ? 'Owner / Root (Acesso Total)' : 'Colaborador'}\nRespeite estritamente os níveis de segurança, diretrizes de governança e restrições departamentais.`;
    const systemPrompt = (customSystemPrompt || DEFAULT_GLOBAL_SYSTEM_PROMPT) + governanceContext;
    const contextPrompt = docContext
      ? `\n\n--- DOCUMENTO ATUAL (${filePath}) ---\n${docContext}\n--- FIM DO DOCUMENTO ---`
      : '';

    const fullUserPrompt = `${prompt}${contextPrompt}`;
    const allowedTools = aiSettings.allowed_tools;
    const hasTools = Array.isArray(allowedTools) && allowedTools.length > 0;
    const activeTools = hasTools
      ? toolRegistry.getToolsForSkill(allowedTools, repoName)
      : toolRegistry.getAllTools(repoName);
    const executionContext = { repoName, filePath };
    const executedToolRecords: ToolCallExecutionRecord[] = [];
    const maxSteps = 5;

    // Validação da Política de IA / LGPD antes de disparar chamada
    const policy = checkAiPolicy({
      repoName,
      filePath,
      provider,
    });
    if (!policy.allowed) {
      return {
        reply: `🛡️ ${policy.reason || "Operação bloqueada pela Política de Privacidade LGPD do projeto."}`,
        provider,
        model,
        duration_ms: Date.now() - startTime,
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          cost_usd: 0,
          is_estimated: true,
        },
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 1. Google Gemini (com suporte a Function Calling e Retry)
    // ──────────────────────────────────────────────────────────────────────────
    if (provider === 'gemini') {
      if (!apiKey) {
        return {
          reply: `⚠️ Chave da API do Google Gemini não configurada. Defina sua chave nas Configurações do Sistema ou via variável GEMINI_API_KEY.\n\n*Prompt recebido:* ${prompt}`,
          provider: 'gemini',
          model,
          duration_ms: Date.now() - startTime,
          usage: {
            prompt_tokens: estimateTokens(fullUserPrompt),
            completion_tokens: 20,
            total_tokens: estimateTokens(fullUserPrompt) + 20,
            cost_usd: 0,
            is_estimated: true,
          },
        };
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiTools = activeTools.length > 0
        ? [{ functionDeclarations: toolRegistry.toGeminiFunctionDeclarations(activeTools) }]
        : undefined;

      const contents: Content[] = history
        .filter((h) => (h.content || h.text) && h.role !== 'system')
        .map((h) => ({
          role: h.role === 'model' || h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.content || h.text || '' }],
        }));

      const geminiUserParts: Part[] = [{ text: fullUserPrompt }];
      for (const att of attachments) {
        geminiUserParts.push({
          inlineData: {
            mimeType: att.mimeType || 'application/octet-stream',
            data: att.dataBase64,
          },
        });
      }

      contents.push({
        role: 'user',
        parts: geminiUserParts,
      });

      const selectedModelName = model.includes('gemini') ? model : 'gemini-2.5-flash';
      const geminiModel = genAI.getGenerativeModel({
        model: selectedModelName,
        systemInstruction: systemPrompt,
        tools: geminiTools,
      });

      let lastError: unknown = null;
      const maxAttempts = 2;
      let promptTokensReported = 0;
      let completionTokensReported = 0;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          let currentStep = 0;
          let finalResponseText = '';
          const stepContents = [...contents];

          while (currentStep < maxSteps) {
            currentStep++;
            const result = await geminiModel.generateContent({ contents: stepContents });
            const response = result.response;

            // Extrai uso de tokens real da API se disponível
            if (response.usageMetadata) {
              promptTokensReported = response.usageMetadata.promptTokenCount || promptTokensReported;
              completionTokensReported += response.usageMetadata.candidatesTokenCount || 0;
            }

            const functionCalls = response.functionCalls();

            if (!functionCalls || functionCalls.length === 0) {
              finalResponseText = response.text();
              break;
            }

            stepContents.push({
              role: 'model',
              parts: response.candidates?.[0]?.content?.parts || [],
            });

            const functionResponseParts: Part[] = [];
            for (const call of functionCalls) {
              const toolResult = await toolRegistry.executeTool(call.name, call.args || {}, executionContext);
              executedToolRecords.push({
                tool: call.name,
                args: call.args as Record<string, unknown>,
                result: toolResult,
                timestamp: new Date().toISOString(),
              });

              functionResponseParts.push({
                functionResponse: {
                  name: call.name,
                  response: toolResult as unknown as object,
                },
              });
            }

            stepContents.push({
              role: 'user',
              parts: functionResponseParts,
            });
          }

          const durationMs = Date.now() - startTime;
          const finalPromptTokens = promptTokensReported || estimateTokens(systemPrompt + JSON.stringify(stepContents));
          const finalCompletionTokens = completionTokensReported || estimateTokens(finalResponseText + JSON.stringify(executedToolRecords));
          const totalTokens = finalPromptTokens + finalCompletionTokens;
          const costInfo = calculateTokenCost(selectedModelName, finalPromptTokens, finalCompletionTokens);

          return {
            reply: finalResponseText || 'Tarefa processada pelo agente.',
            provider: 'gemini',
            model: selectedModelName,
            tool_calls: executedToolRecords,
            steps_count: currentStep,
            duration_ms: durationMs,
            usage: {
              prompt_tokens: finalPromptTokens,
              completion_tokens: finalCompletionTokens,
              total_tokens: totalTokens,
              is_estimated: !promptTokensReported,
              cost_usd: costInfo.costUsd,
              pricing_formula: costInfo.formula,
              duration_ms: durationMs,
            },
          };
        } catch (err: unknown) {
          lastError = err;
          const errMsg = err instanceof Error ? err.message : String(err);
          const isOverloaded = errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('429') || errMsg.includes('ResourceExhausted');

          if (isOverloaded && attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
            continue;
          }
          break;
        }
      }

      const lastErrMsg =
        lastError instanceof Error ? lastError.message : String(lastError);
      const durationMs = Date.now() - startTime;
      return {
        reply: `Erro ao comunicar com Google Gemini (${selectedModelName}): ${lastErrMsg}`,
        provider: 'gemini',
        model: selectedModelName,
        duration_ms: durationMs,
        usage: {
          prompt_tokens: estimateTokens(fullUserPrompt),
          completion_tokens: 15,
          total_tokens: estimateTokens(fullUserPrompt) + 15,
          cost_usd: 0,
          is_estimated: true,
          duration_ms: durationMs,
        },
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. OpenAI
    // ──────────────────────────────────────────────────────────────────────────
    if (provider === 'openai') {
      if (!apiKey) {
        const durationMs = Date.now() - startTime;
        return {
          reply: '⚠️ Chave da API OpenAI não configurada.',
          provider: 'openai',
          model: model || 'gpt-4o',
          duration_ms: durationMs,
        };
      }

      try {
        const client = new OpenAI({ apiKey });
        const openAITools = activeTools.length > 0 ? toolRegistry.toOpenAITools(activeTools) : undefined;
        const openAIUserContent: OpenAI.Chat.ChatCompletionContentPart[] | string =
          attachments.length > 0
            ? [
                { type: 'text' as const, text: fullUserPrompt },
                ...attachments.map((att) => {
                  if (att.mimeType.startsWith('image/')) {
                    return {
                      type: 'image_url' as const,
                      image_url: { url: `data:${att.mimeType};base64,${att.dataBase64}` },
                    };
                  }
                  if (att.mimeType.startsWith('text/') || att.mimeType === 'application/json') {
                    const decoded = Buffer.from(att.dataBase64, 'base64').toString('utf-8');
                    return { type: 'text' as const, text: `\n[Arquivo anexado: ${att.name}]\n${decoded}` };
                  }
                  return {
                    type: 'text' as const,
                    text: `\n[Mídia anexada: ${att.name} (${att.mimeType}) — não suportada nativamente neste endpoint]`,
                  };
                }),
              ]
            : fullUserPrompt;

        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: 'system', content: systemPrompt },
          ...history
            .filter((h) => h.content || h.text)
            .map((h) => ({
              role: (h.role === 'model' ? 'assistant' : h.role) as 'user' | 'assistant' | 'system',
              content: h.content || h.text || '',
            })),
          { role: 'user', content: openAIUserContent },
        ];

        let currentStep = 0;
        let finalReply = '';
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;

        while (currentStep < maxSteps) {
          currentStep++;
          const response = await client.chat.completions.create({
            model: model || 'gpt-4o',
            messages,
            tools: openAITools,
          });

          if (response.usage) {
            totalPromptTokens = response.usage.prompt_tokens;
            totalCompletionTokens += response.usage.completion_tokens;
          }

          const choice = response.choices[0];
          const msg = choice?.message;

          if (!msg?.tool_calls || msg.tool_calls.length === 0) {
            finalReply = msg?.content || '';
            break;
          }

          messages.push(msg);

          for (const tc of msg.tool_calls) {
            if (tc.type === 'function') {
              let parsedArgs = {};
              try {
                parsedArgs = JSON.parse(tc.function.arguments || '{}');
              } catch {}

              const toolResult = await toolRegistry.executeTool(tc.function.name, parsedArgs, executionContext);
              executedToolRecords.push({
                tool: tc.function.name,
                args: parsedArgs,
                result: toolResult,
                timestamp: new Date().toISOString(),
              });

              messages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify(toolResult),
              });
            }
          }
        }

        const durationMs = Date.now() - startTime;
        const promptTokens = totalPromptTokens || estimateTokens(systemPrompt + JSON.stringify(messages));
        const completionTokens = totalCompletionTokens || estimateTokens(finalReply + JSON.stringify(executedToolRecords));
        const costInfo = calculateTokenCost(model || 'gpt-4o', promptTokens, completionTokens);

        return {
          reply: finalReply || 'Processamento concluído pelo agente.',
          provider: 'openai',
          model: model || 'gpt-4o',
          tool_calls: executedToolRecords,
          steps_count: currentStep,
          duration_ms: durationMs,
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
            is_estimated: !totalPromptTokens,
            cost_usd: costInfo.costUsd,
            pricing_formula: costInfo.formula,
            duration_ms: durationMs,
          },
        };
      } catch (err: unknown) {
        const durationMs = Date.now() - startTime;
        return {
          reply: `Erro OpenAI: ${err instanceof Error ? err.message : String(err)}`,
          provider: 'openai',
          model,
          duration_ms: durationMs,
        };
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. Anthropic Claude
    // ──────────────────────────────────────────────────────────────────────────
    if (provider === 'anthropic') {
      if (!apiKey) {
        const durationMs = Date.now() - startTime;
        return {
          reply: '⚠️ Chave da API Anthropic não configurada.',
          provider: 'anthropic',
          model: model || 'claude-3-5-sonnet',
          duration_ms: durationMs,
        };
      }

      try {
        const client = new Anthropic({ apiKey });
        const anthropicTools = activeTools.length > 0 ? toolRegistry.toAnthropicTools(activeTools) : undefined;
        const anthropicUserContent: Anthropic.MessageParam['content'] =
          attachments.length > 0
            ? [
                ...attachments.map((att) => {
                  if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(att.mimeType)) {
                    return {
                      type: 'image' as const,
                      source: {
                        type: 'base64' as const,
                        media_type: att.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                        data: att.dataBase64,
                      },
                    };
                  }
                  if (att.mimeType === 'application/pdf') {
                    return {
                      type: 'document' as const,
                      source: {
                        type: 'base64' as const,
                        media_type: 'application/pdf' as const,
                        data: att.dataBase64,
                      },
                    };
                  }
                  if (att.mimeType.startsWith('text/') || att.mimeType === 'application/json') {
                    const decoded = Buffer.from(att.dataBase64, 'base64').toString('utf-8');
                    return { type: 'text' as const, text: `[Arquivo anexado: ${att.name}]\n${decoded}` };
                  }
                  return {
                    type: 'text' as const,
                    text: `[Mídia anexada: ${att.name} (${att.mimeType}) — não suportada nativamente neste endpoint]`,
                  };
                }),
                { type: 'text' as const, text: fullUserPrompt },
              ]
            : fullUserPrompt;

        const messages: Anthropic.MessageParam[] = [
          ...history
            .filter((h) => (h.content || h.text) && h.role !== 'system')
            .map((h) => ({
              role: (h.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant',
              content: h.content || h.text || '',
            })),
          { role: 'user', content: anthropicUserContent },
        ];

        let currentStep = 0;
        let finalReply = '';
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        while (currentStep < maxSteps) {
          currentStep++;
          const response = await client.messages.create({
            model: model || 'claude-3-5-sonnet-20241022',
            max_tokens: 4096,
            system: systemPrompt,
            messages,
            tools: anthropicTools,
          });

          if (response.usage) {
            totalInputTokens = response.usage.input_tokens;
            totalOutputTokens += response.usage.output_tokens;
          }

          if (response.stop_reason !== 'tool_use') {
            const textBlock = response.content.find(
              (c): c is Anthropic.TextBlock => c.type === 'text',
            );
            finalReply = textBlock?.text || '';
            break;
          }

          messages.push({
            role: 'assistant',
            content: response.content,
          });

          const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
          for (const block of response.content) {
            if (block.type === 'tool_use') {
              const toolResult = await toolRegistry.executeTool(
                block.name,
                (block.input as Record<string, unknown>) || {},
                executionContext,
              );
              executedToolRecords.push({
                tool: block.name,
                args: block.input as Record<string, any>,
                result: toolResult,
                timestamp: new Date().toISOString(),
              });

              toolResultBlocks.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(toolResult),
              });
            }
          }

          messages.push({
            role: 'user',
            content: toolResultBlocks,
          });
        }

        const durationMs = Date.now() - startTime;
        const promptTokens = totalInputTokens || estimateTokens(systemPrompt + JSON.stringify(messages));
        const completionTokens = totalOutputTokens || estimateTokens(finalReply + JSON.stringify(executedToolRecords));
        const costInfo = calculateTokenCost(model || 'claude-3-5-sonnet', promptTokens, completionTokens);

        return {
          reply: finalReply || 'Processamento concluído.',
          provider: 'anthropic',
          model: model || 'claude-3-5-sonnet',
          tool_calls: executedToolRecords,
          steps_count: currentStep,
          duration_ms: durationMs,
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
            is_estimated: !totalInputTokens,
            cost_usd: costInfo.costUsd,
            pricing_formula: costInfo.formula,
            duration_ms: durationMs,
          },
        };
      } catch (err: unknown) {
        const durationMs = Date.now() - startTime;
        return {
          reply: `Erro Anthropic: ${err instanceof Error ? err.message : String(err)}`,
          provider: 'anthropic',
          model,
          duration_ms: durationMs,
        };
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. Ollama / Local Endpoint
    // ──────────────────────────────────────────────────────────────────────────
    if (provider === 'ollama') {
      const endpoint = aiSettings.custom_endpoint || 'http://localhost:11434/v1';
      try {
        const client = new OpenAI({
          baseURL: endpoint,
          apiKey: apiKey || 'ollama',
        });

        const openAIUserContent: OpenAI.Chat.ChatCompletionContentPart[] | string =
          attachments.length > 0
            ? [
                { type: 'text' as const, text: fullUserPrompt },
                ...attachments.map((att) => {
                  if (att.mimeType.startsWith('image/')) {
                    return {
                      type: 'image_url' as const,
                      image_url: { url: `data:${att.mimeType};base64,${att.dataBase64}` },
                    };
                  }
                  if (att.mimeType.startsWith('text/') || att.mimeType === 'application/json') {
                    const decoded = Buffer.from(att.dataBase64, 'base64').toString('utf-8');
                    return { type: 'text' as const, text: `\n[Arquivo anexado: ${att.name}]\n${decoded}` };
                  }
                  return {
                    type: 'text' as const,
                    text: `\n[Mídia anexada: ${att.name} (${att.mimeType}) — não suportada nativamente neste endpoint]`,
                  };
                }),
              ]
            : fullUserPrompt;

        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: 'system', content: systemPrompt },
          ...history
            .filter((h) => h.content || h.text)
            .map((h) => ({
              role: (h.role === 'model' ? 'assistant' : h.role) as 'user' | 'assistant' | 'system',
              content: h.content || h.text || '',
            })),
          { role: 'user', content: openAIUserContent },
        ];

        const response = await client.chat.completions.create({
          model: model || 'llama3.3',
          messages,
        });

        const durationMs = Date.now() - startTime;
        const finalReply = response.choices[0]?.message?.content || '';
        const promptTokens = response.usage?.prompt_tokens || estimateTokens(systemPrompt + JSON.stringify(messages));
        const completionTokens = response.usage?.completion_tokens || estimateTokens(finalReply);

        return {
          reply: finalReply,
          provider: 'ollama',
          model: model || 'llama3.3',
          duration_ms: durationMs,
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
            cost_usd: 0,
            pricing_formula: 'Hardware Local (Custo: $0.00)',
            duration_ms: durationMs,
          },
        };
      } catch (err: unknown) {
        const durationMs = Date.now() - startTime;
        return {
          reply: `Erro Ollama Local (${endpoint}): ${err instanceof Error ? err.message : String(err)}`,
          provider: 'ollama',
          model,
          duration_ms: durationMs,
        };
      }
    }

    const durationMs = Date.now() - startTime;
    return {
      reply: `Provedor de IA '${provider}' não suportado.`,
      provider,
      model,
      duration_ms: durationMs,
    };
  }

  appendChatEvent(
    repoName: string,
    filePath: string,
    sessionId: string,
    role: string,
    text: string,
    metadata?: { model?: string; author?: string },
    telemetryTurn?: RawTurnTelemetryRecord
  ) {
    sessionStoreService.appendEvent(repoName, filePath, sessionId, role, text, metadata, telemetryTurn);
  }

  getChatHistory(repoName: string, sessionId?: string, _filePath?: string) {
    return sessionStoreService.getChatHistory(repoName, sessionId);
  }

  getSessionDetails(repoName: string, sessionId?: string) {
    return sessionStoreService.getSessionDetails(repoName, sessionId);
  }

  deleteSession(repoName: string, sessionId: string) {
    return sessionStoreService.deleteSession(repoName, sessionId);
  }

  renameSession(repoName: string, sessionId: string, title: string) {
    return sessionStoreService.renameSession(repoName, sessionId, title);
  }

  async finalizeSession(
    repoName: string,
    filePath: string,
    sessionId: string,
    summary?: string,
    options?: { category?: string; title?: string }
  ) {
    const sessionData = this.getSessionDetails(repoName, sessionId);
    const now = new Date();
    const nowStr = now.toLocaleString('pt-BR');
    const datePrefix = now.toISOString().slice(0, 10);
    const category = (options?.category || 'handoffs').toLowerCase().trim();
    const events = (sessionData?.events || []) as SessionEventRecord[];

    let generatedSummary = summary?.trim() || '';
    let usedLLM = false;

    if (!generatedSummary && events.length > 0) {
      const transcript = events
        .slice(-40)
        .map((e) => {
          const speaker = e.role === 'user' ? 'Usuário' : 'Assistente';
          const text = (e.text || e.content || '').trim();
          const clipped = text.length > 1500 ? `${text.slice(0, 1500)}...` : text;
          return `**${speaker}:** ${clipped}`;
        })
        .join('\n\n');

      const cfg = loadConfig();
      const aiSettings = cfg.ai_settings || {};
      const hasApiKey = Boolean(
        aiSettings.api_key ||
          process.env.GEMINI_API_KEY ||
          process.env.OPENAI_API_KEY ||
          process.env.ANTHROPIC_API_KEY
      );

      if (hasApiKey) {
        try {
          const synthesisPrompt = `Analise a transcrição da conversa abaixo e gere um documento técnico estruturado em Markdown (em Português) para a Wiki do projeto (categoria: ${category}).

Use exatamente esta estrutura:
## Resumo Executivo
(2 a 4 frases objetivas explicando o contexto, o que foi investigado e o resultado final)

## Decisões e Conclusões
- (bullet points com decisões técnicas, arquiteturais ou de produto tomadas)

## Arquivos e Conceitos Relacionados
- (liste caminhos de arquivos, módulos ou símbolos relevantes mencionados; se não houver, omita itens inventados)

## Próximos Passos / Pendências
- (itens em aberto ou ações recomendadas, se houver)

Não invente informações que não estejam na transcrição. Seja direto e conciso.

--- TRANSCRIÇÃO ---
${transcript.slice(0, 14000)}
--- FIM DA TRANSCRIÇÃO ---`;

          const llmRes = await this.callLLM(
            {
              provider: aiSettings.provider || 'gemini',
              model: aiSettings.model || 'gemini-2.5-flash',
              api_key: aiSettings.api_key,
              custom_endpoint: aiSettings.custom_endpoint,
              allowed_tools: [],
            },
            synthesisPrompt,
            '',
            filePath || 'Global',
            [],
            'Você é um engenheiro de software sênior documentando decisões e handoffs técnicos para a Wiki do projeto.',
            repoName
          );

          if (llmRes?.reply && llmRes.reply.trim().length > 40) {
            generatedSummary = llmRes.reply.trim();
            usedLLM = true;
          }
        } catch (llmErr) {
          console.warn('[AIService] Síntese via LLM indisponível, usando fallback local:', llmErr);
        }
      }

      if (!generatedSummary) {
        const userPoints = events
          .filter((e) => e.role === 'user')
          .slice(-10)
          .map((e) => `- ${(e.text || e.content || '').trim().slice(0, 220)}`)
          .join('\n');
        const assistantLast = [...events]
          .reverse()
          .find((e) => e.role === 'model' || e.role === 'assistant');
        const lastConclusion = assistantLast
          ? (assistantLast.text || assistantLast.content || '').trim().slice(0, 900)
          : '';

        generatedSummary = [
          '## Tópicos Discutidos',
          userPoints || '- Sessão de pareamento.',
          lastConclusion ? `\n## Última Síntese / Resposta do Assistente\n${lastConclusion}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      }
    }

    const firstUserText = events.find((e) => e.role === 'user')?.text || '';
    const topicSource = options?.title?.trim() || firstUserText.slice(0, 50) || filePath || sessionId;
    const topicSlug = topicSource
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 48);
    const slug = `${datePrefix}-${topicSlug || sessionId}`;
    const docTitle =
      options?.title?.trim() ||
      `${category === 'decisions' ? 'Decisão' : 'Handoff'}: ${firstUserText ? firstUserText.slice(0, 60) : filePath || 'Sessão'} (${datePrefix})`;

    const content = `# ${docTitle}\n\n**Data:** ${nowStr}  \n**Arquivo / Escopo:** \`${filePath || 'Global'}\`  \n**Sessão:** \`${sessionId}\`  \n**Modelo:** \`${sessionData?.model || 'AI'}\`\n\n${generatedSummary || 'Sessão documentada sem eventos registrados.'}\n`;

    try {
      wikiService.saveWikiPage(category, slug, docTitle, content, repoName);
    } catch (wikiErr) {
      console.error('[AIService] Erro ao sincronizar documento na Wiki:', wikiErr);
    }

    return {
      success: true,
      message: `Documento salvo na Wiki (${category}/${slug}).`,
      briefing: content,
      usedLLM,
      wikiPage: {
        category,
        slug,
        title: docTitle,
      },
    };
  }

  resetMemory(repoName: string) {
    return sessionStoreService.resetRepo(repoName);
  }
}

export const aiService = new AIService();

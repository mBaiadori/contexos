import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { PROJECTS_DIR, DEFAULT_GLOBAL_SYSTEM_PROMPT, resolveRepoDir } from '../../config/constants.js';
import { loadConfig } from '../../config/storage.js';
import { toolRegistry } from './tools/ToolRegistry.js';
import { ToolCallExecutionRecord } from './tools/tool.types.js';
import { estimateTokens, calculateTokenCost } from './tokens.helper.js';
import { wikiService } from '../wiki/wiki.service.js';
import { checkAiPolicy } from './ai-policy.service.js';
import { recordAuditEvent } from '../audit/audit-chain.service.js';

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
    tools_schema?: any[];
    full_payload?: any;
  };
  response: {
    reply: string;
    tool_calls?: any[];
    stream_events?: any[];
    finish_reason?: string;
    raw_response?: any;
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
  raw_response?: any;
}

export function sanitizeSessionEvents(events: any[]): any[] {
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
  private getMemoryDir(repoName?: string): string {
    const cfg = loadConfig();
    let resolvedRepo = (repoName && repoName !== 'local' && repoName !== 'default')
      ? repoName
      : (cfg.active_repo?.name || 'default');

    const targetDir = path.join(resolveRepoDir(resolvedRepo), '.spec-memory');
    if (!fs.existsSync(targetDir) && cfg.active_repo?.name) {
      const activeDir = path.join(resolveRepoDir(cfg.active_repo.name), '.spec-memory');
      if (fs.existsSync(activeDir)) {
        return activeDir;
      }
    }
    return targetDir;
  }

  private getSessionsDir(repoName?: string): string {
    return path.join(this.getMemoryDir(repoName), 'sessions');
  }

  getBriefing(repoName: string, _filePath: string): string {
    const memDir = this.getMemoryDir(repoName);
    const handoffPath = path.join(memDir, 'handoffs', 'latest.md');
    let briefing = '';

    if (fs.existsSync(handoffPath)) {
      try {
        const handoff = fs.readFileSync(handoffPath, 'utf-8');
        briefing += `### Último Handoff de Contexto:\n${handoff}\n\n`;
      } catch {}
    }

    return briefing;
  }

  async callLLM(
    aiSettings: { provider?: string; model?: string; api_key?: string; custom_endpoint?: string; allowed_tools?: string[] },
    prompt: string,
    docContext: string = '',
    filePath: string = 'index.md',
    history: ChatMessage[] = [],
    customSystemPrompt?: string,
    repoName: string = 'local'
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

    recordAuditEvent(repoName, {
      eventType: "ai_request",
      user: activeUser,
      payload: { provider, model, filePath, promptLength: prompt.length },
    }).catch(() => {});

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

      const contents: any[] = history
        .filter((h) => (h.content || h.text) && h.role !== 'system')
        .map((h) => ({
          role: h.role === 'model' || h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.content || h.text || '' }],
        }));

      contents.push({
        role: 'user',
        parts: [{ text: fullUserPrompt }],
      });

      const selectedModelName = model.includes('gemini') ? model : 'gemini-2.5-flash';
      const geminiModel = genAI.getGenerativeModel({
        model: selectedModelName,
        systemInstruction: systemPrompt,
        tools: geminiTools,
      });

      let lastError: any = null;
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

            const functionResponseParts = [];
            for (const call of functionCalls) {
              const toolResult = await toolRegistry.executeTool(call.name, call.args || {}, executionContext);
              executedToolRecords.push({
                tool: call.name,
                args: call.args as Record<string, any>,
                result: toolResult,
                timestamp: new Date().toISOString(),
              });

              functionResponseParts.push({
                functionResponse: {
                  name: call.name,
                  response: toolResult,
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
        } catch (err: any) {
          lastError = err;
          const errMsg = String(err?.message || err);
          const isOverloaded = errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('429') || errMsg.includes('ResourceExhausted');

          if (isOverloaded && attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
            continue;
          }
          break;
        }
      }

      const durationMs = Date.now() - startTime;
      return {
        reply: `Erro ao comunicar com Google Gemini (${selectedModelName}): ${lastError?.message || String(lastError)}`,
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
        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: 'system', content: systemPrompt },
          ...history
            .filter((h) => h.content || h.text)
            .map((h) => ({
              role: (h.role === 'model' ? 'assistant' : h.role) as any,
              content: h.content || h.text || '',
            })),
          { role: 'user', content: fullUserPrompt },
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
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        return {
          reply: `Erro OpenAI: ${err.message || String(err)}`,
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
        const messages: Anthropic.MessageParam[] = [
          ...history
            .filter((h) => (h.content || h.text) && h.role !== 'system')
            .map((h) => ({
              role: (h.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant',
              content: h.content || h.text || '',
            })),
          { role: 'user', content: fullUserPrompt },
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
            const textBlock = response.content.find((c: any) => c.type === 'text') as any;
            finalReply = textBlock?.text || '';
            break;
          }

          messages.push({
            role: 'assistant',
            content: response.content as any,
          });

          const toolResultBlocks: any[] = [];
          for (const block of response.content) {
            if (block.type === 'tool_use') {
              const toolResult = await toolRegistry.executeTool(block.name, (block.input as any) || {}, executionContext);
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
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        return {
          reply: `Erro Anthropic: ${err.message || String(err)}`,
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

        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: 'system', content: systemPrompt },
          ...history
            .filter((h) => h.content || h.text)
            .map((h) => ({
              role: (h.role === 'model' ? 'assistant' : h.role) as any,
              content: h.content || h.text || '',
            })),
          { role: 'user', content: fullUserPrompt },
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
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        return {
          reply: `Erro Ollama Local (${endpoint}): ${err.message || String(err)}`,
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
    const sessionsDir = this.getSessionsDir(repoName);
    fs.mkdirSync(sessionsDir, { recursive: true });

    const sessionFile = path.join(sessionsDir, `${sessionId}.json`);
    let sessionData: any = {
      session_id: sessionId,
      path: filePath,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      author: { name: metadata?.author || 'Developer', role: 'Developer' },
      model: metadata?.model || 'gemini',
      events: [],
      telemetry_turns: [],
    };

    if (fs.existsSync(sessionFile)) {
      try {
        sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
      } catch {}
    }

    if (!Array.isArray(sessionData.telemetry_turns)) {
      sessionData.telemetry_turns = [];
    }
    if (!Array.isArray(sessionData.events)) {
      sessionData.events = [];
    }

    sessionData.updated_at = new Date().toISOString();
    if (metadata?.model) sessionData.model = metadata.model;
    if (filePath && (!sessionData.path || sessionData.path === 'Global')) sessionData.path = filePath;

    sessionData.events.push({
      role,
      text,
      timestamp: new Date().toISOString(),
    });

    if (telemetryTurn) {
      // Verifica se já existe o turno pelo turn_id ou substitui/adiciona
      const existingIdx = sessionData.telemetry_turns.findIndex((t: any) => t.turn_id === telemetryTurn.turn_id);
      if (existingIdx >= 0) {
        sessionData.telemetry_turns[existingIdx] = telemetryTurn;
      } else {
        sessionData.telemetry_turns.push(telemetryTurn);
      }
    }

    // Calcula métricas consolidadas
    const rounds = Math.ceil(sessionData.events.length / 2);
    const approxTokens = sessionData.events.reduce((acc: number, ev: any) => acc + Math.ceil((ev.text?.length || 0) / 4), 0);
    
    const totalPromptTokens = sessionData.telemetry_turns.reduce((acc: number, t: any) => acc + (t.metrics?.prompt_tokens || 0), 0);
    const totalCompletionTokens = sessionData.telemetry_turns.reduce((acc: number, t: any) => acc + (t.metrics?.completion_tokens || 0), 0);
    const totalTokens = (totalPromptTokens + totalCompletionTokens) || approxTokens;
    const totalCostUsd = sessionData.telemetry_turns.reduce((acc: number, t: any) => acc + (t.metrics?.cost_usd || 0), 0);

    sessionData.metrics = {
      rounds,
      total_tokens: totalTokens,
      prompt_tokens: totalPromptTokens,
      completion_tokens: totalCompletionTokens,
      total_cost_usd: totalCostUsd,
      event_count: sessionData.events.length,
      turns_count: sessionData.telemetry_turns.length,
    };

    fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2), 'utf-8');
  }

  getChatHistory(repoName: string, sessionId?: string, filePath?: string) {
    let sessionsDir = this.getSessionsDir(repoName);
    if (!fs.existsSync(sessionsDir)) {
      const cfg = loadConfig();
      if (cfg.active_repo?.name && cfg.active_repo.name !== repoName) {
        const fallbackDir = path.join(resolveRepoDir(cfg.active_repo.name), '.spec-memory', 'sessions');
        if (fs.existsSync(fallbackDir)) {
          sessionsDir = fallbackDir;
        } else {
          return { sessions: [] };
        }
      } else {
        return { sessions: [] };
      }
    }

    if (sessionId) {
      const sessionFile = path.join(sessionsDir, `${sessionId}.json`);
      if (fs.existsSync(sessionFile)) {
        try {
          const session = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
          if (session && Array.isArray(session.events)) {
            session.events = sanitizeSessionEvents(session.events);
          }
          return { session, sessions: [session] };
        } catch {}
      }
    }

    const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.json'));
    const sessions = [];

    const parseTimestamp = (val?: string | number, fallbackMs: number = 0): number => {
      if (!val) return fallbackMs;
      if (typeof val === 'number') return val;
      const t = new Date(val).getTime();
      if (!isNaN(t) && t > 0) return t;
      const match = String(val).match(/\d{10,13}/);
      if (match) return parseInt(match[0], 10);
      return fallbackMs;
    };

    for (const f of files) {
      try {
        const fullPath = path.join(sessionsDir, f);
        const stats = fs.statSync(fullPath);
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        if (Array.isArray(data.events)) {
          data.events = sanitizeSessionEvents(data.events);
        }

        const lastEvent = data.events && data.events.length > 0 ? data.events[data.events.length - 1] : null;
        const firstUserEvent = data.events ? data.events.find((e: any) => e.role === 'user') : null;

        const mtimeIso = stats.mtime.toISOString();
        const rawUpdated = data.updated_at || lastEvent?.timestamp || mtimeIso;
        const rawCreated = data.created_at || data.events?.[0]?.timestamp || mtimeIso;

        const updatedTs = Math.max(
          parseTimestamp(rawUpdated, stats.mtimeMs),
          parseTimestamp(lastEvent?.timestamp, stats.mtimeMs),
          stats.mtimeMs
        );

        const userText = firstUserEvent?.text || firstUserEvent?.content || '';
        const previewText = userText
          ? (userText.length > 90 ? userText.slice(0, 90) + '...' : userText)
          : (lastEvent?.text ? (lastEvent.text.length > 90 ? lastEvent.text.slice(0, 90) + '...' : lastEvent.text) : 'Conversa com Copilot');

        sessions.push({
          session_id: data.session_id || f.replace('.json', ''),
          path: data.path || 'Global',
          event_count: data.events?.length || 0,
          created_at: rawCreated,
          updated_at: rawUpdated,
          timestamp: updatedTs,
          model: data.model || 'AI Assistant',
          author: data.author || { name: 'Developer' },
          preview: previewText,
          metrics: data.metrics || {
            rounds: Math.ceil((data.events?.length || 1) / 2),
            total_tokens: 0,
            total_cost_usd: 0,
          },
          telemetry_turns: data.telemetry_turns || [],
        });
      } catch {}
    }

    // Ordena rigorosamente da mais recente para a mais antiga
    sessions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return { sessions };
  }

  getSessionDetails(repoName: string, sessionId?: string) {
    if (!sessionId) return null;
    const sessionsDir = this.getSessionsDir(repoName);
    let sessionFile = path.join(sessionsDir, `${sessionId}.json`);
    if (!fs.existsSync(sessionFile)) {
      const cfg = loadConfig();
      if (cfg.active_repo?.name && cfg.active_repo.name !== repoName) {
        const fallbackFile = path.join(resolveRepoDir(cfg.active_repo.name), '.spec-memory', 'sessions', `${sessionId}.json`);
        if (fs.existsSync(fallbackFile)) {
          sessionFile = fallbackFile;
        }
      }
    }
    if (fs.existsSync(sessionFile)) {
      try {
        return JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
      } catch {}
    }
    return null;
  }

  deleteSession(repoName: string, sessionId: string) {
    const sessionsDir = this.getSessionsDir(repoName);
    let sessionFile = path.join(sessionsDir, `${sessionId}.json`);
    if (!fs.existsSync(sessionFile)) {
      const cfg = loadConfig();
      if (cfg.active_repo?.name && cfg.active_repo.name !== repoName) {
        const fallbackFile = path.join(resolveRepoDir(cfg.active_repo.name), '.spec-memory', 'sessions', `${sessionId}.json`);
        if (fs.existsSync(fallbackFile)) {
          sessionFile = fallbackFile;
        }
      }
    }
    if (fs.existsSync(sessionFile)) {
      try {
        fs.unlinkSync(sessionFile);
        return { success: true, message: 'Sessão removida com sucesso.' };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
    return { success: false, error: 'Sessão não encontrada.' };
  }

  finalizeSession(repoName: string, filePath: string, sessionId: string, summary?: string) {
    const memDir = this.getMemoryDir(repoName);
    const handoffsDir = path.join(memDir, 'handoffs');
    fs.mkdirSync(handoffsDir, { recursive: true });

    const sessionData = this.getSessionDetails(repoName, sessionId);
    const nowStr = new Date().toLocaleString('pt-BR');
    
    let generatedSummary = summary;
    if (!generatedSummary && sessionData && sessionData.events?.length > 0) {
      const userQuestions = sessionData.events
        .filter((e: any) => e.role === 'user')
        .map((e: any) => `- ${e.text.slice(0, 140)}`)
        .join('\n');
      generatedSummary = `### Decisões e Tópicos Discutidos:\n${userQuestions || 'Sessão de pareamento.'}`;
    }

    const content = `# Handoff de Sessão (${nowStr})\n\n**Arquivo / Escopo:** \`${filePath || 'Global'}\`\n**Sessão:** \`${sessionId}\`\n**Modelo:** \`${sessionData?.model || 'AI'}\`\n\n${generatedSummary || 'Sessão finalizada com sucesso.'}\n`;

    const handoffFile = path.join(handoffsDir, 'latest.md');
    fs.writeFileSync(handoffFile, content, 'utf-8');

    const archiveHandoffFile = path.join(handoffsDir, `handoff-${sessionId}.md`);
    fs.writeFileSync(archiveHandoffFile, content, 'utf-8');

    // Persistir automaticamente na Base Wiki sob a categoria 'handoffs'
    try {
      wikiService.saveWikiPage(
        'handoffs',
        `handoff-${sessionId}`,
        `Handoff: ${filePath || 'Global'} (${nowStr})`,
        content,
        repoName
      );
    } catch (wikiErr) {
      console.error('[AIService] Erro ao sincronizar handoff na Wiki:', wikiErr);
    }

    return {
      success: true,
      message: 'Sessão finalizada e Handoff gerado com sucesso.',
      handoff_path: handoffFile,
      briefing: content,
    };
  }

  resetMemory(repoName: string) {
    const memDir = this.getMemoryDir(repoName);
    if (fs.existsSync(memDir)) {
      fs.rmSync(memDir, { recursive: true, force: true });
    }
    return { success: true, message: 'Memória de IA resetada com sucesso.' };
  }
}

export const aiService = new AIService();

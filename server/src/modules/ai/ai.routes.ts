import { FastifyInstance } from 'fastify';
import { aiService, RawTurnTelemetryRecord } from './ai.service.js';
import { loadConfig } from '../../config/storage.js';
import { toolRegistry } from './tools/ToolRegistry.js';
import { skillsService } from '../skills/skills.service.js';
import { providerManager } from './providers/ProviderManager.js';
import { contextPointerService } from './context/ContextPointerService.js';
import { ragService } from '../rag/rag.service.js';
import { ProviderId, ProviderStreamEvent } from './providers/provider.types.js';
import { estimateTokens, calculateTokenCost } from './tokens.helper.js';

/**
 * Serializador JSON seguro contra referências circulares para eventos SSE e telemetria
 */
function safeJsonStringify(obj: any): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  });
}

export async function aiRoutes(fastify: FastifyInstance) {
  /**
   * Lista todos os provedores disponíveis e seus status (Direct API, Antigravity, etc.)
   */
  fastify.get('/api/ai/providers', async (_request, reply) => {
    const providers = await providerManager.listProviders();
    return reply.send({ providers });
  });

  /**
   * Envia uma resposta de aprovação interativa (y/n) para a sessão do agente
   */
  fastify.post('/api/ai/session/approval', async (request, reply) => {
    const body = request.body as {
      session_id?: string;
      provider_id?: ProviderId;
      approved: boolean;
      custom_input?: string;
    };

    if (!body.session_id) {
      return reply.status(400).send({ error: 'session_id é obrigatório' });
    }

    const provider = providerManager.getProvider(body.provider_id || 'antigravity');
    try {
      await provider.sendApproval(body.session_id, body.approved, body.custom_input);
      return reply.send({ success: true, session_id: body.session_id });
    } catch (err: any) {
      return reply.status(500).send({ error: err?.message || 'Falha ao enviar aprovação' });
    }
  });

  /**
   * Interrompe uma sessão de agente em andamento
   */
  fastify.post('/api/ai/session/stop', async (request, reply) => {
    const body = request.body as { session_id?: string; provider_id?: ProviderId };
    if (!body.session_id) {
      return reply.status(400).send({ error: 'session_id é obrigatório' });
    }

    const provider = providerManager.getProvider(body.provider_id);
    await provider.stopSession(body.session_id);
    return reply.send({ success: true, session_id: body.session_id });
  });

  /**
   * Endpoint de Chat Unificado (Suporta Modo Direto e Modo Conectado / Antigravity)
   */
  fastify.post('/api/chat', async (request, reply) => {
    const startTime = Date.now();
    const body = request.body as {
      prompt?: string;
      content?: string;
      path?: string;
      history?: any[];
      assistant_prompt?: string;
      raw_mode?: boolean;
      session_id?: string;
      repo?: string;
      allowed_tools?: string[];
      skill_id?: string;
      provider_id?: ProviderId;
    };

    const cfg = loadConfig();
    const repoName = body.repo || cfg.active_repo?.name || 'local';
    const sessionId = body.session_id || `sess-${Date.now()}`;
    const filePath = body.path || 'index.md';
    const prompt = (body.prompt || '').trim();
    const isRawMode = Boolean(body.raw_mode);
    const providerId = body.provider_id || (body.raw_mode ? 'direct-api' : cfg.ai_settings?.default_provider || 'direct-api');

    if (!prompt) {
      return reply.status(400).send({ error: 'Prompt não pode ser vazio.' });
    }

    const effectiveSkillIds: string[] = Array.isArray((body as any).skill_ids)
      ? (body as any).skill_ids
      : body.skill_id
        ? [body.skill_id]
        : [];

    const skillsMeta = effectiveSkillIds.map((sId) => {
      const sk = skillsService.resolveSkill(sId, repoName);
      return {
        id: sId,
        title: sk?.title || sk?.name || sId,
        description: sk?.description || 'Diretrizes especializadas',
      };
    });

    // Se for provedor conectado (ex: Antigravity / Claude Code)
    if (providerId !== 'direct-api') {
      const provider = providerManager.getProvider(providerId);
      const contextPointers = contextPointerService.buildContextPointers({
        repoName,
        activeFilePath: filePath,
        skillId: body.skill_id,
        skillIds: effectiveSkillIds,
        skillsMeta,
      });

      let ragContext = '';
      if (!isRawMode) {
        try {
          ragContext = ragService.buildContextPrompt(prompt, repoName, 3);
        } catch (ragErr) {
          console.warn('[AI Chat Connected] Falha ao consultar RAG:', ragErr);
        }
      }
      const rawBriefing = aiService.getBriefing(repoName, filePath);
      const briefing = `${rawBriefing}${ragContext ? `\n\n${ragContext}` : ''}`.trim();
      const streamEvents: ProviderStreamEvent[] = [];
      const currentAuthor = cfg.user?.name || cfg.user?.login || 'Developer';

      // Salva imediatamente a mensagem do usuário no histórico da sessão
      aiService.appendChatEvent(repoName, filePath, sessionId, 'user', prompt, { model: provider.name, author: currentAuthor });

      try {
        const result = await provider.sendMessage(
          sessionId,
          prompt,
          (event) => {
            streamEvents.push(event);
          },
          {
            history: (body.history || []).map((h) => ({ role: h.role, content: h.text || h.content || '' })),
            briefing,
            contextPointers,
            content: body.content,
          }
        );

        const durationMs = Date.now() - startTime;
        const historyText = (body.history || []).map((h) => `${h.role || h.sender}: ${h.text || h.content || ''}`).join('\n');
        const promptTokens = estimateTokens(prompt + (body.content ? `\n${body.content}` : '') + (briefing ? `\n${briefing}` : '') + (contextPointers?.join('\n') ? `\n${contextPointers.join('\n')}` : '') + (historyText ? `\n${historyText}` : ''));
        const completionTokens = estimateTokens(result.reply);
        const costInfo = calculateTokenCost(provider.name, promptTokens, completionTokens);

        const telemetryTurn: RawTurnTelemetryRecord = {
          turn_id: `turn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          turn_index: (body.history?.length ? Math.floor(body.history.length / 2) + 1 : 1),
          session_id: sessionId,
          timestamp: new Date().toISOString(),
          duration_ms: durationMs,
          provider: provider.id,
          model: provider.name,
          raw_mode: false,
          skill_id: body.skill_id,
          request: {
            prompt,
            system_prompt: briefing || '',
            context_files: filePath ? [{ path: filePath, size: body.content?.length || 0 }] : [],
            dynamic_context: body.content,
            history_messages: body.history || [],
            tools_schema: [],
            full_payload: body,
          },
          response: {
            reply: result.reply,
            tool_calls: result.toolCalls || [],
            stream_events: streamEvents,
            finish_reason: 'stop',
            raw_response: result,
          },
          metrics: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
            is_estimated: true,
            cost_usd: costInfo.costUsd,
            pricing_formula: costInfo.formula,
            duration_ms: durationMs,
          },
        };

        aiService.appendChatEvent(repoName, filePath, sessionId, 'model', result.reply, { model: provider.name, author: 'Agent' }, telemetryTurn);

        return reply.send({
          reply: result.reply,
          provider: provider.id,
          model: provider.name,
          session_id: sessionId,
          repo: repoName,
          tool_calls: result.toolCalls || [],
          steps_count: 1,
          telemetry_turn: telemetryTurn,
          usage: telemetryTurn.metrics,
        });
      } catch (err: any) {
        aiService.appendChatEvent(repoName, filePath, sessionId, 'model', `⚠️ ${err?.message || 'Erro ao comunicar com o agente conectado.'}`, { model: provider.name, author: 'Agent' });
        return reply.status(500).send({ error: err?.message || 'Erro ao comunicar com o agente conectado.' });
      }
    }

    // Modo Direto (Direct API - Gemini / OpenAI / Anthropic)
    let resolvedSkillPrompt = '';
    let skillTools: string[] = [];

    if (!isRawMode && effectiveSkillIds.length > 0) {
      for (const sId of effectiveSkillIds) {
        const activeSkill = skillsService.resolveSkill(sId, repoName);
        if (activeSkill) {
          resolvedSkillPrompt += `\n\n### SKILL ATIVA: ${activeSkill.title || activeSkill.name} (v${activeSkill.version})\n${activeSkill.content}\n`;
          if (Array.isArray(activeSkill.tools)) {
            skillTools.push(...activeSkill.tools);
          }
        }
      }
    }

    let resolvedAllowedTools: string[] | undefined = undefined;

    if (!isRawMode) {
      if (Array.isArray(body.allowed_tools) && body.allowed_tools.length > 0) {
        resolvedAllowedTools = Array.from(new Set([...body.allowed_tools, ...skillTools]));
      } else if (skillTools.length > 0) {
        resolvedAllowedTools = skillTools;
      } else {
        resolvedAllowedTools = toolRegistry.getAllTools().map((t) => t.name);
      }
    }

    const aiSettings = {
      ...(cfg.ai_settings || { provider: 'gemini', model: 'gemini-2.5-flash', api_key: '' }),
      allowed_tools: resolvedAllowedTools && resolvedAllowedTools.length > 0 ? resolvedAllowedTools : undefined,
    };

    let ragContext = '';
    if (!isRawMode) {
      try {
        ragContext = ragService.buildContextPrompt(prompt, repoName, 3);
      } catch (ragErr) {
        console.warn('[AI Chat Direct] Falha ao consultar RAG:', ragErr);
      }
    }

    const briefing = aiService.getBriefing(repoName, filePath);
    const basePrompt = body.assistant_prompt || cfg.settings?.global_system_prompt || '';
    const customSystem = `${basePrompt}${resolvedSkillPrompt}${briefing ? `\n\n${briefing}` : ''}${ragContext ? `\n\n${ragContext}` : ''}`.trim();

    const result = await aiService.callLLM(
      aiSettings,
      prompt,
      body.content || '',
      filePath,
      body.history || [],
      customSystem,
      repoName
    );

    const durationMs = result.duration_ms || (Date.now() - startTime);
    const historyText = (body.history || []).map((h) => `${h.role || h.sender}: ${h.text || h.content || ''}`).join('\n');
    const promptTokens = result.usage?.prompt_tokens || estimateTokens(prompt + (body.content ? `\n${body.content}` : '') + (customSystem ? `\n${customSystem}` : '') + (historyText ? `\n${historyText}` : ''));
    const completionTokens = result.usage?.completion_tokens || estimateTokens(result.reply);
    const costInfo = calculateTokenCost(result.model, promptTokens, completionTokens);

    const telemetryTurn: RawTurnTelemetryRecord = {
      turn_id: `turn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      turn_index: (body.history?.length ? Math.floor(body.history.length / 2) + 1 : 1),
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      duration_ms: durationMs,
      provider: result.provider,
      model: result.model,
      raw_mode: isRawMode,
      skill_id: body.skill_id,
      request: {
        prompt,
        system_prompt: customSystem,
        context_files: filePath ? [{ path: filePath, size: body.content?.length || 0 }] : [],
        dynamic_context: body.content,
        history_messages: body.history || [],
        tools_schema: resolvedAllowedTools || [],
        full_payload: body,
      },
      response: {
        reply: result.reply,
        tool_calls: result.tool_calls || [],
        finish_reason: 'stop',
        raw_response: result,
      },
      metrics: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
        is_estimated: result.usage?.is_estimated,
        cost_usd: result.usage?.cost_usd ?? costInfo.costUsd,
        pricing_formula: result.usage?.pricing_formula ?? costInfo.formula,
        duration_ms: durationMs,
      },
    };

    const currentAuthor = cfg.user?.name || cfg.user?.login || 'Developer';
    aiService.appendChatEvent(repoName, filePath, sessionId, 'user', prompt, { model: result.model, author: currentAuthor }, telemetryTurn);
    aiService.appendChatEvent(repoName, filePath, sessionId, 'model', result.reply, { model: result.model, author: 'Agent' }, telemetryTurn);

    return reply.send({
      reply: result.reply,
      provider: result.provider,
      model: result.model,
      session_id: sessionId,
      repo: repoName,
      tool_calls: result.tool_calls || [],
      steps_count: result.steps_count || 1,
      telemetry_turn: telemetryTurn,
      usage: telemetryTurn.metrics,
    });
  });

  /**
   * Endpoint de Streaming SSE em tempo real com Telemetria e Rastreamento de Tokens
   */
  fastify.post('/api/chat/stream', async (request, reply) => {
    const startTime = Date.now();
    const body = request.body as {
      prompt?: string;
      content?: string;
      path?: string;
      history?: any[];
      assistant_prompt?: string;
      raw_mode?: boolean;
      session_id?: string;
      repo?: string;
      allowed_tools?: string[];
      skill_id?: string;
      provider_id?: ProviderId;
    };

    const cfg = loadConfig();
    const repoName = body.repo || cfg.active_repo?.name || 'local';
    const sessionId = body.session_id || `sess-${Date.now()}`;
    const filePath = body.path || 'index.md';
    const prompt = (body.prompt || '').trim();
    const isRawMode = Boolean(body.raw_mode);
    const providerId = body.provider_id || (body.raw_mode ? 'direct-api' : cfg.ai_settings?.default_provider || 'direct-api');

    if (!prompt) {
      return reply.status(400).send({ error: 'Prompt não pode ser vazio.' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const recordedEvents: ProviderStreamEvent[] = [];
    let accumulatedReply = '';
    const executedToolCalls: any[] = [];
    let reportedUsage: any = null;

    const sendEvent = (event: ProviderStreamEvent) => {
      recordedEvents.push(event);
      if (event.type === 'token' && event.text) {
        accumulatedReply += event.text;
      }
      if (event.type === 'tool_result' && event.toolName) {
        executedToolCalls.push({
          tool: event.toolName,
          args: event.toolArgs,
          result: event.data,
          timestamp: new Date().toISOString(),
        });
      }
      if (event.type === 'stream_telemetry' && event.data?.usage) {
        reportedUsage = event.data.usage;
      }
      try {
        reply.raw.write(`data: ${safeJsonStringify(event)}\n\n`);
      } catch (writeErr) {
        console.error('[AI Stream] Erro ao enviar evento SSE:', writeErr);
      }
    };

    const provider = providerManager.getProvider(providerId);

    const effectiveStreamSkillIds: string[] = Array.isArray((body as any).skill_ids)
      ? (body as any).skill_ids
      : body.skill_id
        ? [body.skill_id]
        : [];

    const streamSkillsMeta = effectiveStreamSkillIds.map((sId) => {
      const sk = skillsService.resolveSkill(sId, repoName);
      return {
        id: sId,
        title: sk?.title || sk?.name || sId,
        description: sk?.description || 'Diretrizes especializadas',
      };
    });

    const contextPointers = contextPointerService.buildContextPointers({
      repoName,
      activeFilePath: filePath,
      skillId: body.skill_id,
      skillIds: effectiveStreamSkillIds,
      skillsMeta: streamSkillsMeta,
    });
    let streamRagContext = '';
    if (!isRawMode) {
      try {
        streamRagContext = ragService.buildContextPrompt(prompt, repoName, 3);
      } catch (ragErr) {
        console.warn('[AI Stream] Falha ao consultar RAG:', ragErr);
      }
    }

    const briefing = `${aiService.getBriefing(repoName, filePath)}${streamRagContext ? `\n\n${streamRagContext}` : ''}`.trim();

    let resolvedSkillPrompt = '';
    // Para Direct API, injetamos a skill no system prompt; para CLI, ela vai via contextPointers on-demand
    if (providerId === 'direct-api' && !isRawMode && effectiveStreamSkillIds.length > 0) {
      for (const sId of effectiveStreamSkillIds) {
        const activeSkill = skillsService.resolveSkill(sId, repoName);
        if (activeSkill) {
          resolvedSkillPrompt += `\n\n### SKILL ATIVA: ${activeSkill.title || activeSkill.name} (v${activeSkill.version})\n${activeSkill.content}\n`;
        }
      }
    }
    const basePrompt = body.assistant_prompt || cfg.settings?.global_system_prompt || '';
    const fullSystemPrompt = `${basePrompt}${resolvedSkillPrompt}${briefing ? `\n\n${briefing}` : ''}`.trim();

    const currentAuthor = cfg.user?.name || cfg.user?.login || 'Developer';
    aiService.appendChatEvent(repoName, filePath, sessionId, 'user', prompt, { model: provider.name, author: currentAuthor });

    try {
      const result = await provider.sendMessage(sessionId, prompt, sendEvent, {
        briefing: fullSystemPrompt,
        contextPointers,
        history: (body.history || []).map((h) => ({ role: h.role, content: h.text || h.content || '' })),
        content: body.content || '',
      });

      if (result && result.reply && !accumulatedReply) {
        accumulatedReply = result.reply;
      }

      const durationMs = Date.now() - startTime;
      const historyText = (body.history || []).map((h) => `${h.role || h.sender}: ${h.text || h.content || ''}`).join('\n');
      const promptTokens = reportedUsage?.prompt_tokens || estimateTokens(prompt + (body.content ? `\n${body.content}` : '') + (fullSystemPrompt ? `\n${fullSystemPrompt}` : '') + (historyText ? `\n${historyText}` : ''));
      const completionTokens = reportedUsage?.completion_tokens || estimateTokens(accumulatedReply);
      const costInfo = calculateTokenCost(provider.name, promptTokens, completionTokens);

      const telemetryTurn: RawTurnTelemetryRecord = {
        turn_id: `turn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        turn_index: (body.history?.length ? Math.floor(body.history.length / 2) + 1 : 1),
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        duration_ms: durationMs,
        provider: provider.id,
        model: provider.name,
        raw_mode: isRawMode,
        skill_id: body.skill_id,
        request: {
          prompt,
          system_prompt: fullSystemPrompt,
          context_files: filePath ? [{ path: filePath, size: body.content?.length || 0 }] : [],
          dynamic_context: body.content,
          history_messages: body.history || [],
          tools_schema: body.allowed_tools || [],
          full_payload: body,
        },
        response: {
          reply: accumulatedReply,
          tool_calls: executedToolCalls.length > 0 ? executedToolCalls : (result?.toolCalls || []),
          stream_events: [...recordedEvents],
          finish_reason: 'stop',
          raw_response: result,
        },
        metrics: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
          is_estimated: !reportedUsage,
          cost_usd: reportedUsage?.cost_usd ?? costInfo.costUsd,
          pricing_formula: reportedUsage?.pricing_formula ?? costInfo.formula,
          duration_ms: durationMs,
        },
      };

      // 1. Persiste a mensagem e o turno de telemetria no disco ANTES do encerramento
      aiService.appendChatEvent(repoName, filePath, sessionId, 'model', accumulatedReply, { model: provider.name, author: 'Agent' }, telemetryTurn);

      // 2. Envia telemetria para o frontend via SSE sem duplicar todo o array de eventos recebidos
      const streamTelemetryTurn: RawTurnTelemetryRecord = {
        ...telemetryTurn,
        response: {
          ...telemetryTurn.response,
          stream_events: [],
        },
      };

      sendEvent({
        type: 'stream_telemetry',
        provider: provider.id,
        sessionId,
        data: {
          telemetry: streamTelemetryTurn,
          metrics: telemetryTurn.metrics,
        },
        timestamp: Date.now(),
      });
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      console.error('[AI Stream] Erro durante streaming da sessão:', errorMsg);
      // Se já acumulou resposta da IA, preserva a resposta do modelo e não a substitui por mensagem de erro
      if (accumulatedReply.trim()) {
        aiService.appendChatEvent(repoName, filePath, sessionId, 'model', accumulatedReply, { model: provider.name, author: 'Agent' });
      } else {
        aiService.appendChatEvent(repoName, filePath, sessionId, 'model', `⚠️ ${errorMsg}`, { model: provider.name, author: 'Agent' });
      }
      sendEvent({
        type: 'error',
        provider: provider.id,
        sessionId,
        data: errorMsg,
        timestamp: Date.now(),
      });
    } finally {
      reply.raw.end();
    }
  });

  fastify.get('/api/ai/tools', async (_request, reply) => {
    const tools = toolRegistry.getAllTools();
    return reply.send({
      count: tools.length,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    });
  });

  fastify.get('/api/chat/memory/brief', async (request, reply) => {
    const query = request.query as { repo?: string; path?: string };
    const cfg = loadConfig();
    const repoName = query.repo || cfg.active_repo?.name || 'local';
    const briefing = aiService.getBriefing(repoName, query.path || 'index.md');
    return reply.send({ briefing });
  });

  fastify.get('/api/chat/memory/history', async (request, reply) => {
    const query = request.query as { repo?: string; path?: string; session_id?: string };
    const cfg = loadConfig();
    const repoName = query.repo || cfg.active_repo?.name || 'local';
    return reply.send(aiService.getChatHistory(repoName, query.session_id, query.path));
  });

  fastify.get('/api/chat/memory/session', async (request, reply) => {
    const query = request.query as { repo?: string; session_id?: string };
    const cfg = loadConfig();
    const repoName = query.repo || cfg.active_repo?.name || 'local';
    const sessionData = aiService.getSessionDetails(repoName, query.session_id);
    return reply.send({ session: sessionData });
  });

  fastify.delete('/api/chat/memory/session', async (request, reply) => {
    const query = request.query as { repo?: string; session_id?: string };
    const cfg = loadConfig();
    const repoName = query.repo || cfg.active_repo?.name || 'local';
    if (!query.session_id) {
      return reply.status(400).send({ error: 'session_id é obrigatório' });
    }
    return reply.send(aiService.deleteSession(repoName, query.session_id));
  });

  fastify.get('/api/chat/memory/actor', async (_request, reply) => {
    const cfg = loadConfig();
    return reply.send({
      actor: cfg.user ? { name: cfg.user.name || cfg.user.login, role: 'Developer' } : { name: 'Dev Local', role: 'Developer' },
    });
  });

  fastify.post('/api/chat/memory/event', async (request, reply) => {
    const body = request.body as { repo?: string; path?: string; session_id?: string; role?: string; text?: string };
    const cfg = loadConfig();
    const repoName = body.repo || cfg.active_repo?.name || 'local';
    const sessionId = body.session_id || `${Date.now()}`;
    aiService.appendChatEvent(repoName, body.path || 'index.md', sessionId, body.role || 'user', body.text || '');
    return reply.send({ success: true, session_id: sessionId });
  });

  fastify.post('/api/chat/memory/finalize', async (request, reply) => {
    const body = request.body as { repo?: string; path?: string; session_id?: string; summary?: string };
    const cfg = loadConfig();
    const repoName = body.repo || cfg.active_repo?.name || 'local';
    if (!body.session_id) {
      return reply.status(400).send({ error: 'session_id é obrigatório' });
    }
    return reply.send(aiService.finalizeSession(repoName, body.path || 'index.md', body.session_id, body.summary));
  });

  fastify.post('/api/chat/memory/reset', async (request, reply) => {
    const body = request.body as { repo?: string };
    const cfg = loadConfig();
    const repoName = body?.repo || cfg.active_repo?.name || 'local';
    return reply.send(aiService.resetMemory(repoName));
  });
}

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AISettingsState, ChatMessage, RawTurnTelemetry, RawTurnMetrics } from '../types';
import { API } from '../services/api';
import { useWorkspace } from './WorkspaceContext';
import { useTemplateStore } from '../stores/templateStore';
import { useEditorStore } from '../stores/editorStore';
import { useCopilotStore, type DynamicContext } from '../stores/copilotStore';
import { estimateTokens, calculateTokenCost } from '../utils/token-costs';

export type { DynamicContext };

interface AIContextType {
  aiSettings: AISettingsState | null;
  isSettingsModalOpen: boolean;
  messages: ChatMessage[];
  isThinking: boolean;
  dynamicContext: DynamicContext | null;
  setDynamicContext: (ctx: DynamicContext | null) => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  loadAISettings: () => Promise<void>;
  saveAISettings: (
    provider: string,
    model: string,
    apiKey?: string,
    customEndpoint?: string,
    extraHarness?: {
      default_provider?: string;
      antigravity_cli_path?: string;
      claude_cli_path?: string;
      agent_effort?: 'low' | 'medium' | 'high';
      agent_model?: string;
    }
  ) => Promise<boolean>;
  saveSettings: (payload: { active_provider: string; active_model: string; api_keys?: Record<string, string>; custom_endpoint?: string }) => Promise<boolean>;
  quickSetModel: (provider: string, model: string) => Promise<boolean>;
  sendMessage: (prompt: string, contextBadges?: string[]) => Promise<void>;
  stopGeneration: () => Promise<void>;
  clearMessages: () => void;
  newChatSession: () => string;
  restoreSession: (sessionId: string) => Promise<boolean>;
  resetMemory: (scope: string) => Promise<void>;

  // Session & Multi-Document References
  currentSessionId: string;
  referencedDocs: string[];
  isGlobalScope: boolean;
  setReferencedDocs: (docs: string[]) => void;
  addReferencedDoc: (path: string) => void;
  removeReferencedDoc: (path: string) => void;
  setIsGlobalScope: (isGlobal: boolean) => void;

  // Connected Providers & Approvals
  activeProviderId: string;
  setActiveProviderId: (id: string) => void;
  pendingApproval: { prompt: string; sessionId: string; providerId?: string } | null;
  setPendingApproval: (approval: { prompt: string; sessionId: string; providerId?: string } | null) => void;
  approveAction: (sessionId: string, customInput?: string) => Promise<void>;
  rejectAction: (sessionId: string) => Promise<void>;

  // Skills & RAW Mode
  activeSkillId: string | null;
  activeSkillIds: string[];
  templateSkills: string[];
  isRawMode: boolean;
  isSkillsModalOpen: boolean;
  setActiveSkillId: (id: string | null) => void;
  setActiveSkillIds: (ids: string[]) => void;
  toggleSkill: (id: string) => void;
  addActiveSkill: (id: string) => void;
  removeActiveSkill: (id: string) => void;
  setIsRawMode: (isRaw: boolean) => void;
  openSkillsModal: () => void;
  closeSkillsModal: () => void;

  // Template Prompt Context & Toggles
  templatePrompt: string | null;
  templateTitle: string | null;
  templateId: string | null;
  isTemplatePromptEnabled: boolean;
  toggleTemplatePrompt: () => void;

  // Document Prompt Context & Toggles
  docPrompt: string | null;
  isDocPromptEnabled: boolean;
  toggleDocPrompt: () => void;

  // Template Creator Mode & Project Level Prompts
  isTemplateEditorMode: boolean;
  setIsTemplateEditorMode: (val: boolean) => void;
  projectTemplatePrompt: string;
}

const generateUniqueMessageId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
};

const generateTurnId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `turn-${crypto.randomUUID()}`;
  }
  return `turn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
};

const getNowTimestamp = (): number => {
  return Date.now();
};

const AIContext = createContext<AIContextType | undefined>(undefined);

export const AIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    activeRepo,
    activeFile,
    fileMetadata,
    projectConfig,
    tree,
    reloadActiveFile,
    loadTree,
    refreshPendingChanges,
    refreshGitStatus,
  } = useWorkspace();
  
  // Zustand Stores
  const activeEditingTemplate = useTemplateStore((s) => s.activeEditingTemplate);
  const isTemplateEditorMode = useTemplateStore((s) => s.isTemplateEditorMode);
  const setIsTemplateEditorMode = useTemplateStore((s) => s.setIsTemplateEditorMode);
  const resolveTemplate = useTemplateStore((s) => s.resolveTemplate);

  const messages = useCopilotStore((s) => s.messages);
  const isThinking = useCopilotStore((s) => s.isThinking);
  const setIsThinking = useCopilotStore((s) => s.setIsThinking);
  const aiSettings = useCopilotStore((s) => s.aiSettings);
  const setAiSettings = useCopilotStore((s) => s.setAiSettings);
  const isSettingsModalOpen = useCopilotStore((s) => s.isSettingsModalOpen);
  const openSettingsModal = useCopilotStore((s) => s.openSettingsModal);
  const closeSettingsModal = useCopilotStore((s) => s.closeSettingsModal);
  const dynamicContext = useCopilotStore((s) => s.dynamicContext);
  const setDynamicContext = useCopilotStore((s) => s.setDynamicContext);

  const currentSessionId = useCopilotStore((s) => s.currentSessionId);
  const setCurrentSessionId = useCopilotStore((s) => s.setCurrentSessionId);
  const newChatSession = useCopilotStore((s) => s.newChatSession);
  const referencedDocs = useCopilotStore((s) => s.referencedDocs);
  const isGlobalScope = useCopilotStore((s) => s.isGlobalScope);
  const setReferencedDocs = useCopilotStore((s) => s.setReferencedDocs);
  const addReferencedDoc = useCopilotStore((s) => s.addReferencedDoc);
  const removeReferencedDoc = useCopilotStore((s) => s.removeReferencedDoc);
  const setIsGlobalScope = useCopilotStore((s) => s.setIsGlobalScope);

  const activeSkillId = useCopilotStore((s) => s.activeSkillId);
  const activeSkillIds = useCopilotStore((s) => s.activeSkillIds);
  const isRawMode = useCopilotStore((s) => s.isRawMode);
  const isSkillsModalOpen = useCopilotStore((s) => s.isSkillsModalOpen);
  const setActiveSkillId = useCopilotStore((s) => s.setActiveSkillId);
  const setActiveSkillIds = useCopilotStore((s) => s.setActiveSkillIds);
  const setTemplateSkills = useCopilotStore((s) => s.setTemplateSkills);
  const toggleSkill = useCopilotStore((s) => s.toggleSkill);
  const addActiveSkill = useCopilotStore((s) => s.addActiveSkill);
  const removeActiveSkill = useCopilotStore((s) => s.removeActiveSkill);
  const setIsRawMode = useCopilotStore((s) => s.setIsRawMode);
  const openSkillsModal = useCopilotStore((s) => s.openSkillsModal);
  const closeSkillsModal = useCopilotStore((s) => s.closeSkillsModal);

  const isTemplatePromptEnabled = useCopilotStore((s) => s.isTemplatePromptEnabled);
  const toggleTemplatePrompt = useCopilotStore((s) => s.toggleTemplatePrompt);
  const isDocPromptEnabled = useCopilotStore((s) => s.isDocPromptEnabled);
  const toggleDocPrompt = useCopilotStore((s) => s.toggleDocPrompt);

  const [docTemplatePrompt, setDocTemplatePrompt] = useState<string | null>(null);
  const [docTemplateTitle, setDocTemplateTitle] = useState<string | null>(null);
  const docTemplateId = fileMetadata?.templateId || null;
  const [docTemplateSkills, setDocTemplateSkills] = useState<string[]>([]);

  const projectTemplatePrompt = projectConfig?.ai_template_prompt || 'Você é o Arquiteto Especialista em Criação e Padronização de Templates de Engenharia.\nAjude o usuário a definir uma estrutura lógica e rigorosa de seções (H1, H2, H3), criar placeholders dinâmicos {{CAMPO}} e redigir o system instruction do Copilot para este novo template.';

  // Real-time Template Context: If user is actively editing a template in TemplatesSubView, use activeEditingTemplate
  const templatePrompt = isTemplateEditorMode && activeEditingTemplate
    ? (activeEditingTemplate.prompt || activeEditingTemplate.systemPrompt || null)
    : docTemplatePrompt;

  const templateTitle = isTemplateEditorMode && activeEditingTemplate
    ? (activeEditingTemplate.title || activeEditingTemplate.templateName || activeEditingTemplate.id || 'Template')
    : docTemplateTitle;

  const templateId = isTemplateEditorMode && activeEditingTemplate
    ? (activeEditingTemplate.id || null)
    : docTemplateId;

  const effectiveTemplateSkills = isTemplateEditorMode && activeEditingTemplate
    ? (Array.isArray(activeEditingTemplate.skills) ? activeEditingTemplate.skills : [])
    : docTemplateSkills;

  // Document Prompt State
  const docPrompt = fileMetadata?.prompt || null;

  // Reactively resolve template when activeFile metadata has templateId
  useEffect(() => {
    let isCancelled = false;
    const currentTemplateId = fileMetadata?.templateId || null;
    if (currentTemplateId) {
      resolveTemplate(currentTemplateId).then((tpl) => {
        if (isCancelled) return;
        if (tpl) {
          setDocTemplatePrompt(tpl.prompt || tpl.systemPrompt || null);
          setDocTemplateTitle(tpl.title || tpl.templateName || tpl.id || null);
          const tplSkills = Array.isArray(tpl.skills) ? tpl.skills : (Array.isArray(fileMetadata?.skills) ? fileMetadata.skills : []);
          setDocTemplateSkills(tplSkills);
          setTemplateSkills(tplSkills);
        } else {
          setDocTemplatePrompt(null);
          setDocTemplateTitle(null);
          setDocTemplateSkills([]);
          setTemplateSkills([]);
        }
      });
    } else {
      queueMicrotask(() => {
        if (isCancelled) return;
        setDocTemplatePrompt(null);
        setDocTemplateTitle(null);
        setDocTemplateSkills([]);
        setTemplateSkills([]);
      });
    }
    return () => {
      isCancelled = true;
    };
  }, [fileMetadata?.templateId, fileMetadata?.skills, activeRepo?.name, resolveTemplate, setTemplateSkills]);

  // Sync template skills when in Template Editor mode
  useEffect(() => {
    if (isTemplateEditorMode && activeEditingTemplate) {
      const skills = Array.isArray(activeEditingTemplate.skills) ? activeEditingTemplate.skills : [];
      setTemplateSkills(skills);
    }
  }, [isTemplateEditorMode, activeEditingTemplate, setTemplateSkills]);

  // Keep activeFile referenced when not in global scope and no custom references set yet
  useEffect(() => {
    if (activeFile && !isGlobalScope && referencedDocs.length === 0) {
      setReferencedDocs([activeFile]);
    }
  }, [activeFile, isGlobalScope, referencedDocs.length, setReferencedDocs]);

  const loadAISettings = useCallback(async () => {
    try {
      const res = await API.getAISettings();
      if (res.ok && res.data) {
        setAiSettings(res.data);
      }
    } catch (err) {
      console.error('[AIContext] Erro ao carregar configurações de IA:', err);
    }
  }, [setAiSettings]);

  useEffect(() => {
    loadAISettings();
  }, [loadAISettings]);

  const saveAISettings = async (
    provider: string,
    model: string,
    apiKey?: string,
    customEndpoint?: string,
    extraHarness?: {
      default_provider?: string;
      antigravity_cli_path?: string;
      claude_cli_path?: string;
      agent_effort?: 'low' | 'medium' | 'high';
      agent_model?: string;
    }
  ): Promise<boolean> => {
    try {
      const res = await API.saveAISettings({
        provider,
        model,
        api_key: apiKey,
        custom_endpoint: customEndpoint,
        ...extraHarness,
      });
      if (res.ok) {
        await loadAISettings();
        closeSettingsModal();
        return true;
      }
      return false;
    } catch (err) {
      console.error('[AIContext] Erro ao salvar configurações de IA:', err);
      return false;
    }
  };

  const quickSetModel = async (provider: string, model: string): Promise<boolean> => {
    try {
      const res = await API.saveAISettings({
        provider,
        model,
      });
      if (res.ok) {
        await loadAISettings();
        return true;
      }
      return false;
    } catch (err) {
      console.error('[AIContext] Erro ao trocar modelo rapidamente:', err);
      return false;
    }
  };

  const restoreSession = async (sessionId: string): Promise<boolean> => {
    try {
      const res = await API.getMemorySession({ repo: activeRepo?.name || 'local', session_id: sessionId });
      const sess = res.ok && res.data?.session ? res.data.session : null;
      if (sess && Array.isArray(sess.events)) {
        let telemetryTurns: RawTurnTelemetry[] = Array.isArray(sess.telemetry_turns) && sess.telemetry_turns.length > 0 ? sess.telemetry_turns : [];

        if (telemetryTurns.length === 0) {
          // Reconstrói a telemetria com histórico cumulativo turno a turno para sessões legadas
          const reconstructed: RawTurnTelemetry[] = [];
          for (let i = 0; i < sess.events.length; i++) {
            const ev = sess.events[i];
            const isAssistant = ev.role === 'model' || ev.role === 'assistant';
            if (isAssistant) {
              const turnIdx = Math.floor(i / 2) + 1;
              const userEv = sess.events[i - 1];
              const priorEvents = sess.events.slice(0, i - 1);
              const histText = priorEvents.map((h: any) => `${h.role || h.sender}: ${h.text || h.content || ''}`).join('\n');
              const activeModel = aiSettings?.active_model || 'gemini-2.5-flash';
              const pTokens = estimateTokens((userEv?.text || userEv?.content || '') + (sess.path && sess.path !== 'Global' ? `\n${sess.path}` : '') + (histText ? `\n${histText}` : ''));
              const cTokens = estimateTokens(ev.text || ev.content || '');
              const cost = calculateTokenCost(activeModel, pTokens, cTokens);

              reconstructed.push({
                turn_id: `restored-turn-${sessionId}-${turnIdx}`,
                turn_index: turnIdx,
                session_id: sessionId,
                timestamp: ev.timestamp || new Date().toISOString(),
                duration_ms: 1000,
                provider: 'direct-api',
                model: activeModel,
                raw_mode: false,
                request: {
                  prompt: userEv?.text || userEv?.content || '',
                  system_prompt: '',
                  context_files: sess.path && sess.path !== 'Global' ? [{ path: sess.path }] : [],
                  history_messages: priorEvents,
                  tools_schema: [],
                  full_payload: { prompt: userEv?.text, path: sess.path },
                },
                response: {
                  reply: ev.text || ev.content || '',
                  tool_calls: [],
                  finish_reason: 'stop',
                  raw_response: ev,
                },
                metrics: {
                  prompt_tokens: pTokens,
                  completion_tokens: cTokens,
                  total_tokens: pTokens + cTokens,
                  is_estimated: true,
                  cost_usd: cost.costUsd,
                  pricing_formula: cost.formula,
                  duration_ms: 1000,
                },
              });
            }
          }
          if (reconstructed.length > 0) {
            telemetryTurns = reconstructed;
          }
        }

        if (telemetryTurns.length > 0) {
          useCopilotStore.getState().setSessionTelemetry(sessionId, telemetryTurns);
        }

        const restoredMessages: ChatMessage[] = sess.events.map((ev: any, idx: number) => {
          const isAssistant = ev.role === 'model' || ev.role === 'assistant';
          let turnMetrics: RawTurnMetrics | undefined = undefined;
          let rawTurnId: string | undefined = undefined;
          let turnIdx: number | undefined = undefined;

          if (isAssistant && telemetryTurns.length > 0) {
            const roundNum = Math.floor(idx / 2);
            const matchedTurn = telemetryTurns[roundNum] || telemetryTurns.find((t) => t.response?.reply === ev.text);
            if (matchedTurn) {
              turnMetrics = matchedTurn.metrics;
              rawTurnId = matchedTurn.turn_id;
              turnIdx = matchedTurn.turn_index;
            }
          }

          let msgContent = ev.text || '';
          if (msgContent.includes('Converting circular structure to JSON')) {
            msgContent = '⚠️ [Interrupção na persistência do histórico]: A resposta deste turno foi transmitida em tempo real via agente, mas a serialização de telemetria no servidor sofreu uma referência circular que foi corrigida.';
          }

          return {
            id: `restored-${sessionId}-${idx}`,
            sender: isAssistant ? 'assistant' : 'user',
            content: msgContent,
            timestamp: ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
            metrics: turnMetrics,
            raw_turn_id: rawTurnId,
            turn_index: turnIdx,
          };
        });

        useCopilotStore.getState().setMessages(restoredMessages);
        setCurrentSessionId(sessionId);
        if (sess.path && sess.path !== 'Global') {
          setReferencedDocs([sess.path]);
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error('[AIContext] Erro ao restaurar sessão:', err);
      return false;
    }
  };

  const sendMessage = async (prompt: string, contextBadges?: string[]) => {
    if (!prompt.trim()) return;

    const inTemplateMode = Boolean(isTemplateEditorMode);
    const currentTemplate = activeEditingTemplate || {};

    let effectivePath = 'Global';
    let effectiveContent = '';
    let effectiveBadges = contextBadges || [];

    if (inTemplateMode) {
      effectivePath = currentTemplate.templateName || currentTemplate.title || 'Novo Template';
      effectiveContent = currentTemplate.content || '';
      effectiveBadges = ['Modo Template'];
    } else if (isGlobalScope || referencedDocs.length === 0) {
      effectivePath = 'Global (Sem Documento)';
      effectiveContent = '';
      effectiveBadges = ['Modo Global'];
    } else {
      // 1 ou múltiplas referências (podendo ser arquivos ou pastas inteiras)
      const pathDescriptions: string[] = [];
      const contentsList: string[] = [];
      const computedBadges: string[] = [];
      const processedFiles = new Set<string>();

      // Helper to collect all files inside a folder node from tree
      const collectFilesFromTree = (targetPath: string): string[] => {
        const findNode = (nodes: any[]): any => {
          for (const n of nodes) {
            if (n.path === targetPath) return n;
            if (n.children && n.children.length > 0) {
              const found = findNode(n.children);
              if (found) return found;
            }
          }
          return null;
        };

        const collect = (node: any): string[] => {
          const isDir = node.type === 'dir' || node.type === 'directory' || node.is_directory;
          if (!isDir) return [node.path];
          let collected: string[] = [];
          if (Array.isArray(node.children)) {
            for (const child of node.children) {
              collected = collected.concat(collect(child));
            }
          }
          return collected;
        };

        const node = findNode(tree || []);
        if (!node) return [targetPath];
        return collect(node);
      };

      for (const refPath of referencedDocs) {
        const files = collectFilesFromTree(refPath);
        const isFolder = files.length > 1 || (files.length === 1 && files[0] !== refPath);
        const folderName = refPath.split('/').pop() || refPath;

        if (isFolder) {
          pathDescriptions.push(`${refPath}/ (${files.length} docs)`);
          computedBadges.push(`${folderName}/ (${files.length})`);

          const folderContents: string[] = [];
          for (const f of files) {
            if (processedFiles.has(f)) continue;
            processedFiles.add(f);
            if (f === activeFile) {
              folderContents.push(`--- Arquivo: ${f} ---\n${useEditorStore.getState().fileContent}`);
            } else {
              try {
                const docData = await API.getProjectFile(f);
                if (docData && docData.content) {
                  folderContents.push(`--- Arquivo: ${f} ---\n${docData.content}`);
                }
              } catch {}
            }
          }
          if (folderContents.length > 0) {
            contentsList.push(`=== [PASTA NO CONTEXTO: ${refPath}/ (${files.length} arquivos)] ===\n${folderContents.join('\n\n')}`);
          }
        } else {
          // Arquivo individual
          const f = files[0] || refPath;
          const fileName = f.split('/').pop() || f;
          pathDescriptions.push(f);
          computedBadges.push(fileName);

          if (!processedFiles.has(f)) {
            processedFiles.add(f);
            if (f === activeFile) {
              contentsList.push(`=== DOCUMENTO: ${f} ===\n${useEditorStore.getState().fileContent}`);
            } else {
              try {
                const docData = await API.getProjectFile(f);
                if (docData && docData.content) {
                  contentsList.push(`=== DOCUMENTO: ${f} ===\n${docData.content}`);
                }
              } catch {}
            }
          }
        }
      }

      effectivePath = pathDescriptions.join(', ');
      effectiveBadges = computedBadges;
      effectiveContent = contentsList.join('\n\n\n');
    }

    if (dynamicContext?.content) {
      effectiveContent = `${effectiveContent ? effectiveContent + '\n\n' : ''}=== CONTEXTO DINÂMICO SELECIONADO ===\n${dynamicContext.content}`;
      if (dynamicContext.badge) effectiveBadges.push(dynamicContext.badge);
    }

    const userMessage: ChatMessage = {
      id: generateUniqueMessageId('msg-user'),
      sender: 'user',
      content: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      contextBadges: effectiveBadges,
      skill_id: isRawMode ? undefined : (activeSkillId || undefined),
    };

    const store = useCopilotStore.getState();
    store.addMessage(userMessage);
    store.clearThinkingLogs();
    store.setThinkingStep(activeProviderId === 'antigravity' ? 'Iniciando Antigravity Agent...' : 'Preparando requisição...');
    setIsThinking(true);

    const stepTimer1 = setTimeout(() => {
      useCopilotStore.getState().setThinkingStep(activeProviderId === 'antigravity' ? 'Conectando ao Antigravity Agent local...' : 'Enviando prompt ao modelo...');
    }, 2000);

    const stepTimer2 = setTimeout(() => {
      useCopilotStore.getState().setThinkingStep('Explorando workspace e lendo arquivos...');
    }, 6000);

    const stepTimer3 = setTimeout(() => {
      useCopilotStore.getState().setThinkingStep('Executando operações e estruturando dados...');
    }, 14000);

    const stepTimer4 = setTimeout(() => {
      useCopilotStore.getState().setThinkingStep('Validando schema e finalizando resposta...');
    }, 26000);

    try {
      const historyPayload = useCopilotStore.getState().messages.map((m) => ({
        sender: m.sender,
        text: m.content,
      }));

      // Combine active prompts based on context and user toggles
      const promptInstructions: string[] = [];

      if (inTemplateMode) {
        promptInstructions.push(`[Instruções do Especialista em Criação de Templates (ai_template_prompt)]:\n${projectTemplatePrompt}`);
        if (currentTemplate.prompt && currentTemplate.prompt.trim()) {
          promptInstructions.push(`[Instruções do Template em Edição "${currentTemplate.title || 'Template'}"]:\n${currentTemplate.prompt.trim()}`);
        }
      } else {
        if (isTemplatePromptEnabled && templatePrompt && templatePrompt.trim()) {
          promptInstructions.push(`[Instruções do Template "${templateTitle || 'Template'}"]:\n${templatePrompt.trim()}`);
        }
        if (isDocPromptEnabled && docPrompt && docPrompt.trim()) {
          promptInstructions.push(`[Instruções Específicas deste Documento]:\n${docPrompt.trim()}`);
        }
      }

      // Injeção de Fragmentos RAG Anexados pelo Usuário
      const activeRagRefs = useCopilotStore.getState().ragReferences;
      if (activeRagRefs.length > 0) {
        const ragBlock = activeRagRefs
          .map((r) => `[FRAGMENTO REFERENCIADO: ${r.relativePath} (${r.sectionTitle})]\n${r.snippet}`)
          .join('\n\n');
        promptInstructions.push(`### FRAGMENTOS DO PROJETO ANEXADOS (RAG):\n${ragBlock}`);
      }

      const assistantPrompt = promptInstructions.length > 0 ? promptInstructions.join('\n\n---\n\n') : undefined;
      const turnStartTime = getNowTimestamp();
      const currentHistoryLength = useCopilotStore.getState().messages.length;
      const turnIndex = Math.floor(currentHistoryLength / 2) + 1;
      const turnId = generateTurnId();

      const activeSkillsList = useCopilotStore.getState().activeSkillIds;
      const primarySkillId = activeSkillsList[0] || activeSkillId || undefined;
      const isAutoRag = useCopilotStore.getState().isAutoRagEnabled;

      const chatPayload = {
        prompt,
        content: effectiveContent,
        path: effectivePath,
        history: historyPayload,
        session_id: currentSessionId,
        repo: activeRepo?.name || 'local',
        assistant_prompt: assistantPrompt,
        raw_mode: isRawMode,
        skill_id: isRawMode ? undefined : primarySkillId,
        skill_ids: isRawMode ? undefined : (activeSkillsList.length > 0 ? activeSkillsList : (primarySkillId ? [primarySkillId] : undefined)),
        provider_id: isRawMode ? 'direct-api' : (activeProviderId || 'direct-api'),
        auto_rag: isAutoRag,
      };

      let accumulatedReply = '';
      const assistantMsgId = generateUniqueMessageId('msg-ai');
      let createdAssistantMsg = false;
      const streamEventsList: any[] = [];
      let receivedTelemetry: any = null;
      let receivedToolCalls: any[] = [];

      try {
        await API.streamChatMessage(chatPayload, (event) => {
          streamEventsList.push(event);

          if (event.type === 'token' && event.text) {
            accumulatedReply += event.text;
            if (!createdAssistantMsg) {
              createdAssistantMsg = true;
              useCopilotStore.getState().addMessage({
                id: assistantMsgId,
                sender: 'assistant',
                content: accumulatedReply,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                skill_id: isRawMode ? undefined : primarySkillId,
                raw_turn_id: turnId,
                turn_index: turnIndex,
              });
            } else {
              useCopilotStore.getState().setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsgId ? { ...m, content: accumulatedReply } : m))
              );
            }
          } else if (event.type === 'tool_result' && event.toolName) {
            receivedToolCalls.push({
              tool: event.toolName,
              args: event.toolArgs,
              result: event.data,
              timestamp: new Date().toISOString(),
            });
          } else if (event.type === 'stream_telemetry' && event.data?.telemetry) {
            receivedTelemetry = event.data.telemetry;
          } else if (event.type === 'approval_request') {
            useCopilotStore.getState().setPendingApproval({
              prompt: event.approvalPrompt || 'Aprovação necessária para prosseguir',
              sessionId: event.sessionId || currentSessionId,
              providerId: event.provider,
            });
          }
        });

        if (!createdAssistantMsg && accumulatedReply.trim()) {
          useCopilotStore.getState().addMessage({
            id: assistantMsgId,
            sender: 'assistant',
            content: accumulatedReply,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            skill_id: isRawMode ? undefined : primarySkillId,
            raw_turn_id: turnId,
            turn_index: turnIndex,
          });
        }

        const durationMs = getNowTimestamp() - turnStartTime;
        const activeModelName = aiSettings?.active_model || 'gemini-2.5-flash';
        const historyText = historyPayload.map((h) => `${h.sender}: ${h.text}`).join('\n');
        const calculatedPromptTokens = estimateTokens(prompt + (effectiveContent ? `\n${effectiveContent}` : '') + (assistantPrompt ? `\n${assistantPrompt}` : '') + (historyText ? `\n${historyText}` : ''));
        const promptTokens = (receivedTelemetry as RawTurnTelemetry | null)?.metrics?.prompt_tokens || calculatedPromptTokens;
        const completionTokens = (receivedTelemetry as RawTurnTelemetry | null)?.metrics?.completion_tokens || estimateTokens(accumulatedReply);
        const costInfo = calculateTokenCost(activeModelName, promptTokens, completionTokens);

        const turnTelemetry: RawTurnTelemetry = receivedTelemetry
          ? {
              ...(receivedTelemetry as RawTurnTelemetry),
              response: {
                ...(receivedTelemetry as RawTurnTelemetry).response,
                stream_events: (receivedTelemetry as RawTurnTelemetry).response?.stream_events?.length
                  ? (receivedTelemetry as RawTurnTelemetry).response.stream_events
                  : streamEventsList,
              },
            }
          : {
          turn_id: turnId,
          turn_index: turnIndex,
          session_id: currentSessionId,
          timestamp: new Date().toISOString(),
          duration_ms: durationMs,
          provider: isRawMode ? 'direct-api' : (activeProviderId || 'direct-api'),
          model: activeModelName,
          raw_mode: isRawMode,
          skill_id: primarySkillId,
          request: {
            prompt,
            system_prompt: assistantPrompt,
            context_files: referencedDocs.map((p) => ({ path: p })),
            dynamic_context: dynamicContext?.content,
            history_messages: historyPayload,
            tools_schema: [],
            full_payload: chatPayload,
          },
          response: {
            reply: accumulatedReply,
            tool_calls: receivedToolCalls,
            stream_events: streamEventsList,
            finish_reason: 'stop',
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

        useCopilotStore.getState().addSessionTelemetryTurn(currentSessionId, turnTelemetry);

        // Atualiza a mensagem da IA com as métricas do turno
        useCopilotStore.getState().setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  metrics: turnTelemetry.metrics,
                  raw_turn_id: turnTelemetry.turn_id,
                  turn_index: turnTelemetry.turn_index,
                }
              : m
          )
        );
      } catch {
        // Fallback síncrono em caso de indisponibilidade de streaming
        const res = await API.sendChatMessage(chatPayload);

        if (res.ok && res.data) {
          let proposedDiff = res.data.diff;
          if (!proposedDiff && Array.isArray(res.data.tool_calls)) {
            const diffTool = res.data.tool_calls.find((tc) => tc.tool === 'docs_propose_diff');
            if (diffTool && diffTool.result?.data) {
              proposedDiff = {
                path: diffTool.result.data.file_path,
                old_content: diffTool.result.data.original_content,
                new_content: diffTool.result.data.proposed_content,
                rationale: diffTool.result.data.rationale,
              };
            }
          }

          const durationMs = getNowTimestamp() - turnStartTime;
          const activeModelName = res.data.model || aiSettings?.active_model || 'gemini-2.5-flash';
          const historyText = historyPayload.map((h) => `${h.sender}: ${h.text}`).join('\n');
          const calculatedPromptTokens = estimateTokens(prompt + (effectiveContent ? `\n${effectiveContent}` : '') + (assistantPrompt ? `\n${assistantPrompt}` : '') + (historyText ? `\n${historyText}` : ''));
          const promptTokens = res.data.usage?.prompt_tokens || calculatedPromptTokens;
          const completionTokens = res.data.usage?.completion_tokens || estimateTokens(res.data.reply || '');
          const costInfo = calculateTokenCost(activeModelName, promptTokens, completionTokens);

          const turnTelemetry: RawTurnTelemetry = (res.data as any).telemetry_turn || {
            turn_id: turnId,
            turn_index: turnIndex,
            session_id: currentSessionId,
            timestamp: new Date().toISOString(),
            duration_ms: durationMs,
            provider: res.data.provider || (isRawMode ? 'direct-api' : (activeProviderId || 'direct-api')),
            model: activeModelName,
            raw_mode: isRawMode,
            skill_id: primarySkillId,
            request: {
              prompt,
              system_prompt: assistantPrompt,
              context_files: referencedDocs.map((p) => ({ path: p })),
              dynamic_context: dynamicContext?.content,
              history_messages: historyPayload,
              tools_schema: [],
              full_payload: chatPayload,
            },
            response: {
              reply: res.data.reply || '',
              tool_calls: res.data.tool_calls || [],
              finish_reason: 'stop',
              raw_response: res.data,
            },
            metrics: res.data.usage || {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: promptTokens + completionTokens,
              is_estimated: true,
              cost_usd: costInfo.costUsd,
              pricing_formula: costInfo.formula,
              duration_ms: durationMs,
            },
          };

          useCopilotStore.getState().addSessionTelemetryTurn(currentSessionId, turnTelemetry);

          const assistantMessage: ChatMessage = {
            id: generateUniqueMessageId('msg-ai'),
            sender: 'assistant',
            content: res.data.reply || 'Operação concluída com sucesso.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            diff: proposedDiff,
            tool_calls: res.data.tool_calls,
            steps_count: res.data.steps_count,
            skill_id: isRawMode ? undefined : primarySkillId,
            raw_turn_id: turnTelemetry.turn_id,
            turn_index: turnTelemetry.turn_index,
            metrics: turnTelemetry.metrics,
          };
          useCopilotStore.getState().addMessage(assistantMessage);
        } else {
          const errorMessage: ChatMessage = {
            id: generateUniqueMessageId('msg-err'),
            sender: 'system',
            content: 'Desculpe, ocorreu um erro ao se comunicar com o modelo de IA. Verifique as configurações de provedor.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          useCopilotStore.getState().addMessage(errorMessage);
        }
      }
    } catch (err) {
      console.error('[AIContext] Erro no envio de mensagem para IA:', err);
      const errorMessage: ChatMessage = {
        id: generateUniqueMessageId('msg-err'),
        sender: 'system',
        content: 'Falha na conexão com o servidor de IA.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      useCopilotStore.getState().addMessage(errorMessage);
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);
      clearTimeout(stepTimer4);
      setIsThinking(false);

      // Atualiza automaticamente o documento, árvore e histórico de sessões
      try {
        useCopilotStore.getState().incrementHistoryVersion();
        await reloadActiveFile?.(true);
        await loadTree?.();
        await refreshPendingChanges?.();
        await refreshGitStatus?.();
      } catch (refreshErr) {
        console.warn('[AIContext] Erro ao sincronizar workspace após resposta do agente:', refreshErr);
      }
    }
  };

  const clearMessages = () => {
    useCopilotStore.getState().clearMessages();
  };

  const resetMemory = async (scope: string) => {
    if (!activeRepo) return;
    try {
      await API.resetMemoryScope({ repo: activeRepo.name, scope });
      clearMessages();
    } catch (err) {
      console.error('[AIContext] Erro ao resetar memória:', err);
    }
  };

  const activeProviderId = useCopilotStore((s) => s.activeProviderId);
  const setActiveProviderId = useCopilotStore((s) => s.setActiveProviderId);
  const pendingApproval = useCopilotStore((s) => s.pendingApproval);
  const setPendingApproval = useCopilotStore((s) => s.setPendingApproval);

  const approveAction = async (sessionId: string, customInput?: string) => {
    try {
      await API.sendSessionApproval({
        session_id: sessionId,
        approved: true,
        custom_input: customInput,
        provider_id: activeProviderId,
      });
      setPendingApproval(null);
    } catch (err) {
      console.error('[AIContext] Erro ao aprovar ação:', err);
    }
  };

  const rejectAction = async (sessionId: string) => {
    try {
      await API.sendSessionApproval({
        session_id: sessionId,
        approved: false,
        provider_id: activeProviderId,
      });
      setPendingApproval(null);
    } catch (err) {
      console.error('[AIContext] Erro ao rejeitar ação:', err);
    }
  };

  const stopGeneration = async () => {
    try {
      setIsThinking(false);
      await API.stopSession({ session_id: currentSessionId, provider_id: activeProviderId });
      const cancelMessage: ChatMessage = {
        id: generateUniqueMessageId('msg-cancel'),
        sender: 'system',
        content: '⏹️ Execução interrompida pelo usuário.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      useCopilotStore.getState().addMessage(cancelMessage);
    } catch (err) {
      console.error('[AIContext] Erro ao parar geração:', err);
    }
  };

  const saveSettings = async (payload: { active_provider: string; active_model: string; api_keys?: Record<string, string>; custom_endpoint?: string }) => {
    const key = payload.api_keys ? payload.api_keys[payload.active_provider] : undefined;
    return saveAISettings(payload.active_provider, payload.active_model, key, payload.custom_endpoint);
  };

  return (
    <AIContext.Provider
      value={{
        aiSettings,
        isSettingsModalOpen,
        messages,
        isThinking,
        dynamicContext,
        setDynamicContext,
        openSettingsModal,
        closeSettingsModal,
        loadAISettings,
        saveAISettings,
        saveSettings,
        quickSetModel,
        sendMessage,
        stopGeneration,
        clearMessages,
        newChatSession,
        restoreSession,
        resetMemory,

        activeProviderId,
        setActiveProviderId,
        pendingApproval,
        setPendingApproval,
        approveAction,
        rejectAction,

        currentSessionId,
        referencedDocs,
        isGlobalScope,
        setReferencedDocs,
        addReferencedDoc,
        removeReferencedDoc,
        setIsGlobalScope,

        activeSkillId,
        activeSkillIds,
        templateSkills: effectiveTemplateSkills,
        isRawMode,
        isSkillsModalOpen,
        setActiveSkillId,
        setActiveSkillIds,
        toggleSkill,
        addActiveSkill,
        removeActiveSkill,
        setIsRawMode,
        openSkillsModal,
        closeSkillsModal,

        templatePrompt,
        templateTitle,
        templateId,
        isTemplatePromptEnabled,
        toggleTemplatePrompt,

        docPrompt,
        isDocPromptEnabled,
        toggleDocPrompt,

        isTemplateEditorMode,
        setIsTemplateEditorMode,
        projectTemplatePrompt,
      }}
    >
      {children}
    </AIContext.Provider>
  );
};

export const useAI = () => {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
};

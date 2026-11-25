import { create } from 'zustand';
import type { AISettingsState, ChatMessage, RawTurnTelemetry } from '../types';

export interface DynamicContext {
  filePath: string;
  content: string;
  badge?: string;
}

export interface CopilotTabSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  isThinking: boolean;
  thinkingStep: string;
  thinkingLogs: string[];
  pendingApproval: { prompt: string; sessionId: string; providerId?: string } | null;
  referencedDocs: string[];
  isGlobalScope: boolean;
  updatedAt: number;
}

const COPILOT_TABS_STORAGE_KEY = 'contexos_copilot_tabs_v1';
const DEFAULT_TAB_TITLE = 'Nova conversa';

function createEmptyTabSession(
  id: string,
  overrides: Partial<CopilotTabSession> = {},
): CopilotTabSession {
  return {
    id,
    title: DEFAULT_TAB_TITLE,
    messages: [],
    isThinking: false,
    thinkingStep: 'Iniciando raciocínio...',
    thinkingLogs: [],
    pendingApproval: null,
    referencedDocs: [],
    isGlobalScope: false,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function loadPersistedTabsState(): {
  currentSessionId: string;
  openTabIds: string[];
  sessions: Record<string, CopilotTabSession>;
} {
  const fallbackId = `sess-${Date.now()}`;
  const fallback = {
    currentSessionId: fallbackId,
    openTabIds: [fallbackId],
    sessions: { [fallbackId]: createEmptyTabSession(fallbackId) },
  };
  try {
    const raw = localStorage.getItem(COPILOT_TABS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as {
      currentSessionId?: string;
      openTabIds?: string[];
      sessions?: Record<string, Partial<CopilotTabSession>>;
    };
    if (!parsed || !Array.isArray(parsed.openTabIds) || parsed.openTabIds.length === 0) {
      return fallback;
    }
    const sessions: Record<string, CopilotTabSession> = {};
    const validTabIds: string[] = [];
    for (const tabId of parsed.openTabIds) {
      if (typeof tabId !== 'string' || !tabId) continue;
      const saved = parsed.sessions?.[tabId];
      sessions[tabId] = createEmptyTabSession(tabId, {
        title: typeof saved?.title === 'string' && saved.title.trim() ? saved.title : DEFAULT_TAB_TITLE,
        messages: Array.isArray(saved?.messages) ? saved.messages : [],
        referencedDocs: Array.isArray(saved?.referencedDocs) ? saved.referencedDocs : [],
        isGlobalScope: Boolean(saved?.isGlobalScope),
        updatedAt: typeof saved?.updatedAt === 'number' ? saved.updatedAt : Date.now(),
        isThinking: false,
        pendingApproval: null,
      });
      validTabIds.push(tabId);
    }
    if (validTabIds.length === 0) return fallback;
    const currentSessionId =
      parsed.currentSessionId && validTabIds.includes(parsed.currentSessionId)
        ? parsed.currentSessionId
        : validTabIds[0];
    return {
      currentSessionId,
      openTabIds: validTabIds,
      sessions,
    };
  } catch {
    return fallback;
  }
}

function persistTabsState(state: {
  currentSessionId: string;
  openTabIds: string[];
  sessions: Record<string, CopilotTabSession>;
}) {
  try {
    const compactSessions: Record<string, Partial<CopilotTabSession>> = {};
    for (const id of state.openTabIds) {
      const s = state.sessions[id];
      if (!s) continue;
      compactSessions[id] = {
        id: s.id,
        title: s.title,
        messages: s.messages.slice(-100),
        referencedDocs: s.referencedDocs,
        isGlobalScope: s.isGlobalScope,
        updatedAt: s.updatedAt,
      };
    }
    localStorage.setItem(
      COPILOT_TABS_STORAGE_KEY,
      JSON.stringify({
        currentSessionId: state.currentSessionId,
        openTabIds: state.openTabIds,
        sessions: compactSessions,
      }),
    );
  } catch {
    // ignore storage quota errors
  }
}

export interface CopilotStoreState {
  messages: ChatMessage[];
  isThinking: boolean;
  aiSettings: AISettingsState | null;
  isSettingsModalOpen: boolean;
  dynamicContext: DynamicContext | null;

  // Multi-Tab Session Management
  sessions: Record<string, CopilotTabSession>;
  openTabIds: string[];
  currentSessionId: string;
  setCurrentSessionId: (id: string) => void;
  newChatSession: () => string;
  switchSessionTab: (sessionId: string) => void;
  openSessionTab: (session: {
    id: string;
    title?: string;
    messages?: ChatMessage[];
    referencedDocs?: string[];
    isGlobalScope?: boolean;
  }) => void;
  closeSessionTab: (sessionId: string) => void;

  // Session-scoped updaters (for parallel background execution)
  setSessionTitle: (sessionId: string, title: string) => void;
  addMessageToSession: (sessionId: string, msg: ChatMessage) => void;
  setSessionMessages: (sessionId: string, messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setSessionThinking: (sessionId: string, isThinking: boolean) => void;
  setSessionThinkingStep: (sessionId: string, step: string) => void;
  addSessionThinkingLog: (sessionId: string, log: string) => void;
  clearSessionThinkingLogs: (sessionId: string) => void;
  setSessionPendingApproval: (
    sessionId: string,
    approval: { prompt: string; sessionId: string; providerId?: string } | null,
  ) => void;

  // Multi-Document References & Global Scope
  referencedDocs: string[];
  isGlobalScope: boolean;
  setReferencedDocs: (docs: string[]) => void;
  addReferencedDoc: (path: string) => void;
  removeReferencedDoc: (path: string) => void;
  setIsGlobalScope: (isGlobal: boolean) => void;

  // Skills & RAW Mode
  activeSkillId: string | null;
  activeSkillIds: string[];
  templateSkills: string[];
  isRawMode: boolean;
  isSkillsModalOpen: boolean;

  // Local RAG References & Search
  ragReferences: Array<{ id: string; relativePath: string; sectionTitle: string; snippet: string; score?: number }>;
  isRagModalOpen: boolean;
  isAutoRagEnabled: boolean;

  // Session RAW Telemetry & X-Ray Turns (keyed by sessionId)
  sessionTelemetry: Record<string, RawTurnTelemetry[]>;
  activeRawTurnIndex: number;
  addSessionTelemetryTurn: (sessionId: string, turn: RawTurnTelemetry) => void;
  setSessionTelemetry: (sessionId: string, turns: RawTurnTelemetry[]) => void;
  setActiveRawTurnIndex: (idx: number) => void;

  // Connected Providers & Approvals
  activeProviderId: string;
  setActiveProviderId: (id: string) => void;
  pendingApproval: { prompt: string; sessionId: string; providerId?: string } | null;
  setPendingApproval: (approval: { prompt: string; sessionId: string; providerId?: string } | null) => void;

  // Live Progress & Stream Logs
  thinkingStep: string;
  setThinkingStep: (step: string) => void;
  thinkingLogs: string[];
  addThinkingLog: (log: string) => void;
  clearThinkingLogs: () => void;

  // Prompt toggles & states
  templatePrompt: string | null;
  templateTitle: string | null;
  templateId: string | null;
  isTemplatePromptEnabled: boolean;

  docPrompt: string | null;
  isDocPromptEnabled: boolean;

  // Actions
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
  setIsThinking: (isThinking: boolean) => void;
  setAiSettings: (settings: AISettingsState | null) => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  setDynamicContext: (ctx: DynamicContext | null) => void;

  setActiveSkillId: (skillId: string | null) => void;
  setActiveSkillIds: (ids: string[]) => void;
  setTemplateSkills: (skills: string[]) => void;
  toggleSkill: (skillId: string) => void;
  addActiveSkill: (skillId: string) => void;
  removeActiveSkill: (skillId: string) => void;
  setIsRawMode: (isRaw: boolean) => void;
  openSkillsModal: () => void;
  closeSkillsModal: () => void;

  // RAG Actions
  addRagReference: (ref: { id: string; relativePath: string; sectionTitle: string; snippet: string; score?: number }) => void;
  removeRagReference: (id: string) => void;
  clearRagReferences: () => void;
  openRagModal: () => void;
  closeRagModal: () => void;
  toggleAutoRag: () => void;

  setTemplateContext: (data: { id: string | null; title: string | null; prompt: string | null; skills?: string[] }) => void;
  toggleTemplatePrompt: () => void;
  setIsTemplatePromptEnabled: (val: boolean) => void;

  historyVersion: number;
  incrementHistoryVersion: () => void;

  setDocPrompt: (prompt: string | null) => void;
  toggleDocPrompt: () => void;
  setIsDocPromptEnabled: (val: boolean) => void;
}

const initialTabsState = loadPersistedTabsState();
const initialActiveSession = initialTabsState.sessions[initialTabsState.currentSessionId];

function buildActiveMirror(session: CopilotTabSession) {
  return {
    messages: session.messages,
    isThinking: session.isThinking,
    thinkingStep: session.thinkingStep,
    thinkingLogs: session.thinkingLogs,
    pendingApproval: session.pendingApproval,
    referencedDocs: session.referencedDocs,
    isGlobalScope: session.isGlobalScope,
  };
}

function updateSessionHelper(
  state: CopilotStoreState,
  sessionId: string,
  updater: (session: CopilotTabSession) => CopilotTabSession,
  shouldPersist = true,
): Partial<CopilotStoreState> {
  const existing = state.sessions[sessionId] || createEmptyTabSession(sessionId);
  const updated = updater(existing);
  const nextSessions = {
    ...state.sessions,
    [sessionId]: updated,
  };
  const nextOpenTabIds = state.openTabIds.includes(sessionId)
    ? state.openTabIds
    : [...state.openTabIds, sessionId];

  if (shouldPersist) {
    persistTabsState({
      currentSessionId: state.currentSessionId,
      openTabIds: nextOpenTabIds,
      sessions: nextSessions,
    });
  }

  return {
    sessions: nextSessions,
    openTabIds: nextOpenTabIds,
    ...(sessionId === state.currentSessionId ? buildActiveMirror(updated) : {}),
  };
}

export const useCopilotStore = create<CopilotStoreState>((set) => ({
  messages: initialActiveSession.messages,
  isThinking: initialActiveSession.isThinking,
  aiSettings: null,
  isSettingsModalOpen: false,
  dynamicContext: null,

  sessions: initialTabsState.sessions,
  openTabIds: initialTabsState.openTabIds,
  currentSessionId: initialTabsState.currentSessionId,
  referencedDocs: initialActiveSession.referencedDocs,
  isGlobalScope: initialActiveSession.isGlobalScope,

  activeSkillId: null, // No default skill - user chooses
  activeSkillIds: [],
  templateSkills: [],
  isRawMode: false,
  isSkillsModalOpen: false,

  ragReferences: [],
  isRagModalOpen: false,
  isAutoRagEnabled: false,

  sessionTelemetry: {},
  activeRawTurnIndex: -1,

  activeProviderId: 'antigravity',
  setActiveProviderId: (activeProviderId) => set({ activeProviderId }),
  pendingApproval: initialActiveSession.pendingApproval,
  setPendingApproval: (pendingApproval) =>
    set((state) =>
      updateSessionHelper(
        state,
        state.currentSessionId,
        (s) => ({ ...s, pendingApproval }),
        false,
      ),
    ),

  thinkingStep: initialActiveSession.thinkingStep,
  setThinkingStep: (thinkingStep) =>
    set((state) =>
      updateSessionHelper(
        state,
        state.currentSessionId,
        (s) => ({ ...s, thinkingStep }),
        false,
      ),
    ),
  thinkingLogs: initialActiveSession.thinkingLogs,
  addThinkingLog: (log) =>
    set((state) =>
      updateSessionHelper(
        state,
        state.currentSessionId,
        (s) => ({ ...s, thinkingLogs: [...s.thinkingLogs.slice(-20), log] }),
        false,
      ),
    ),
  clearThinkingLogs: () =>
    set((state) =>
      updateSessionHelper(
        state,
        state.currentSessionId,
        (s) => ({ ...s, thinkingLogs: [] }),
        false,
      ),
    ),

  templatePrompt: null,
  templateTitle: null,
  templateId: null,
  isTemplatePromptEnabled: true,

  docPrompt: null,
  isDocPromptEnabled: true,

  historyVersion: 0,
  incrementHistoryVersion: () => set((state) => ({ historyVersion: state.historyVersion + 1 })),

  setCurrentSessionId: (currentSessionId) => {
    set((state) => {
      const target = state.sessions[currentSessionId] || createEmptyTabSession(currentSessionId);
      const nextSessions = state.sessions[currentSessionId]
        ? state.sessions
        : { ...state.sessions, [currentSessionId]: target };
      const nextOpenTabIds = state.openTabIds.includes(currentSessionId)
        ? state.openTabIds
        : [...state.openTabIds, currentSessionId];
      persistTabsState({
        currentSessionId,
        openTabIds: nextOpenTabIds,
        sessions: nextSessions,
      });
      return {
        currentSessionId,
        sessions: nextSessions,
        openTabIds: nextOpenTabIds,
        ...buildActiveMirror(target),
      };
    });
  },

  switchSessionTab: (sessionId) => {
    set((state) => {
      const target = state.sessions[sessionId];
      if (!target) return state;
      persistTabsState({
        currentSessionId: sessionId,
        openTabIds: state.openTabIds,
        sessions: state.sessions,
      });
      const turns = state.sessionTelemetry[sessionId] || [];
      return {
        currentSessionId: sessionId,
        activeRawTurnIndex: turns.length > 0 ? turns.length - 1 : -1,
        ...buildActiveMirror(target),
      };
    });
  },

  openSessionTab: ({ id, title, messages, referencedDocs, isGlobalScope }) => {
    set((state) => {
      const existing = state.sessions[id];
      const nextSession = createEmptyTabSession(id, {
        ...(existing || {}),
        title: title && title.trim() ? title.trim() : existing?.title || DEFAULT_TAB_TITLE,
        messages: messages !== undefined ? messages : existing?.messages || [],
        referencedDocs:
          referencedDocs !== undefined ? referencedDocs : existing?.referencedDocs || [],
        isGlobalScope:
          isGlobalScope !== undefined ? isGlobalScope : existing?.isGlobalScope || false,
        updatedAt: Date.now(),
      });
      const nextSessions = {
        ...state.sessions,
        [id]: nextSession,
      };
      const nextOpenTabIds = state.openTabIds.includes(id)
        ? state.openTabIds
        : [...state.openTabIds, id];
      persistTabsState({
        currentSessionId: id,
        openTabIds: nextOpenTabIds,
        sessions: nextSessions,
      });
      const turns = state.sessionTelemetry[id] || [];
      return {
        currentSessionId: id,
        sessions: nextSessions,
        openTabIds: nextOpenTabIds,
        activeRawTurnIndex: turns.length > 0 ? turns.length - 1 : -1,
        ...buildActiveMirror(nextSession),
      };
    });
  },

  closeSessionTab: (sessionId) => {
    set((state) => {
      const remainingIds = state.openTabIds.filter((id) => id !== sessionId);
      const nextSessions = { ...state.sessions };
      delete nextSessions[sessionId];

      if (remainingIds.length === 0) {
        const freshId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        const freshSession = createEmptyTabSession(freshId);
        const resetSessions = { [freshId]: freshSession };
        const resetTabIds = [freshId];
        persistTabsState({
          currentSessionId: freshId,
          openTabIds: resetTabIds,
          sessions: resetSessions,
        });
        return {
          currentSessionId: freshId,
          openTabIds: resetTabIds,
          sessions: resetSessions,
          activeRawTurnIndex: -1,
          ...buildActiveMirror(freshSession),
        };
      }

      let nextCurrentId = state.currentSessionId;
      if (state.currentSessionId === sessionId) {
        const closedIdx = state.openTabIds.indexOf(sessionId);
        nextCurrentId = remainingIds[Math.min(closedIdx, remainingIds.length - 1)] || remainingIds[0];
      }

      persistTabsState({
        currentSessionId: nextCurrentId,
        openTabIds: remainingIds,
        sessions: nextSessions,
      });

      const activeTarget = nextSessions[nextCurrentId];
      const turns = state.sessionTelemetry[nextCurrentId] || [];
      return {
        currentSessionId: nextCurrentId,
        openTabIds: remainingIds,
        sessions: nextSessions,
        ...(activeTarget
          ? {
              activeRawTurnIndex: turns.length > 0 ? turns.length - 1 : -1,
              ...buildActiveMirror(activeTarget),
            }
          : {}),
      };
    });
  },

  newChatSession: () => {
    const newId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    set((state) => {
      const currentSession = state.sessions[state.currentSessionId];
      const freshSession = createEmptyTabSession(newId, {
        referencedDocs: currentSession?.referencedDocs || state.referencedDocs,
        isGlobalScope: currentSession?.isGlobalScope ?? state.isGlobalScope,
      });
      const nextSessions = {
        ...state.sessions,
        [newId]: freshSession,
      };
      const nextOpenTabIds = [...state.openTabIds, newId];
      persistTabsState({
        currentSessionId: newId,
        openTabIds: nextOpenTabIds,
        sessions: nextSessions,
      });
      return {
        currentSessionId: newId,
        openTabIds: nextOpenTabIds,
        sessions: nextSessions,
        activeRawTurnIndex: -1,
        historyVersion: state.historyVersion + 1,
        sessionTelemetry: {
          ...state.sessionTelemetry,
          [newId]: [],
        },
        ...buildActiveMirror(freshSession),
      };
    });
    return newId;
  },

  setSessionTitle: (sessionId, title) => {
    set((state) =>
      updateSessionHelper(state, sessionId, (s) => ({
        ...s,
        title: title.trim() || DEFAULT_TAB_TITLE,
        updatedAt: Date.now(),
      })),
    );
  },

  addMessageToSession: (sessionId, msg) => {
    set((state) =>
      updateSessionHelper(state, sessionId, (s) => ({
        ...s,
        messages: [...s.messages, msg],
        updatedAt: Date.now(),
      })),
    );
  },

  setSessionMessages: (sessionId, messages) => {
    set((state) =>
      updateSessionHelper(state, sessionId, (s) => ({
        ...s,
        messages: typeof messages === 'function' ? messages(s.messages) : messages,
        updatedAt: Date.now(),
      })),
    );
  },

  setSessionThinking: (sessionId, isThinking) => {
    set((state) =>
      updateSessionHelper(
        state,
        sessionId,
        (s) => ({ ...s, isThinking }),
        false,
      ),
    );
  },

  setSessionThinkingStep: (sessionId, thinkingStep) => {
    set((state) =>
      updateSessionHelper(
        state,
        sessionId,
        (s) => ({ ...s, thinkingStep }),
        false,
      ),
    );
  },

  addSessionThinkingLog: (sessionId, log) => {
    set((state) =>
      updateSessionHelper(
        state,
        sessionId,
        (s) => ({ ...s, thinkingLogs: [...s.thinkingLogs.slice(-20), log] }),
        false,
      ),
    );
  },

  clearSessionThinkingLogs: (sessionId) => {
    set((state) =>
      updateSessionHelper(
        state,
        sessionId,
        (s) => ({ ...s, thinkingLogs: [] }),
        false,
      ),
    );
  },

  setSessionPendingApproval: (sessionId, pendingApproval) => {
    set((state) =>
      updateSessionHelper(
        state,
        sessionId,
        (s) => ({ ...s, pendingApproval }),
        false,
      ),
    );
  },

  addSessionTelemetryTurn: (sessionId, turn) => {
    set((state) => {
      const existingTurns = state.sessionTelemetry[sessionId] || [];
      const turnIndex = existingTurns.findIndex((t) => t.turn_id === turn.turn_id);
      let nextTurns: RawTurnTelemetry[];
      if (turnIndex >= 0) {
        nextTurns = [...existingTurns];
        nextTurns[turnIndex] = turn;
      } else {
        nextTurns = [...existingTurns, turn];
      }
      return {
        sessionTelemetry: {
          ...state.sessionTelemetry,
          [sessionId]: nextTurns,
        },
        activeRawTurnIndex: nextTurns.length - 1,
      };
    });
  },

  setSessionTelemetry: (sessionId, turns) => {
    set((state) => ({
      sessionTelemetry: {
        ...state.sessionTelemetry,
        [sessionId]: turns,
      },
      activeRawTurnIndex: turns.length > 0 ? turns.length - 1 : -1,
    }));
  },

  setActiveRawTurnIndex: (activeRawTurnIndex) => {
    set({ activeRawTurnIndex });
  },

  setReferencedDocs: (referencedDocs) => {
    set((state) =>
      updateSessionHelper(state, state.currentSessionId, (s) => ({
        ...s,
        referencedDocs,
        isGlobalScope: referencedDocs.length === 0,
      })),
    );
  },

  addReferencedDoc: (path) => {
    set((state) => {
      const currentDocs = state.sessions[state.currentSessionId]?.referencedDocs ?? state.referencedDocs;
      if (currentDocs.includes(path)) return state;
      return updateSessionHelper(state, state.currentSessionId, (s) => ({
        ...s,
        referencedDocs: [...s.referencedDocs, path],
        isGlobalScope: false,
      }));
    });
  },

  removeReferencedDoc: (path) => {
    set((state) =>
      updateSessionHelper(state, state.currentSessionId, (s) => {
        const nextDocs = s.referencedDocs.filter((p) => p !== path);
        return {
          ...s,
          referencedDocs: nextDocs,
          isGlobalScope: nextDocs.length === 0,
        };
      }),
    );
  },

  setIsGlobalScope: (isGlobalScope) => {
    set((state) =>
      updateSessionHelper(state, state.currentSessionId, (s) => ({
        ...s,
        isGlobalScope,
        referencedDocs: isGlobalScope ? [] : s.referencedDocs,
      })),
    );
  },

  setMessages: (messages) => {
    set((state) =>
      updateSessionHelper(state, state.currentSessionId, (s) => ({
        ...s,
        messages: typeof messages === 'function' ? messages(s.messages) : messages,
        updatedAt: Date.now(),
      })),
    );
  },

  addMessage: (msg) => {
    set((state) =>
      updateSessionHelper(state, state.currentSessionId, (s) => ({
        ...s,
        messages: [...s.messages, msg],
        updatedAt: Date.now(),
      })),
    );
  },

  clearMessages: () => {
    set((state) =>
      updateSessionHelper(state, state.currentSessionId, (s) => ({
        ...s,
        messages: [],
        title: DEFAULT_TAB_TITLE,
        updatedAt: Date.now(),
      })),
    );
  },

  setIsThinking: (isThinking) => {
    set((state) =>
      updateSessionHelper(
        state,
        state.currentSessionId,
        (s) => ({ ...s, isThinking }),
        false,
      ),
    );
  },

  setAiSettings: (aiSettings) => {
    set({ aiSettings });
  },

  openSettingsModal: () => {
    set({ isSettingsModalOpen: true });
  },

  closeSettingsModal: () => {
    set({ isSettingsModalOpen: false });
  },

  setDynamicContext: (dynamicContext) => {
    set({ dynamicContext });
  },

  setActiveSkillId: (activeSkillId) => {
    set({
      activeSkillId,
      activeSkillIds: activeSkillId ? [activeSkillId] : [],
    });
  },

  setActiveSkillIds: (activeSkillIds) => {
    set({
      activeSkillIds,
      activeSkillId: activeSkillIds[0] || null,
    });
  },

  setTemplateSkills: (templateSkills) => {
    set({ templateSkills });
  },

  toggleSkill: (skillId) => {
    set((state) => {
      const exists = state.activeSkillIds.includes(skillId);
      const next = exists
        ? state.activeSkillIds.filter((id) => id !== skillId)
        : [...state.activeSkillIds, skillId];
      return {
        activeSkillIds: next,
        activeSkillId: next[0] || null,
      };
    });
  },

  addActiveSkill: (skillId) => {
    set((state) => {
      if (state.activeSkillIds.includes(skillId)) return state;
      const next = [...state.activeSkillIds, skillId];
      return {
        activeSkillIds: next,
        activeSkillId: next[0] || null,
      };
    });
  },

  removeActiveSkill: (skillId) => {
    set((state) => {
      const next = state.activeSkillIds.filter((id) => id !== skillId);
      return {
        activeSkillIds: next,
        activeSkillId: next[0] || null,
      };
    });
  },

  setIsRawMode: (isRawMode) => {
    set({ isRawMode });
  },

  openSkillsModal: () => {
    set({ isSkillsModalOpen: true });
  },

  closeSkillsModal: () => {
    set({ isSkillsModalOpen: false });
  },

  addRagReference: (ref) => {
    set((state) => {
      if (state.ragReferences.some((r) => r.id === ref.id)) return state;
      return { ragReferences: [...state.ragReferences, ref] };
    });
  },

  removeRagReference: (id) => {
    set((state) => ({
      ragReferences: state.ragReferences.filter((r) => r.id !== id),
    }));
  },

  clearRagReferences: () => {
    set({ ragReferences: [] });
  },

  openRagModal: () => {
    set({ isRagModalOpen: true });
  },

  closeRagModal: () => {
    set({ isRagModalOpen: false });
  },

  toggleAutoRag: () => {
    set((state) => ({ isAutoRagEnabled: !state.isAutoRagEnabled }));
  },

  setTemplateContext: ({ id, title, prompt, skills }) => {
    set({
      templateId: id,
      templateTitle: title,
      templatePrompt: prompt,
      ...(skills ? { templateSkills: skills } : {}),
      ...(prompt ? { isTemplatePromptEnabled: true } : {}),
    });
  },

  toggleTemplatePrompt: () => {
    set((state) => ({ isTemplatePromptEnabled: !state.isTemplatePromptEnabled }));
  },

  setIsTemplatePromptEnabled: (isTemplatePromptEnabled) => {
    set({ isTemplatePromptEnabled });
  },

  setDocPrompt: (docPrompt) => {
    set({ docPrompt });
  },

  toggleDocPrompt: () => {
    set((state) => ({ isDocPromptEnabled: !state.isDocPromptEnabled }));
  },

  setIsDocPromptEnabled: (isDocPromptEnabled) => {
    set({ isDocPromptEnabled });
  },
}));

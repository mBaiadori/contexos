// Persistent Draft Store (LocalStorage Auto-Save & Draft Recovery)

const DRAFT_PREFIX = 'ag_draft:';
const CHAT_DRAFT_PREFIX = 'ag_chat_draft:';

export interface DocDraft {
  repo: string;
  filePath: string;
  body: string;
  metadata?: Record<string, unknown>;
  rawContent: string;
  timestamp: number;
  updatedAt: string;
}

class DraftStoreService {
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  private _makeKey(prefix: string, repo: string, filePath: string, branch?: string): string {
    const cleanRepo = (repo || 'default').trim();
    const cleanPath = (filePath || 'index.md').trim();
    const cleanBranch = (branch || '').trim();
    return cleanBranch
      ? `${prefix}${cleanRepo}@${cleanBranch}:${cleanPath}`
      : `${prefix}${cleanRepo}:${cleanPath}`;
  }

  saveDocDraft(
    repo: string,
    filePath: string,
    draftData: { body: string; metadata?: Record<string, unknown>; rawContent?: string },
    debounceMs = 500,
    branch?: string,
  ) {
    const key = this._makeKey(DRAFT_PREFIX, repo, filePath, branch);

    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      try {
        const payload: DocDraft = {
          repo,
          filePath,
          body: draftData.body || '',
          metadata: draftData.metadata || undefined,
          rawContent: draftData.rawContent || '',
          timestamp: Date.now(),
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem(key, JSON.stringify(payload));
        this.debounceTimers.delete(key);
      } catch (err) {
        console.warn('[DraftStore] Falha ao salvar rascunho local:', err);
      }
    }, debounceMs);

    this.debounceTimers.set(key, timer);
  }

  getDocDraft(repo: string, filePath: string, branch?: string): DocDraft | null {
    try {
      const key = this._makeKey(DRAFT_PREFIX, repo, filePath, branch);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[DraftStore] Erro ao ler rascunho:', err);
      return null;
    }
  }

  hasDocDraft(repo: string, filePath: string, branch?: string): boolean {
    const key = this._makeKey(DRAFT_PREFIX, repo, filePath, branch);
    return localStorage.getItem(key) !== null;
  }

  clearDocDraft(repo: string, filePath: string, branch?: string) {
    const key = this._makeKey(DRAFT_PREFIX, repo, filePath, branch);
    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
      this.debounceTimers.delete(key);
    }
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn('[DraftStore] Erro ao limpar rascunho:', err);
    }
  }

  saveChatDraft(repo: string, filePath: string, text: string) {
    const key = this._makeKey(CHAT_DRAFT_PREFIX, repo, filePath);
    try {
      if (!text || !text.trim()) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, text);
      }
    } catch (e) {
      console.warn('[DraftStore] Erro ao salvar rascunho de chat:', e);
    }
  }

  getChatDraft(repo: string, filePath: string): string {
    const key = this._makeKey(CHAT_DRAFT_PREFIX, repo, filePath);
    try {
      return localStorage.getItem(key) || '';
    } catch (e) {
      return '';
    }
  }

  clearChatDraft(repo: string, filePath: string) {
    const key = this._makeKey(CHAT_DRAFT_PREFIX, repo, filePath);
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('[DraftStore] Erro ao limpar rascunho de chat:', e);
    }
  }
}

export const DraftStore = new DraftStoreService();

// Service: Chat Memory & Session Store (IndexedDB + Persistent Cache)

const DB_NAME = "ProjectBoilerplateMemoryDB";
const DB_VERSION = 1;
const STORE_NAME = "chat_sessions";

export interface ChatSessionRecord {
  key: string;
  repo: string;
  docPath: string;
  sessionId: string;
  history: Array<Record<string, unknown>>;
  updatedAt: string;
  author?: Record<string, unknown> | string | null;
  model?: string;
}

class ChatMemoryStore {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase | null>;

  constructor() {
    this.initPromise = this.initDB();
  }

  private async initDB(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === "undefined") {
      return null;
    }

    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "key" });
          }
        };
        req.onsuccess = (e: Event) => {
          this.db = (e.target as IDBOpenDBRequest).result;
          resolve(this.db);
        };
        req.onerror = () => {
          resolve(null);
        };
      } catch (err) {
        resolve(null);
      }
    });
  }

  getKey(repo: string, docPath: string): string {
    const r = (repo || "default").trim();
    const d = (docPath || "index.md").trim();
    return `${r}::${d}`;
  }

  generateSessionId(docPath: string): string {
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const slug = (docPath || "root").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 15);
    return `${dateStr}-${slug}`;
  }

  async loadSession(repo: string, docPath: string): Promise<ChatSessionRecord | null> {
    await this.initPromise;
    const key = this.getKey(repo, docPath);

    if (this.db) {
      try {
        return new Promise((resolve) => {
          const tx = this.db!.transaction(STORE_NAME, "readonly");
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        });
      } catch (e) {
        console.warn("IndexedDB load error:", e);
      }
    }

    try {
      const raw = localStorage.getItem(`chat_mem_${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  async saveSession(
    repo: string,
    docPath: string,
    sessionData: {
      sessionId?: string;
      history: Array<Record<string, unknown>>;
      author?: Record<string, unknown> | string | null;
      model?: string;
    },
  ): Promise<ChatSessionRecord> {
    await this.initPromise;
    const key = this.getKey(repo, docPath);
    const record: ChatSessionRecord = {
      key,
      repo: repo || "default",
      docPath: docPath || "index.md",
      sessionId: sessionData.sessionId || this.generateSessionId(docPath),
      history: sessionData.history || [],
      updatedAt: new Date().toISOString(),
      author: sessionData.author || null,
      model: sessionData.model || undefined,
    };

    if (this.db) {
      try {
        const tx = this.db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.put(record);
      } catch (e) {
        console.warn("IndexedDB save error:", e);
      }
    }

    try {
      localStorage.setItem(`chat_mem_${key}`, JSON.stringify(record));
    } catch (e) {}

    return record;
  }

  async clearSession(repo: string, docPath: string): Promise<void> {
    await this.initPromise;
    const key = this.getKey(repo, docPath);

    if (this.db) {
      try {
        const tx = this.db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.delete(key);
      } catch (e) {}
    }

    try {
      localStorage.removeItem(`chat_mem_${key}`);
    } catch (e) {}
  }
}

export const ChatMemoryStoreService = new ChatMemoryStore();

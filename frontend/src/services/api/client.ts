export interface UpdaterStatusEvent {
  status: 'checking' | 'available' | 'available-manual' | 'up-to-date' | 'downloaded' | 'updating' | 'error';
  version?: string;
  releaseDate?: string;
  downloadUrl?: string;
  error?: string;
}

export interface UpdaterProgressEvent {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

interface DesktopBridge {
  isDesktop?: boolean;
  platform?: string;
  getVersion?: () => Promise<string>;
  getSessionToken?: () => Promise<string | null>;
  encrypt?: (plainText: string) => Promise<string>;
  decrypt?: (encryptedBase64: string) => Promise<string>;
  checkForUpdates?: () => Promise<{ status: string; updateInfo?: unknown; error?: string }>;
  quitAndInstallUpdate?: () => Promise<void>;
  openExternal?: (url: string) => Promise<void>;
  onUpdaterStatus?: (callback: (data: UpdaterStatusEvent) => void) => () => void;
  onUpdaterProgress?: (callback: (progress: UpdaterProgressEvent) => void) => () => void;
}

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data: T;
}

let cachedSessionToken: string | null = null;
let bootstrapPromise: Promise<string | null> | null = null;

/**
 * Realiza o handshake inicial de segurança, obtendo o cookie HttpOnly e o token local de sessão.
 */
export async function bootstrapSession(): Promise<string | null> {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    // 1. Tentar obter via desktopBridge se estiver em ambiente Desktop
    if (typeof window !== 'undefined' && window.desktopBridge?.getSessionToken) {
      try {
        const desktopToken = await window.desktopBridge.getSessionToken();
        if (desktopToken) {
          cachedSessionToken = desktopToken;
          return desktopToken;
        }
      } catch (err) {
        console.warn('[SessionSecurity] Erro ao obter token via desktopBridge:', err);
      }
    }

    try {
      const res = await (window.fetch ? window.fetch.bind(window) : fetch)('/api/session/bootstrap', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.token) {
          cachedSessionToken = data.token;
          return data.token;
        }
      }
    } catch (e) {
      console.warn('[SessionSecurity] Aviso no handshake inicial de sessão:', e);
    }
    return null;
  })();

  return bootstrapPromise;
}

// Interceptor global e transparente para requisições de API no frontend
if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (urlStr.startsWith('/api/') || urlStr.includes('/api/')) {
      const headers = new Headers(init?.headers);
      if (cachedSessionToken && !headers.has('X-ContextOS-Token')) {
        headers.set('X-ContextOS-Token', cachedSessionToken);
      }

      const modifiedInit: RequestInit = {
        credentials: 'include',
        ...init,
        headers,
      };

      const res = await originalFetch(input, modifiedInit);

      // Tratamento automático de sessão expirada / não inicializada
      if (res.status === 401 && !urlStr.includes('/api/session/bootstrap')) {
        bootstrapPromise = null;
        const newToken = await bootstrapSession();
        if (newToken) {
          headers.set('X-ContextOS-Token', newToken);
          return originalFetch(input, {
            ...modifiedInit,
            headers,
          });
        }
      }

      return res;
    }

    return originalFetch(input, init);
  };

  // Dispara o bootstrap imediatamente no carregamento da aplicação
  bootstrapSession();
}

export async function safeParseJson<T = any>(res: Response, fallback: T = {} as T): Promise<T> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) {
      if (!res.ok) {
        return { error: `Servidor indisponível (${res.status} ${res.statusText || 'Sem resposta'})` } as any;
      }
      return fallback;
    }
    return JSON.parse(text);
  } catch {
    return { error: `Resposta inválida do servidor (${res.status})` } as any;
  }
}

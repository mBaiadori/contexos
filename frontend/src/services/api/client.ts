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
  checkForUpdates?: () => Promise<{ status: string; updateInfo?: UpdaterStatusEvent; error?: string }>;
  getUpdateStatus?: () => Promise<UpdaterStatusEvent | null>;
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
let refreshPromise: Promise<string | null> | null = null;

/**
 * Realiza o handshake inicial de segurança, obtendo o cookie HttpOnly e o token local de sessão.
 */
export async function bootstrapSession(force = false): Promise<string | null> {
  if (force) {
    bootstrapPromise = null;
  }
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
  })().finally(() => {
    if (!cachedSessionToken) {
      bootstrapPromise = null;
    }
  });

  return bootstrapPromise;
}

// Interceptor global e transparente para requisições de API no frontend
if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  const originalFetch = window.fetch;

  const refreshOrRebootstrapSession = async (failedToken: string | null): Promise<string | null> => {
    if (refreshPromise) return refreshPromise;

    // Se outra requisição concorrente já atualizou o token, reutiliza imediatamente
    if (cachedSessionToken && failedToken && cachedSessionToken !== failedToken) {
      return cachedSessionToken;
    }

    refreshPromise = (async () => {
      const tokenToRefresh = failedToken || cachedSessionToken;

      // 1. Tenta renovar o token expirado via /api/session/refresh (funciona em Web e Desktop)
      try {
        const headers = new Headers();
        if (tokenToRefresh) {
          headers.set('X-ContextOS-Token', tokenToRefresh);
        }
        const refreshRes = await originalFetch('/api/session/refresh', {
          method: 'POST',
          credentials: 'include',
          headers,
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          if (data?.token) {
            cachedSessionToken = data.token;
            return data.token as string;
          }
        }
      } catch (err) {
        console.warn('[SessionSecurity] Erro ao renovar sessão expirada:', err);
      }

      // 2. Fallback: se o servidor reiniciou e invalidou o token anterior, refaz o bootstrap
      return bootstrapSession(true);
    })().finally(() => {
      refreshPromise = null;
    });

    return refreshPromise;
  };

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const isSessionEndpoint = urlStr.includes('/api/session/bootstrap') || urlStr.includes('/api/session/refresh');

    if (urlStr.startsWith('/api/') || urlStr.includes('/api/')) {
      if (!cachedSessionToken && !isSessionEndpoint) {
        await bootstrapSession();
      }

      const headers = new Headers(init?.headers);
      const sentToken = headers.get('X-ContextOS-Token') || cachedSessionToken;
      if (cachedSessionToken && !headers.has('X-ContextOS-Token')) {
        headers.set('X-ContextOS-Token', cachedSessionToken);
      }

      const modifiedInit: RequestInit = {
        credentials: 'include',
        ...init,
        headers,
      };

      const res = await originalFetch(input, modifiedInit);

      // Tratamento automático de sessão expirada / não inicializada (single-flight)
      if (res.status === 401 && !isSessionEndpoint) {
        const newToken = await refreshOrRebootstrapSession(sentToken);
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

export async function safeParseJson<T = Record<string, unknown>>(res: Response, fallback: T = {} as T): Promise<T> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) {
      if (!res.ok) {
        return { error: `Servidor indisponível (${res.status} ${res.statusText || 'Sem resposta'})` } as unknown as T;
      }
      return fallback;
    }
    return JSON.parse(text);
  } catch {
    return { error: `Resposta inválida do servidor (${res.status})` } as unknown as T;
  }
}

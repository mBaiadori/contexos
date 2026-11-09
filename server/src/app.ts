import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import fastifyStatic from "@fastify/static";
import fastify, { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { resolveUiDistDir } from "./config/constants.js";
import { AppError, redactPaths } from "./utils/errors.js";
import { aiRoutes } from "./modules/ai/ai.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { dictionaryRoutes } from "./modules/dictionary/dictionary.routes.js";
import { eventsRoutes } from "./modules/events/events.routes.js";
import { eventsService } from "./modules/events/events.service.js";
import { gitRoutes } from "./modules/git/git.routes.js";
import { governanceRoutes } from "./modules/governance/governance.routes.js";
import { notificationRoutes } from "./modules/notifications/notification.routes.js";
import { prsRoutes } from "./modules/prs/prs.routes.js";
import { ragRoutes } from "./modules/rag/rag.routes.js";
import { reposRoutes } from "./modules/repos/repos.routes.js";
import { settingsRoutes } from "./modules/settings/settings.routes.js";
import { skillsRoutes } from "./modules/skills/skills.routes.js";
import { systemRoutes } from "./modules/system/system.routes.js";
import { templatesRoutes } from "./modules/templates/templates.routes.js";
import { translationsRoutes } from "./modules/translations/translations.routes.js";
import { tutorialsRoutes } from "./modules/tutorials/tutorials.routes.js";
import { wikiRoutes } from "./modules/wiki/wiki.routes.js";
import { workspaceRoutes } from "./modules/workspace/workspace.routes.js";
import {
  getSessionToken,
  isValidSessionToken,
  validateSessionToken,
  isValidHostHeader,
  parseCookies,
  SESSION_TTL_SEC,
} from "./security/session.js";
import {
  authRateLimiter,
  toolExecRateLimiter,
  aiRateLimiter,
  ragRateLimiter,
  gitHeavyOpsRateLimiter,
  aiStreamRateLimiter,
} from "./security/rate-limit.js";
import { validateRepoName } from "./utils/repo-ref.js";

export async function buildApp(): Promise<FastifyInstance> {
  // Inicializa a sessão atômica no boot para persistir o token imediatamente no disco (evita race condition no Desktop)
  getSessionToken();

  const isDev = process.env.NODE_ENV === "development";
  const trustProxy = process.env.BEHIND_PROXY === "true" || process.env.NODE_ENV === "production";
  const app = fastify({
    trustProxy,
    bodyLimit: 2 * 1024 * 1024, // 2MB safe global default for standard JSON requests (prevents memory DoS)
    logger: isDev
      ? {
          level: "info",
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss",
              ignore: "pid,hostname",
            },
          },
        }
      : true,
  });

  // 1. Helmet: Cabeçalhos estritos de segurança HTTP (CSP, nosniff, no-referrer, DENY)
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://avatars.githubusercontent.com", "https://*.githubusercontent.com"],
        connectSrc: isDev
          ? ["'self'", "ws:", "http://localhost:*", "http://127.0.0.1:*"]
          : ["'self'"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: "no-referrer" },
    frameguard: { action: "deny" },
    noSniff: true,
  });

  // 1. CORS: Permitir clientes locais e Electron/Webviews, bloqueando websites externos da internet
  await app.register(cors, {
    origin: (origin, cb) => {
      // Requisições diretas de apps locais sem header Origin (Electron main, cURL, desktop apps)
      if (!origin) {
        return cb(null, true);
      }
      try {
        const parsed = new URL(origin);
        const isLocalHost =
          parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname === "::1" ||
          parsed.protocol === "file:" ||
          parsed.protocol === "vscode-webview:" ||
          parsed.protocol === "app:";
        if (isLocalHost) {
          return cb(null, true);
        }
      } catch {
        // Falha no parsing de URL
      }
      return cb(null, false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-ContextOS-Token"],
  });

  // 2. Proteção Anti-DNS Rebinding e Autenticação de Sessão Local (N3)
  app.addHook("onRequest", async (request, reply) => {
    // 2.1 Validação de Host Header
    if (!isValidHostHeader(request.headers.host)) {
      return reply.status(403).send({
        error: "Host não autorizado (proteção anti-DNS-rebinding).",
      });
    }

    // 2.2 Validação de Origin (CORS 403 em vez de 500)
    const origin = request.headers.origin;
    if (origin) {
      let isOriginAllowed = false;
      try {
        const parsed = new URL(origin);
        isOriginAllowed =
          parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname === "::1" ||
          parsed.protocol === "file:" ||
          parsed.protocol === "vscode-webview:" ||
          parsed.protocol === "app:";
      } catch {}
      if (!isOriginAllowed) {
        return reply.status(403).send({
          error: "Acesso de origem não permitida (CORS).",
        });
      }
    }

    const url = request.raw.url || "";
    const pathname = url.split("?")[0];

    // Permite assets estáticos, páginas e requisições OPTIONS pré-voo
    if (request.method === "OPTIONS" || !pathname.startsWith("/api/")) {
      return;
    }

    // Rate Limiting para rotas sensíveis
    const clientIp = request.ip || '127.0.0.1';
    const sessionHeader = (request.headers['x-session-id'] as string) || (request.headers['x-contextos-session-id'] as string);
    const queryObj = request.query && typeof request.query === 'object' ? (request.query as Record<string, unknown>) : undefined;
    const sessionQuery = queryObj && typeof queryObj.session_id === 'string' ? queryObj.session_id : undefined;
    const sessionKey = sessionHeader || sessionQuery;
    const compositeAiKey = sessionKey ? `${clientIp}:${sessionKey}` : clientIp;

    if (pathname.startsWith('/api/auth/')) {
      const rateCheck = authRateLimiter.consume(clientIp);
      if (!rateCheck.allowed) {
        return reply.status(429).header('Retry-After', String(rateCheck.retryAfterSec || 1)).send({
          error: 'Muitas requisições para a rota de autenticação. Tente novamente em instantes.',
        });
      }
    } else if (pathname.startsWith('/api/skills/custom/execute')) {
      const rateCheck = toolExecRateLimiter.consume(clientIp);
      if (!rateCheck.allowed) {
        return reply.status(429).header('Retry-After', String(rateCheck.retryAfterSec || 1)).send({
          error: 'Muitas execuções de ferramentas customizadas solicitadas.',
        });
      }
    } else if (pathname.startsWith('/api/ai/')) {
      const rateCheck = aiRateLimiter.consume(compositeAiKey);
      if (!rateCheck.allowed) {
        return reply.status(429).header('Retry-After', String(rateCheck.retryAfterSec || 1)).send({
          error: 'Muitas requisições para os serviços de inteligência artificial. Aguarde instantes.',
        });
      }
    } else if (pathname.startsWith('/api/rag/')) {
      const rateCheck = ragRateLimiter.consume(clientIp);
      if (!rateCheck.allowed) {
        return reply.status(429).header('Retry-After', String(rateCheck.retryAfterSec || 1)).send({
          error: 'Muitas requisições para buscas semânticas (RAG). Aguarde instantes.',
        });
      }
    } else if (
      pathname.startsWith('/api/repos/clone') ||
      pathname.startsWith('/api/git/clone') ||
      pathname === '/api/git/push' ||
      pathname === '/api/git/pull' ||
      pathname === '/api/git/sync'
    ) {
      const rateCheck = gitHeavyOpsRateLimiter.consume(clientIp);
      if (!rateCheck.allowed) {
        return reply.status(429).header('Retry-After', String(rateCheck.retryAfterSec || 1)).send({
          error: 'Muitas operações pesadas de Git solicitadas. Aguarde instantes antes de tentar novamente.',
        });
      }
    } else if (pathname === '/api/chat/stream') {
      const rateCheck = aiStreamRateLimiter.consume(compositeAiKey);
      if (!rateCheck.allowed) {
        return reply.status(429).header('Retry-After', String(rateCheck.retryAfterSec || 1)).send({
          error: 'Muitas conexões de streaming de IA solicitadas. Aguarde instantes.',
        });
      }
    }

    // Allowlist explícita de endpoints públicos
    if (
      pathname === "/api/session/bootstrap" ||
      pathname === "/api/health"
    ) {
      return;
    }

    // Extração do token de sessão (Header X-ContextOS-Token, Cookie ctxos_session ou Authorization)
    const headerToken = request.headers["x-contextos-token"] as string | undefined;
    const cookies = parseCookies(request.headers.cookie);
    const cookieToken = cookies["ctxos_session"];
    let bearerToken: string | undefined;
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      bearerToken = authHeader.substring(7).trim();
    }

    const candidateToken = headerToken || cookieToken || bearerToken;
    const validation = validateSessionToken(candidateToken);

    if (!validation.valid) {
      const isExpired = validation.reason === 'expired';
      return reply.status(401).send({
        error: isExpired
          ? "Sessão expirada. Faça login novamente."
          : "Não autorizado: Sessão inválida ou não informada.",
        reason: validation.reason,
      });
    }
  });

  // 2.3 Hook Centralizado de Validação do Parâmetro repo (prevenção contra Path Traversal)
  app.addHook("preValidation", async (request, reply) => {
    const url = request.raw.url || "";
    if (!url.startsWith("/api/")) return;

    // 1. Extração do parâmetro repo de query string
    const query = request.query as Record<string, unknown> | undefined;
    if (query && typeof query.repo === 'string' && query.repo.trim()) {
      try {
        validateRepoName(query.repo.trim());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({
          error: `Parâmetro de repositório inválido: ${message}`,
          code: 'INVALID_REPO_NAME',
        });
      }
    }

    // 2. Extração do parâmetro repo do corpo JSON
    const body = request.body as Record<string, unknown> | undefined;
    if (body && typeof body.repo === 'string' && body.repo.trim()) {
      try {
        validateRepoName(body.repo.trim());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({
          error: `Parâmetro de repositório inválido no corpo da requisição: ${message}`,
          code: 'INVALID_REPO_NAME',
        });
      }
    }
  });

  // Global Error Handler defensivo: Sanitiza paths de sistema e inclui correlation ID
  app.setErrorHandler((error: Error & { statusCode?: number; code?: string; isOperational?: boolean }, request, reply) => {
    const requestId = (request.id as string) || `req-${Date.now()}`;
    if (request.log?.error) {
      request.log.error({ err: error, requestId }, 'Unhandled Server Error');
    }

    const statusCode =
      typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500;

    let safeMessage: string;
    if (error instanceof AppError || error.isOperational) {
      safeMessage = redactPaths(error.message);
    } else if (statusCode >= 400 && statusCode < 500) {
      safeMessage = redactPaths(error.message || 'Requisição inválida');
    } else {
      safeMessage = 'Ocorreu um erro interno inesperado no servidor.';
    }

    return reply.status(statusCode).send({
      error: safeMessage,
      code: error.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST'),
      requestId,
    });
  });

  // 3. Rota de Bootstrap de Sessão Local (emite cookie HttpOnly e retorna token para SPA/Electron)
  app.get("/api/session/bootstrap", async (request, reply) => {
    if (process.env.CONTEXT_OS_DESKTOP === "1") {
      return reply.status(403).send({
        error: "Bootstrap de sessão desativado em modo desktop.",
      });
    }

    const origin = request.headers.origin;
    if (origin) {
      try {
        const parsed = new URL(origin);
        const hostHeader = (request.headers.host || '').toLowerCase();
        const hostWithoutPort = hostHeader.split(':')[0];
        const reqPort = hostHeader.includes(':') ? hostHeader.split(':')[1] : (parsed.protocol === 'https:' ? '443' : '80');

        const isSameHost = (parsed.hostname === hostWithoutPort || (parsed.hostname === 'localhost' && hostWithoutPort === '127.0.0.1') || (parsed.hostname === '127.0.0.1' && hostWithoutPort === 'localhost'));
        const isSameOrigin = isSameHost && (parsed.port === reqPort || (!parsed.port && reqPort === '80'));
        const portNum = parseInt(parsed.port || '80', 10);
        const isLocalhostHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
        const isViteDev = isLocalhostHost && ((portNum >= 5173 && portNum <= 5185) || (portNum >= 4100 && portNum <= 4110));
        const isDesktopApp = parsed.protocol === 'app:' || parsed.protocol === 'vscode-webview:' || parsed.protocol === 'file:';

        if (!isSameOrigin && !isViteDev && !isDesktopApp) {
          return reply.status(403).send({
            error: "Acesso de origem cruzada ao bootstrap de sessão negado.",
          });
        }
      } catch {
        return reply.status(403).send({
          error: "Origin inválido para bootstrap de sessão.",
        });
      }
    }

    const token = getSessionToken();
    reply.header(
      "Set-Cookie",
      `ctxos_session=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SEC}`,
    );
    return reply.send({ token, authenticated: true });
  });

  // 4. Rota Canônica de Health Check (unifica /api/health e redireciona /health)
  app.get("/api/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  app.get("/health", async (_request, reply) => {
    return reply.redirect("/api/health", 301);
  });

  // 2. Register Modular API Routes
  await app.register(eventsRoutes);
  await app.register(authRoutes);
  await app.register(reposRoutes);
  await app.register(workspaceRoutes);
  await app.register(dictionaryRoutes);
  await app.register(wikiRoutes);
  await app.register(templatesRoutes);
  await app.register(prsRoutes);
  await app.register(settingsRoutes);
  await app.register(tutorialsRoutes);
  await app.register(aiRoutes);
  await app.register(gitRoutes);
  await app.register(skillsRoutes);
  await app.register(ragRoutes);
  await app.register(systemRoutes);
  await app.register(translationsRoutes);
  await app.register(governanceRoutes);
  await app.register(notificationRoutes);

  // 3. Static Assets & SPA Fallback (Serving ui/dist or ui/)
  const staticRoot = resolveUiDistDir();
  console.log(
    `[Fastify Server] Servindo assets estáticos do frontend em: ${staticRoot}`,
  );
  if (fs.existsSync(staticRoot)) {
    await app.register(fastifyStatic, {
      root: staticRoot,
      prefix: "/",
    });

    app.setNotFoundHandler(async (request, reply) => {
      if (request.raw.url && request.raw.url.startsWith("/api")) {
        return reply
          .status(404)
          .send({ error: `Endpoint '${request.raw.url}' não encontrado.` });
      }
      const indexHtml = path.join(staticRoot, "index.html");
      if (fs.existsSync(indexHtml)) {
        return reply.sendFile("index.html");
      }
      return reply.status(404).send({ error: "Not Found" });
    });
  } else {
    console.warn(
      `[Fastify Server] Aviso: Diretório estático ${staticRoot} não encontrado.`,
    );
  }

  app.addHook("onClose", async () => {
    eventsService.closeAll();
  });

  return app;
}

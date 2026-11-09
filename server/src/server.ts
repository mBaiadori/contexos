import { buildApp } from './app.js';
import { findAvailablePort } from './utils/port.js';
import { eventsService } from './modules/events/events.service.js';

const DESIRED_PORT = Number(process.env.PORT) || 4100;
const HOST = process.env.HOST || '127.0.0.1';

type FastifyApp = Awaited<ReturnType<typeof buildApp>>;

async function start() {
  let app: FastifyApp | null = null;
  let isShuttingDown = false;

  const shutdown = async (_signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    // Timeout de segurança para garantir saída imediata caso haja sockets ou promises pendentes
    const forceExitTimer = setTimeout(() => {
      process.exit(0);
    }, 1000);

    try {
      eventsService.closeAll();
      const nodeServer = app?.server as unknown as { closeAllConnections?: () => void } | undefined;
      if (nodeServer && typeof nodeServer.closeAllConnections === 'function') {
        nodeServer.closeAllConnections();
      }
      if (app) {
        await app.close();
      }
    } catch {
      // Ignora erros ao desligar
    } finally {
      clearTimeout(forceExitTimer);
      process.exit(0);
    }
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  try {
    const port = await findAvailablePort(DESIRED_PORT);
    app = await buildApp();
    await app.listen({ port, host: HOST });
    console.log(`🚀 Context OS Fastify Server rodando em http://localhost:${port}`);
  } catch (err) {
    console.error('Erro ao iniciar o servidor Fastify:', err);
    process.exit(1);
  }
}

start();

import { FastifyInstance } from 'fastify';
import { settingsService } from './settings.service.js';

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/settings', async (_request, reply) => {
    return reply.send(settingsService.getSettings());
  });

  fastify.post('/api/settings/save', async (request, reply) => {
    const body = request.body as Parameters<typeof settingsService.saveSettings>[0];
    return reply.send(settingsService.saveSettings(body));
  });

  fastify.get('/api/ai/settings', async (_request, reply) => {
    return reply.send(settingsService.getAISettings());
  });

  fastify.post('/api/ai/settings', async (request, reply) => {
    const body = request.body as Parameters<typeof settingsService.saveAISettings>[0];
    return reply.send(settingsService.saveAISettings(body));
  });

  fastify.get('/api/ai/models', async (request, reply) => {
    const query = (request.query || {}) as { provider?: string; api_key?: string; custom_endpoint?: string };
    if (query.api_key) {
      return reply.status(410).send({
        error: 'O envio de chaves de API (api_key) via query string foi descontinuado por motivos de segurança. Utilize POST /api/ai/models com corpo JSON.',
      });
    }

    try {
      const modelsResult = await settingsService.getAvailableModels(query);
      return reply.send(modelsResult);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: msg || 'Erro ao consultar modelos de IA' });
    }
  });

  fastify.post('/api/ai/models', async (request, reply) => {
    const body = (request.body || {}) as { provider?: string; api_key?: string; custom_endpoint?: string };
    try {
      const modelsResult = await settingsService.getAvailableModels(body);
      return reply.send(modelsResult);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: msg || 'Erro ao consultar modelos de IA' });
    }
  });
}

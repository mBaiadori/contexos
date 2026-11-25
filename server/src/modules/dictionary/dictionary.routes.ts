import { FastifyInstance } from 'fastify';
import { dictionaryService } from './dictionary.service.js';

export async function dictionaryRoutes(fastify: FastifyInstance) {
  fastify.get('/api/dictionary', async (_request, reply) => {
    return reply.send(dictionaryService.getDictionary());
  });

  fastify.post('/api/dictionary/save', async (request, reply) => {
    try {
      const result = dictionaryService.saveDictionary(request.body);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}

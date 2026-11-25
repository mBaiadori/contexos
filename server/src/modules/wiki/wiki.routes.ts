import { FastifyInstance } from 'fastify';
import { wikiService } from './wiki.service.js';

export async function wikiRoutes(fastify: FastifyInstance) {
  fastify.get('/api/chat/memory/wiki', async (request, reply) => {
    const query = (request.query || {}) as { repo?: string; category?: string; q?: string; query?: string };
    const repoName = query.repo;
    const category = query.category;
    const searchQuery = query.q || query.query;

    const pages = wikiService.getWikiPages(repoName, category, searchQuery);
    return reply.send({
      ok: true,
      entries: pages,
      wiki: pages,
    });
  });

  fastify.get('/api/chat/memory/wiki/:category/:slug', async (request, reply) => {
    const params = request.params as { category: string; slug: string };
    const query = (request.query || {}) as { repo?: string };
    const page = wikiService.getWikiPage(params.category, params.slug, query.repo);
    if (!page) {
      return reply.status(404).send({ error: 'Nota do Wiki não encontrada.' });
    }
    return reply.send({ ok: true, page });
  });

  fastify.post('/api/chat/memory/wiki', async (request, reply) => {
    const body = request.body as {
      repo?: string;
      category?: string;
      slug?: string;
      title?: string;
      content?: string;
    };
    try {
      const result = wikiService.saveWikiPage(
        body.category || 'decisions',
        body.slug || '',
        body.title || '',
        body.content || '',
        body.repo
      );
      return reply.send({ ok: true, ...result });
    } catch (err: unknown) {
      return reply.status(400).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.post('/api/chat/memory/wiki/delete', async (request, reply) => {
    const body = request.body as { repo?: string; category?: string; slug?: string };
    try {
      const result = wikiService.deleteWikiPage(
        body.category || 'decisions',
        body.slug || '',
        body.repo
      );
      return reply.send({ ok: true, ...result });
    } catch (err: unknown) {
      return reply.status(400).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

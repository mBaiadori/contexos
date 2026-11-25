import { FastifyInstance } from 'fastify';
import { reposService } from './repos.service.js';

export async function reposRoutes(fastify: FastifyInstance) {
  fastify.get('/api/repos', async (request, reply) => {
    try {
      const { org } = (request.query as { org?: string }) || {};
      const result = await reposService.listRepos(org);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.post('/api/repos/select', async (request, reply) => {
    try {
      const result = await reposService.selectRepo(
        request.body as Parameters<typeof reposService.selectRepo>[0],
      );
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.post('/api/repos/create', async (request, reply) => {
    try {
      const result = await reposService.createRepo(
        request.body as Parameters<typeof reposService.createRepo>[0],
      );
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.post('/api/repos/diagnose', async (request, reply) => {
    try {
      const { name } = (request.body as { name?: string }) || {};
      const result = await reposService.diagnoseRepo(name || '');
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.post('/api/repos/initialize', async (request, reply) => {
    try {
      const result = await reposService.initializeRepo(
        request.body as Parameters<typeof reposService.initializeRepo>[0],
      );
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.get('/api/repos/orgs', async (_request, reply) => {
    try {
      const result = await reposService.listOrgs();
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.post('/api/repos/orgs', async (request, reply) => {
    try {
      const result = await reposService.createOrg(
        request.body as Parameters<typeof reposService.createOrg>[0],
      );
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.patch('/api/repos', async (request, reply) => {
    try {
      const result = await reposService.updateRepo(
        request.body as Parameters<typeof reposService.updateRepo>[0],
      );
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.post('/api/repos/update', async (request, reply) => {
    try {
      const result = await reposService.updateRepo(
        request.body as Parameters<typeof reposService.updateRepo>[0],
      );
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.post('/api/repos/clone', async (request, reply) => {
    try {
      const result = await reposService.cloneRepo(
        request.body as Parameters<typeof reposService.cloneRepo>[0],
      );
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.post('/api/repos/clone-local', async (request, reply) => {
    try {
      const result = await reposService.cloneLocalRepo(
        request.body as Parameters<typeof reposService.cloneLocalRepo>[0],
      );
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.delete('/api/repos', async (request, reply) => {
    try {
      const result = await reposService.deleteRepo(
        request.body as Parameters<typeof reposService.deleteRepo>[0],
      );
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}


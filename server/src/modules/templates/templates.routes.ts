import { FastifyInstance } from 'fastify';
import { loadConfig } from '../../config/storage.js';
import { templatesService } from './templates.service.js';

export async function templatesRoutes(fastify: FastifyInstance) {
  // ─── Community templates ───────────────────────────────────────────────────

  fastify.get('/api/templates/community', async (_request, reply) => {
    return reply.send({
      templates: templatesService.getCommunityTemplates(),
    });
  });

  // ─── Project templates ─────────────────────────────────────────────────────

  /**
   * GET /api/project/templates
   * List all templates of the active (or specified) project.
   */
  fastify.get('/api/project/templates', async (request, reply) => {
    try {
      const query = request.query as { repo?: string };
      const cfg = loadConfig();
      const repoName = query.repo || cfg.active_repo?.name || 'local';
      return reply.send({
        templates: templatesService.getProjectTemplates(repoName),
      });
    } catch (err: unknown) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /**
   * GET /api/project/templates/all
   * List project templates + community templates merged.
   */
  fastify.get('/api/project/templates/all', async (request, reply) => {
    try {
      const query = request.query as { repo?: string };
      const cfg = loadConfig();
      const repoName = query.repo || cfg.active_repo?.name || 'local';
      return reply.send({
        templates: templatesService.getTemplates(repoName),
      });
    } catch (err: unknown) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /**
   * GET /api/project/templates/:id
   * Get a single template (project-first, falls back to community).
   * Returns content + prompt for use when creating a document.
   */
  fastify.get('/api/project/templates/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const query = request.query as { repo?: string };
      const cfg = loadConfig();
      const repoName = query.repo || cfg.active_repo?.name || 'local';
      const template = templatesService.resolveTemplate(id, repoName);
      if (!template) {
        return reply.status(404).send({ error: `Template '${id}' não encontrado.` });
      }
      return reply.send({ template });
    } catch (err: unknown) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /**
   * POST /api/project/templates
   * Create a new template in the active project.
   */
  fastify.post('/api/project/templates', async (request, reply) => {
    try {
      const body = request.body as {
        id?: string;
        templateName?: string;
        title: string;
        ext?: string;
        category?: string;
        description?: string;
        tags?: string[];
        badge?: string;
        content?: string;
        prompt?: string;
        systemPrompt?: string;
        source?: string;
        repo?: string;
      };
      const cfg = loadConfig();
      const repoName = body.repo || cfg.active_repo?.name || 'local';
      const result = templatesService.createProjectTemplate(repoName, body);
      return reply.status(201).send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /**
   * PUT /api/project/templates/:id
   * Update an existing template in the active project.
   */
  fastify.put('/api/project/templates/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = (request.body || {}) as Record<string, any>;
      const cfg = loadConfig();
      const repoName = body.repo || cfg.active_repo?.name || 'local';
      const result = templatesService.updateProjectTemplate(repoName, id, body);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /**
   * DELETE /api/project/templates/:id
   * Remove a template from the active project.
   */
  fastify.delete('/api/project/templates/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const query = request.query as { repo?: string };
      const cfg = loadConfig();
      const repoName = query.repo || cfg.active_repo?.name || 'local';
      const result = templatesService.deleteProjectTemplate(id, repoName);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /**
   * DELETE /api/templates/community/:id
   * Templates da comunidade são canônicos e protegidos contra deleção global.
   */
  fastify.delete('/api/templates/community/:id', async (_request, reply) => {
    return reply.status(403).send({
      error: 'Templates da comunidade são canônicos e protegidos contra exclusão global. Você pode importá-los ou removê-los do seu projeto local.',
    });
  });

  /**
   * POST /api/project/templates/:id/import
   * Import a community template into the active project.
   */
  fastify.post('/api/project/templates/:id/import', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = (request.body || {}) as { repo?: string };
      const cfg = loadConfig();
      const repoName = body.repo || cfg.active_repo?.name || 'local';
      const result = templatesService.importFromCommunity(id, repoName);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /**
   * POST /api/project/templates/sync
   * Sync / normalize .templates.json.
   */
  fastify.post('/api/project/templates/sync', async (request, reply) => {
    try {
      const body = (request.body || {}) as { repo?: string };
      const cfg = loadConfig();
      const repoName = body.repo || cfg.active_repo?.name || 'local';
      const result = templatesService.syncProjectTemplatesMetadata(repoName);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ─── Legacy & Universal routes (kept for backward compatibility) ──────────

  fastify.delete('/api/templates/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const query = request.query as { repo?: string; is_community?: string };
      const cfg = loadConfig();
      const repoName = query.repo || cfg.active_repo?.name || 'local';
      if (query.is_community === 'true') {
        const resCommunity = templatesService.deleteCommunityTemplate(id);
        return reply.send(resCommunity);
      }
      const result = templatesService.deleteProjectTemplate(id, repoName);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.delete('/api/templates', async (request, reply) => {
    try {
      const query = request.query as { id?: string; repo?: string; is_community?: string };
      const body = (request.body || {}) as { id?: string; repo?: string; is_community?: boolean };
      const id = query.id || body.id;
      if (!id) return reply.status(400).send({ error: 'Template ID é obrigatório' });
      const cfg = loadConfig();
      const repoName = query.repo || body.repo || cfg.active_repo?.name || 'local';
      if (query.is_community === 'true' || body.is_community === true) {
        return reply.send(templatesService.deleteCommunityTemplate(id));
      }
      return reply.send(templatesService.deleteProjectTemplate(id, repoName));
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.get('/api/templates', async (request, reply) => {
    const query = request.query as { repo?: string };
    const cfg = loadConfig();
    const repoName = query.repo || cfg.active_repo?.name || 'local';
    return reply.send({ templates: templatesService.getTemplates(repoName) });
  });

  fastify.get('/api/templates/store', async (request, reply) => {
    const query = request.query as { repo?: string };
    const cfg = loadConfig();
    const repoName = query.repo || cfg.active_repo?.name || 'local';
    return reply.send({ templates: templatesService.getTemplates(repoName) });
  });
}

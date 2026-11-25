import { FastifyInstance } from 'fastify';
import { loadConfig } from '../../config/storage.js';
import { translationsService } from './translations.service.js';
import { translationProviderManager } from './providers/TranslationProviderManager.js';

export async function translationsRoutes(fastify: FastifyInstance) {
  /**
   * Lista os motores de tradução disponíveis no servidor
   */
  fastify.get('/api/translations/engines', async (_request, reply) => {
    const engines = translationProviderManager.listEngines();
    return reply.send({ engines });
  });

  /**
   * Lista as traduções existentes para um documento e os idiomas suportados
   */
  fastify.get('/api/translations/list', async (request, reply) => {
    const query = request.query as { path?: string; repo?: string };
    if (!query.path) {
      return reply.status(400).send({ error: 'Parâmetro "path" é obrigatório.' });
    }

    const cfg = loadConfig();
    const repoName = query.repo || cfg.active_repo?.name || 'local';

    try {
      const data = translationsService.listTranslations(repoName, query.path);
      return reply.send(data);
    } catch (err: unknown) {
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'Falha ao listar traduções.',
      });
    }
  });

  /**
   * Obtém o conteúdo de uma tradução específica
   */
  fastify.get('/api/translations/file', async (request, reply) => {
    const query = request.query as { path?: string; lang?: string; repo?: string };
    if (!query.path || !query.lang) {
      return reply.status(400).send({ error: 'Parâmetros "path" e "lang" são obrigatórios.' });
    }

    const cfg = loadConfig();
    const repoName = query.repo || cfg.active_repo?.name || 'local';

    try {
      const data = translationsService.getTranslation(repoName, query.lang, query.path);
      return reply.send(data);
    } catch (err: unknown) {
      return reply.status(404).send({
        error: err instanceof Error ? err.message : 'Arquivo de tradução não encontrado.',
      });
    }
  });

  /**
   * Gera a tradução de um documento sob demanda
   */
  fastify.post('/api/translations/translate', async (request, reply) => {
    const body = request.body as {
      path?: string;
      targetLang?: string;
      engineId?: string;
      repo?: string;
    };

    if (!body.path || !body.targetLang) {
      return reply.status(400).send({ error: 'Campos "path" e "targetLang" são obrigatórios.' });
    }

    const cfg = loadConfig();
    const repoName = body.repo || cfg.active_repo?.name || 'local';

    try {
      const result = await translationsService.translateDocument(
        repoName,
        body.path,
        body.targetLang,
        body.engineId
      );
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'Falha ao traduzir documento.',
      });
    }
  });

  /**
   * Salva alterações em uma tradução existente
   */
  fastify.post('/api/translations/save', async (request, reply) => {
    const body = request.body as {
      path?: string;
      lang?: string;
      content?: string;
      repo?: string;
    };

    if (!body.path || !body.lang || body.content === undefined) {
      return reply.status(400).send({ error: 'Campos "path", "lang" e "content" são obrigatórios.' });
    }

    const cfg = loadConfig();
    const repoName = body.repo || cfg.active_repo?.name || 'local';

    try {
      const result = translationsService.saveTranslation(repoName, body.lang, body.path, body.content);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'Falha ao salvar tradução.',
      });
    }
  });

  /**
   * Exclui uma versão traduzida
   */
  fastify.delete('/api/translations/file', async (request, reply) => {
    const body = (request.body || request.query) as {
      path?: string;
      lang?: string;
      repo?: string;
    };

    if (!body.path || !body.lang) {
      return reply.status(400).send({ error: 'Campos "path" e "lang" são obrigatórios.' });
    }

    const cfg = loadConfig();
    const repoName = body.repo || cfg.active_repo?.name || 'local';

    try {
      const result = translationsService.deleteTranslation(repoName, body.lang, body.path);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'Falha ao deletar tradução.',
      });
    }
  });

  /**
   * Gera a tradução reversa para o idioma principal (SSOT) para visualização de Diff
   */
  fastify.post('/api/translations/sync-to-main', async (request, reply) => {
    const body = request.body as {
      path?: string;
      translatedContent?: string;
      fromLang?: string;
      engineId?: string;
      repo?: string;
    };

    if (!body.path || !body.translatedContent || !body.fromLang) {
      return reply.status(400).send({
        error: 'Campos "path", "translatedContent" e "fromLang" são obrigatórios.',
      });
    }

    const cfg = loadConfig();
    const repoName = body.repo || cfg.active_repo?.name || 'local';

    try {
      const preview = await translationsService.translateBackToMain(
        repoName,
        body.path,
        body.translatedContent,
        body.fromLang,
        body.engineId
      );
      return reply.send(preview);
    } catch (err: unknown) {
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'Falha ao gerar sincronização para idioma principal.',
      });
    }
  });

  /**
   * Aplica o conteúdo aprovado diretamente no documento principal (SSOT)
   */
  fastify.post('/api/translations/apply-to-main', async (request, reply) => {
    const body = request.body as {
      path?: string;
      content?: string;
      repo?: string;
    };

    if (!body.path || body.content === undefined) {
      return reply.status(400).send({ error: 'Campos "path" e "content" são obrigatórios.' });
    }

    const cfg = loadConfig();
    const repoName = body.repo || cfg.active_repo?.name || 'local';

    try {
      const result = translationsService.applyToMain(repoName, body.path, body.content);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'Falha ao aplicar alterações no documento principal.',
      });
    }
  });
}

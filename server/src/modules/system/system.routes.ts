import { FastifyInstance } from 'fastify';
import { systemService } from './system.service.js';

export async function systemRoutes(fastify: FastifyInstance) {
  /**
   * Diagnóstico de sistema para suporte técnico 1-clique
   */
  fastify.get('/api/system/diagnostics', async (_request, reply) => {
    try {
      const diagnostics = await systemService.getDiagnostics();
      return reply.send(diagnostics);
    } catch (err: unknown) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : 'Falha ao coletar diagnósticos' });
    }
  });

  /**
   * Consulta status de licenciamento
   */
  fastify.get('/api/system/license', async (_request, reply) => {
    try {
      return reply.send(systemService.getLicenseStatus());
    } catch (err: unknown) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : 'Falha ao obter status de licença' });
    }
  });

  /**
   * Ativa chave de licença
   */
  fastify.post('/api/system/license/activate', async (request, reply) => {
    const body = request.body as { key?: string };
    try {
      const result = await systemService.activateLicense(body.key || '');
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Falha na ativação da licença' });
    }
  });

  /**
   * Status do Onboarding Inicial
   */
  fastify.get('/api/system/onboarding/status', async (_request, reply) => {
    try {
      return reply.send(systemService.getOnboardingStatus());
    } catch (err: unknown) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : 'Falha ao checar status de onboarding' });
    }
  });

  /**
   * Conclui o fluxo de Onboarding Inicial
   */
  fastify.post('/api/system/onboarding/complete', async (request, reply) => {
    try {
      const body = request.body as Parameters<typeof systemService.completeOnboarding>[0];
      const result = await systemService.completeOnboarding(body || {});
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Falha ao concluir onboarding' });
    }
  });

  /**
   * Criação rápida de workspace de demonstração
   */
  fastify.post('/api/workspace/demo/create', async (request, reply) => {
    try {
      const body = request.body as { name?: string };
      const result = await systemService.createDemoWorkspace(body.name || 'context-os-demo');
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Falha ao criar workspace demo' });
    }
  });
}

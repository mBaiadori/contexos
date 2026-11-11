import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AjvPackage from 'ajv';
import { vaultService, VAULT_KEYS } from '../vault/vault.service.js';
import { antiFatigueService } from './anti-fatigue.service.js';
import { renderEmailHtml, renderEmailText } from './templates/email-templates.js';
import { emailProvider } from './providers/email.provider.js';
import { webhookProvider } from './providers/webhook.provider.js';
import { notificationService } from './notification.service.js';
import type { NotificationPayload } from './notification.types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '../../schemas/project.config.schema.json');

describe('Notificações - Fase 1: Schemas, Vault & Contratos', () => {
  test('1.1: VAULT_KEYS deve conter as chaves de notificação', () => {
    assert.equal(VAULT_KEYS.NOTIFICATION_EMAIL_KEY, 'notification_email_key');
    assert.equal(VAULT_KEYS.NOTIFICATION_SMTP_CONFIG, 'notification_smtp_config');
    assert.equal(VAULT_KEYS.NOTIFICATION_WEBHOOK_SECRET, 'notification_webhook_secret');
  });

  test('1.2: VaultService deve salvar e recuperar segredos de notificação com segurança', () => {
    const testApiKey = 're_test_123456789_sec';
    vaultService.saveSecret(VAULT_KEYS.NOTIFICATION_EMAIL_KEY, testApiKey);
    assert.equal(vaultService.hasSecret(VAULT_KEYS.NOTIFICATION_EMAIL_KEY), true);
    assert.equal(vaultService.getSecret(VAULT_KEYS.NOTIFICATION_EMAIL_KEY), testApiKey);

    vaultService.deleteSecret(VAULT_KEYS.NOTIFICATION_EMAIL_KEY);
    assert.equal(vaultService.hasSecret(VAULT_KEYS.NOTIFICATION_EMAIL_KEY), false);
  });

  test('1.3: Schema JSON deve validar configuração de projeto com bloco de notificações', () => {
    const rawSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    const AjvConstructor = ((AjvPackage as any).default || AjvPackage) as any;
    const ajv = new AjvConstructor({ allErrors: true, strict: false });
    const validate = ajv.compile(rawSchema);

    const validProjectConfig = {
      project_name: 'Teste Governança',
      governance_rules: {
        min_approvals_default: 2,
        notifications: {
          enabled: true,
          cooldown_minutes: 10,
          channels: {
            email: {
              enabled: true,
              provider: 'resend',
              sender_address: 'notifications@contextos.dev',
              sender_name: 'Contexos Governança',
            },
            webhook: {
              enabled: true,
              url: 'https://discord.com/api/webhooks/123/xyz',
            },
          },
          events: {
            on_quorum_requested: true,
            on_quorum_approved: true,
            on_compliance_violation: true,
            on_clearance_changed: false,
          },
        },
      },
      reviewers: [
        {
          id: 'rev-1',
          name: 'Marcos Baiadori',
          handle: 'mBaiadori',
          email: 'marcos@empresa.com',
          role: 'Architect Lead',
          tier: 'admin',
          notify_channels: ['email'],
          notify_events: ['quorum_requested', 'compliance_violation'],
        },
      ],
    };

    const isValid = validate(validProjectConfig);
    assert.equal(isValid, true, JSON.stringify(validate.errors));
  });

  test('1.4: Schema JSON deve continuar aceitando configurações legadas sem notifications', () => {
    const rawSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    const AjvConstructor = ((AjvPackage as any).default || AjvPackage) as any;
    const ajv = new AjvConstructor({ allErrors: true, strict: false });
    const validate = ajv.compile(rawSchema);

    const legacyConfig = {
      project_name: 'Projeto Legado',
      governance_rules: {
        min_approvals_default: 1,
      },
      reviewers: [
        {
          id: 'rev-legacy',
          name: 'Dev User',
          tier: 'maintainer',
        },
      ],
    };

    const isValid = validate(legacyConfig);
    assert.equal(isValid, true, JSON.stringify(validate.errors));
  });
});

describe('Notificações - Fase 2: Engine, Provedores & Anti-Fadiga', () => {
  beforeEach(() => {
    antiFatigueService.reset();
  });

  test('2.1: AntiFatigueService deve bloquear disparos duplicados dentro do cooldown', () => {
    const repo = 'meu-projeto';
    const event = 'quorum_requested';
    const prNumber = 42;
    const email = 'revisor@empresa.com';

    // Primeiro envio: permitido
    assert.equal(antiFatigueService.isAllowed(repo, event, prNumber, email, 15), true);
    antiFatigueService.recordDispatch(repo, event, prNumber, email);

    // Segundo envio imediato: bloqueado por cooldown
    assert.equal(antiFatigueService.isAllowed(repo, event, prNumber, email, 15), false);

    // Destinatário diferente: permitido
    assert.equal(antiFatigueService.isAllowed(repo, event, prNumber, 'outro@empresa.com', 15), true);

    // PR diferente: permitido
    assert.equal(antiFatigueService.isAllowed(repo, event, 43, email, 15), true);
  });

  test('2.2: renderEmailHtml deve gerar HTML com badge de governança e estilos inline', () => {
    const payload: NotificationPayload = {
      event: 'quorum_requested',
      repo: 'projeto-teste',
      title: 'Aprovação de Governança Necessária',
      message: 'O PR #5 precisa do seu voto para atingir o quorum mínimo.',
      prNumber: 5,
      author: 'marcos',
      actionUrl: 'https://contextos.dev/prs/5',
      statusColor: '#10B981',
    };

    const html = renderEmailHtml(payload);
    assert.ok(html.includes('Contexos'), 'Deve conter título Contexos');
    assert.ok(html.includes('projeto-teste'), 'Deve conter nome do repositório');
    assert.ok(html.includes('#10B981'), 'Deve aplicar a cor dinâmica do status');
    assert.ok(html.includes('https://contextos.dev/prs/5'), 'Deve conter link de ação');
    assert.ok(html.includes('@marcos'), 'Deve conter menção ao autor');
  });

  test('2.3: renderEmailText deve gerar versão legível em texto puro', () => {
    const payload: NotificationPayload = {
      event: 'compliance_violation',
      repo: 'seguranca-core',
      title: 'Segredo Detectado em Commit',
      message: 'Um token de API foi interceptado pelo secret scanner.',
      author: 'dev1',
    };

    const text = renderEmailText(payload);
    assert.ok(text.includes('[Contexos • Governança - seguranca-core]'));
    assert.ok(text.includes('ALERTA DE COMPLIANCE'));
    assert.ok(text.includes('dev1'));
  });

  test('2.4: EmailProvider deve suportar envio simulado em ambiente de teste', async () => {
    const res = await emailProvider.send({
      to: 'dev@teste.com',
      subject: 'Teste de Notificação',
      html: '<p>Olá mundo</p>',
      provider: 'resend',
    });

    assert.equal(res.success, true);
    assert.equal(res.simulated, true);
    assert.ok(res.messageId?.startsWith('sim_'));
  });

  test('2.5: EmailProvider deve rejeitar endereços inválidos', async () => {
    const res = await emailProvider.send({
      to: 'email-invalido-sem-arroba',
      subject: 'Teste Inválido',
      html: '<p>Erro</p>',
    });

    assert.equal(res.success, false);
    assert.ok(res.error?.includes('inválido'));
  });

  test('2.6: WebhookProvider deve formatar e enviar payload para webhook simulado', async () => {
    const payload: NotificationPayload = {
      event: 'quorum_approved',
      repo: 'meu-repo',
      title: 'PR #10 Aprovado',
      message: 'Todas as aprovações foram coletadas.',
      prNumber: 10,
    };

    const res = await webhookProvider.send('https://example.com/webhook', payload);
    assert.equal(res.success, true);
    assert.equal(res.simulated, true);
  });

  test('2.7: NotificationService.sendTestNotification deve executar teste com sucesso', async () => {
    const res = await notificationService.sendTestNotification('projeto-teste', 'admin@teste.com');
    assert.equal(res.success, true);
    assert.ok(res.message.includes('sucesso'));
    assert.ok(res.details);
  });
});

import { getSessionToken } from '../../security/session.js';

describe('Notificações - Fase 3: Rotas da API e Integração de Governança', () => {
  test('3.1: Rotas Fastify devem responder em /api/notifications/config', async () => {
    const { buildApp } = await import('../../app.js');
    const app = await buildApp();
    const token = getSessionToken();

    const res = await app.inject({
      method: 'GET',
      url: '/api/notifications/config?repo=teste-routes',
      headers: { 'x-contextos-token': token },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.ok(body.vaultStatus);
    await app.close();
  });

  test('3.2: Rotas Fastify devem permitir teste e armazenamento seguro no Vault', async () => {
    const { buildApp } = await import('../../app.js');
    const app = await buildApp();
    const token = getSessionToken();

    // 1. Salvar chave no Vault
    const saveRes = await app.inject({
      method: 'POST',
      url: '/api/notifications/vault-key',
      headers: { 'x-contextos-token': token },
      payload: {
        keyType: 'email_key',
        value: 're_test_key_abc_123',
      },
    });
    assert.equal(saveRes.statusCode, 200);
    assert.equal(JSON.parse(saveRes.payload).success, true);

    // 2. Verificar se o Vault reporta a presença da chave
    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/notifications/config',
      headers: { 'x-contextos-token': token },
    });
    const statusBody = JSON.parse(statusRes.payload);
    assert.equal(statusBody.vaultStatus.hasEmailKey, true);

    // 3. Executar rota de teste de notificação
    const testRes = await app.inject({
      method: 'POST',
      url: '/api/notifications/test',
      headers: { 'x-contextos-token': token },
      payload: {
        email: 'testador@contextos.dev',
      },
    });
    assert.equal(testRes.statusCode, 200);
    assert.equal(JSON.parse(testRes.payload).success, true);

    // 4. Remover chave do Vault
    const delRes = await app.inject({
      method: 'DELETE',
      url: '/api/notifications/vault-key?keyType=email_key',
      headers: { 'x-contextos-token': token },
    });
    assert.equal(delRes.statusCode, 200);
    assert.equal(JSON.parse(delRes.payload).success, true);

    await app.close();
  });
});

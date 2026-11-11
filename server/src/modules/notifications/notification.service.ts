import { governanceService } from '../governance/governance.service.js';
import { vaultService, VAULT_KEYS } from '../vault/vault.service.js';
import { antiFatigueService } from './anti-fatigue.service.js';
import { emailProvider } from './providers/email.provider.js';
import { webhookProvider } from './providers/webhook.provider.js';
import { renderEmailHtml, renderEmailText } from './templates/email-templates.js';
import type {
  NotificationPayload,
  NotificationDispatchResult,
  ChannelDispatchResult,
  NotificationProjectConfig,
  NotificationRecipient,
} from './notification.types.js';

export class NotificationService {
  /**
   * Obtém a configuração de notificações do projeto ativo ou informado
   */
  public getNotificationConfig(repoName?: string): {
    config: NotificationProjectConfig;
    reviewers: NotificationRecipient[];
  } {
    const projectConfig = governanceService.readProjectConfig(repoName);
    const notifications: NotificationProjectConfig =
      projectConfig?.governance_rules?.notifications || { enabled: false };
    const reviewers: NotificationRecipient[] = projectConfig?.reviewers || [];
    return { config: notifications, reviewers };
  }

  /**
   * Despacha uma notificação respeitando as preferências do projeto, regras de cooldown e canais ativos
   */
  public async dispatch(
    payload: NotificationPayload,
    repoName?: string
  ): Promise<NotificationDispatchResult> {
    const { config, reviewers } = this.getNotificationConfig(repoName || payload.repo);

    // Se notificações estiverem desativadas no projeto, encerra silenciosamente
    if (!config.enabled) {
      return {
        success: true,
        channelResults: [],
      };
    }

    // Verifica se o evento específico está habilitado
    const eventsConfig = config.events || {};
    const eventKey = `on_${payload.event}` as keyof typeof eventsConfig;
    if (eventsConfig[eventKey] === false) {
      return {
        success: true,
        channelResults: [],
      };
    }

    const cooldownMinutes = config.cooldown_minutes ?? 15;
    const channelResults: ChannelDispatchResult[] = [];

    // ==========================================
    // 1. Canal de E-mail
    // ==========================================
    const emailConfig = config.channels?.email;
    if (emailConfig?.enabled) {
      const targetRecipients = this.resolveRecipients(payload, reviewers, 'email');

      if (targetRecipients.length === 0) {
        channelResults.push({
          channel: 'email',
          success: true,
          recipientCount: 0,
        });
      } else {
        const emailApiKey = vaultService.getSecret(VAULT_KEYS.NOTIFICATION_EMAIL_KEY) || undefined;
        let sentCount = 0;
        let skippedCount = 0;
        const errors: string[] = [];

        const html = renderEmailHtml(payload);
        const text = renderEmailText(payload);

        for (const recipient of targetRecipients) {
          if (!recipient.email) continue;

          // Validação anti-fadiga por destinatário
          const allowed = antiFatigueService.isAllowed(
            payload.repo,
            payload.event,
            payload.prNumber,
            recipient.email,
            cooldownMinutes
          );

          if (!allowed) {
            skippedCount++;
            continue;
          }

          const res = await emailProvider.send({
            to: recipient.email,
            subject: `[Contexos • ${payload.repo}] ${payload.title}`,
            html,
            text,
            fromName: emailConfig.sender_name || 'Contexos Governança',
            fromAddress: emailConfig.sender_address || 'notifications@contextos.dev',
            provider: emailConfig.provider || 'resend',
            apiKey: emailApiKey,
          });

          if (res.success) {
            antiFatigueService.recordDispatch(
              payload.repo,
              payload.event,
              payload.prNumber,
              recipient.email
            );
            sentCount++;
          } else if (res.error) {
            errors.push(`${recipient.email}: ${res.error}`);
          }
        }

        channelResults.push({
          channel: 'email',
          success: errors.length === 0,
          recipientCount: sentCount,
          skippedCooldown: skippedCount > 0 && sentCount === 0,
          error: errors.length > 0 ? errors.join('; ') : undefined,
        });
      }
    }

    // ==========================================
    // 2. Canal de Webhook (Discord / Slack)
    // ==========================================
    const webhookConfig = config.channels?.webhook;
    if (webhookConfig?.enabled && webhookConfig.url) {
      const allowed = antiFatigueService.isAllowed(
        payload.repo,
        payload.event,
        payload.prNumber,
        'webhook',
        cooldownMinutes
      );

      if (!allowed) {
        channelResults.push({
          channel: 'webhook',
          success: true,
          skippedCooldown: true,
        });
      } else {
        const webhookSecret = vaultService.getSecret(VAULT_KEYS.NOTIFICATION_WEBHOOK_SECRET) || undefined;
        const res = await webhookProvider.send(webhookConfig.url, payload, webhookSecret);

        if (res.success) {
          antiFatigueService.recordDispatch(
            payload.repo,
            payload.event,
            payload.prNumber,
            'webhook'
          );
        }

        channelResults.push({
          channel: 'webhook',
          success: res.success,
          error: res.error,
        });
      }
    }

    const hasFailure = channelResults.some((c) => !c.success);
    return {
      success: !hasFailure,
      channelResults,
    };
  }

  /**
   * Filtra e resolve os destinatários elegíveis para receber a notificação
   */
  private resolveRecipients(
    payload: NotificationPayload,
    configuredReviewers: NotificationRecipient[],
    channel: 'email' | 'webhook'
  ): NotificationRecipient[] {
    if (payload.recipients && payload.recipients.length > 0) {
      return payload.recipients;
    }

    return configuredReviewers.filter((rev) => {
      // Se possui restrição de canais, verifica se 'email' está incluído
      if (rev.notify_channels && !rev.notify_channels.includes(channel)) {
        return false;
      }
      // Se possui restrição de eventos, verifica se o evento atual está incluído
      if (rev.notify_events && !rev.notify_events.includes(payload.event)) {
        return false;
      }
      return Boolean(rev.email && rev.email.includes('@'));
    });
  }

  /**
   * Envia uma notificação de teste para validar chaves do Vault e conectividade
   */
  public async sendTestNotification(
    repoName?: string,
    targetEmail?: string
  ): Promise<{ success: boolean; message: string; details: unknown }> {
    const { config } = this.getNotificationConfig(repoName);
    const effectiveRepo = repoName || 'projeto-atual';

    const testPayload: NotificationPayload = {
      event: 'quorum_requested',
      repo: effectiveRepo,
      title: '🧪 Notificação de Teste do Contexos',
      message: 'Esta é uma mensagem de verificação para validar a configuração de alertas de governança do seu projeto.',
      actionUrl: 'https://github.com',
      severity: 'info',
      statusColor: '#2563EB',
      recipients: targetEmail
        ? [{ id: 'test-user', name: 'Usuário Teste', email: targetEmail }]
        : undefined,
    };

    // Força bypass de cooldown para o teste manual
    antiFatigueService.reset();

    // Se o canal de e-mail estiver desabilitado na config do projeto, habilita temporariamente para o teste
    const effectiveConfig = { ...config };
    if (!effectiveConfig.enabled) {
      effectiveConfig.enabled = true;
    }
    if (!effectiveConfig.channels?.email?.enabled) {
      effectiveConfig.channels = {
        ...effectiveConfig.channels,
        email: {
          enabled: true,
          provider: 'resend',
          sender_name: 'Contexos Governança',
          sender_address: 'notifications@contextos.dev',
        },
      };
    }

    const emailApiKey = vaultService.getSecret(VAULT_KEYS.NOTIFICATION_EMAIL_KEY);
    const emailRes = await emailProvider.send({
      to: targetEmail || 'admin@exemplo.com',
      subject: `[Teste • ${effectiveRepo}] 🧪 Notificação de Teste do Contexos`,
      html: renderEmailHtml(testPayload),
      text: renderEmailText(testPayload),
      fromName: 'Contexos Governança',
      fromAddress: 'notifications@contextos.dev',
      apiKey: emailApiKey || undefined,
    });

    return {
      success: emailRes.success,
      message: emailRes.success
        ? emailRes.simulated
          ? 'Notificação de teste executada com sucesso em modo simulado (chave ausente no Vault ou ambiente de teste).'
          : 'Notificação de teste enviada com sucesso para o destinatário.'
        : `Erro ao enviar notificação de teste: ${emailRes.error}`,
      details: {
        emailResult: emailRes,
        vaultHasKey: Boolean(emailApiKey && emailApiKey.length > 0),
      },
    };
  }
}

export const notificationService = new NotificationService();

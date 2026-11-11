import crypto from 'node:crypto';
import type { NotificationPayload } from '../notification.types.js';

export interface WebhookSendResult {
  success: boolean;
  simulated?: boolean;
  statusCode?: number;
  error?: string;
}

export class WebhookProvider {
  /**
   * Envia uma notificação formatada para o webhook de saída (Discord, Slack ou Endpoint genérico)
   */
  async send(url: string, payload: NotificationPayload, signingSecret?: string): Promise<WebhookSendResult> {
    if (!url || !url.startsWith('http')) {
      return { success: false, error: 'URL de webhook inválida' };
    }

    // Modo Simulado: para testes ou URLs placeholder
    if (url.includes('example.com') || url.includes('placeholder') || process.env.NODE_ENV === 'test') {
      console.log(`[WebhookProvider:Simulated] POST para: ${url} | Evento: "${payload.event}"`);
      return { success: true, simulated: true, statusCode: 200 };
    }

    const isDiscord = url.includes('discord.com/api/webhooks');
    const isSlack = url.includes('slack.com') || url.includes('hooks.slack.com');

    let bodyData: Record<string, unknown>;

    if (isDiscord) {
      const colorDecimal = payload.statusColor
        ? parseInt(payload.statusColor.replace('#', ''), 16)
        : 0x2563eb;

      bodyData = {
        username: 'Contexos Governança',
        avatar_url: 'https://raw.githubusercontent.com/mBaiadori/project-boilerplate/main/desktop/resources/icon.png',
        embeds: [
          {
            title: `[${payload.repo}] ${payload.title}`,
            description: payload.message,
            color: isNaN(colorDecimal) ? 0x2563eb : colorDecimal,
            url: payload.actionUrl || undefined,
            fields: [
              ...(payload.prNumber ? [{ name: 'Pull Request', value: `#${payload.prNumber}`, inline: true }] : []),
              ...(payload.author ? [{ name: 'Autor', value: `@${payload.author}`, inline: true }] : []),
              { name: 'Evento', value: payload.event, inline: true },
            ],
            footer: {
              text: 'Contexos Governança',
            },
            timestamp: new Date().toISOString(),
          },
        ],
      };
    } else if (isSlack) {
      bodyData = {
        text: `*[Contexos Governança • ${payload.repo}]* ${payload.title}\n${payload.message}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${payload.title}*\n${payload.message}${payload.actionUrl ? `\n<${payload.actionUrl}|Abrir no Contexos>` : ''}`,
            },
          },
        ],
      };
    } else {
      // Endpoint JSON genérico
      bodyData = {
        app: 'Contexos',
        timestamp: new Date().toISOString(),
        payload,
      };
    }

    const bodyString = JSON.stringify(bodyData);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'ContextOS-Governance-Notification/1.0',
    };

    if (signingSecret && signingSecret.trim() !== '') {
      const signature = crypto.createHmac('sha256', signingSecret).update(bodyString).digest('hex');
      headers['X-ContextOS-Signature'] = signature;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: bodyString,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return { success: false, statusCode: res.status, error: `Webhook respondeu com HTTP ${res.status}: ${txt}` };
      }

      return { success: true, statusCode: res.status };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Falha ao conectar no Webhook: ${msg}` };
    }
  }
}

export const webhookProvider = new WebhookProvider();

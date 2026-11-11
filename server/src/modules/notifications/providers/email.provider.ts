import type { NotificationProvider } from '../notification.types.js';

export interface EmailSendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  fromAddress?: string;
  provider?: NotificationProvider;
  apiKey?: string;
}

export interface EmailSendResult {
  success: boolean;
  simulated?: boolean;
  messageId?: string;
  error?: string;
}

export class EmailProvider {
  /**
   * Envia e-mail através do provedor configurado (Resend/SendGrid) ou modo simulado
   */
  async send(options: EmailSendOptions): Promise<EmailSendResult> {
    const { to, subject, html, text, fromName, fromAddress, provider, apiKey } = options;

    if (!to || !to.includes('@')) {
      return { success: false, error: 'Endereço de e-mail de destinatário inválido' };
    }

    const effectiveSender = `${fromName || 'Contexos Governança'} <${fromAddress || 'notifications@contextos.dev'}>`;

    // Modo Simulado: quando não há chave de API cadastrada no Vault ou em testes
    if (!apiKey || apiKey.trim() === '' || apiKey.startsWith('simulated_') || apiKey.includes('test_') || process.env.NODE_ENV === 'test') {
      console.log(`[EmailProvider:Simulated] [${provider || 'resend'}] Para: ${to} | Assunto: "${subject}"`);
      return {
        success: true,
        simulated: true,
        messageId: `sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      };
    }

    try {
      if (provider === 'sendgrid') {
        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: fromAddress || 'notifications@contextos.dev', name: fromName || 'Contexos Governança' },
            subject,
            content: [
              ...(text ? [{ type: 'text/plain', value: text }] : []),
              { type: 'text/html', value: html },
            ],
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          return { success: false, error: `SendGrid API Error (${res.status}): ${errText}` };
        }

        return { success: true, messageId: res.headers.get('x-message-id') || `sg_${Date.now()}` };
      }

      // Default: Resend API (https://resend.com)
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: effectiveSender,
          to: [to],
          subject,
          html,
          text,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return { success: false, error: `Resend API Error (${res.status}): ${errText}` };
      }

      const data = (await res.json()) as { id?: string };
      return { success: true, messageId: data.id || `re_${Date.now()}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Falha na requisição de e-mail: ${msg}` };
    }
  }
}

export const emailProvider = new EmailProvider();

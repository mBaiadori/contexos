import type { NotificationPayload, NotificationEvent } from '../notification.types.js';

const EVENT_LABELS: Record<NotificationEvent, string> = {
  quorum_requested: 'Solicitação de Quorum',
  quorum_approved: 'Quorum Atingido',
  compliance_violation: 'Alerta de Compliance',
  clearance_changed: 'Permissão Atualizada',
};

const DEFAULT_EVENT_COLORS: Record<NotificationEvent, string> = {
  quorum_requested: '#F59E0B',   // Âmbar
  quorum_approved: '#10B981',    // Esmeralda
  compliance_violation: '#EF4444', // Vermelho
  clearance_changed: '#3B82F6',   // Azul
};

/**
 * Renderiza o template de e-mail em HTML responsivo com estilos inline
 */
export function renderEmailHtml(payload: NotificationPayload): string {
  const label = EVENT_LABELS[payload.event] || 'Governança';
  const badgeColor = payload.statusColor || DEFAULT_EVENT_COLORS[payload.event] || '#6366F1';
  const prSnippet = payload.prNumber ? ` • PR #${payload.prNumber}` : '';
  const actionButton = payload.actionUrl
    ? `
      <div style="margin: 28px 0; text-align: center;">
        <a href="${payload.actionUrl}" 
           style="background-color: #2563EB; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 2px 4px rgba(37,99,235,0.2);">
          Visualizar no Contexos &rarr;
        </a>
      </div>
    `
    : '';

  const detailsSnippet = payload.details && Object.keys(payload.details).length > 0
    ? `
      <div style="margin-top: 20px; padding: 14px; background-color: #F8FAFC; border-radius: 8px; border: 1px solid #E2E8F0; font-size: 13px; color: #475569;">
        <strong style="color: #1E293B;">Detalhes:</strong>
        <pre style="margin: 8px 0 0; font-family: ui-monospace, Menlo, Monaco, Consolas, monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all;">${JSON.stringify(payload.details, null, 2)}</pre>
      </div>
    `
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${payload.title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A; line-height: 1.5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F1F5F9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05); border: 1px solid #E2E8F0;">
          
          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px; border-bottom: 1px solid #F1F5F9; background-color: #0F172A; color: #FFFFFF;">
              <table role="presentation" width="100%">
                <tr>
                  <td>
                    <span style="font-weight: 700; font-size: 16px; letter-spacing: -0.02em; color: #FFFFFF;">Contexos</span>
                    <span style="color: #94A3B8; font-size: 14px; margin-left: 8px;">Governança</span>
                  </td>
                  <td align="right">
                    <span style="font-size: 12px; color: #94A3B8; font-family: monospace;">${payload.repo}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 32px;">
              <!-- Badge -->
              <div style="margin-bottom: 16px;">
                <span style="display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; background-color: ${badgeColor}1A; color: ${badgeColor}; border: 1px solid ${badgeColor}4D;">
                  ${label}${prSnippet}
                </span>
              </div>

              <h1 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #0F172A; line-height: 1.3;">
                ${payload.title}
              </h1>

              <p style="margin: 0 0 16px; font-size: 15px; color: #334155; line-height: 1.6;">
                ${payload.message}
              </p>

              ${payload.author ? `<p style="margin: 0 0 16px; font-size: 13px; color: #64748B;">Iniciado por: <strong>@${payload.author}</strong></p>` : ''}

              ${actionButton}

              ${detailsSnippet}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #F8FAFC; border-top: 1px solid #E2E8F0; font-size: 12px; color: #64748B; text-align: center;">
              Você recebeu esta notificação porque possui papel ativo de governança no projeto <strong>${payload.repo}</strong>.<br>
              Contexos • Sistema de Governança de Software & Living Docs
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Renderiza o corpo do e-mail em texto puro
 */
export function renderEmailText(payload: NotificationPayload): string {
  const label = EVENT_LABELS[payload.event] || 'Governança';
  const prInfo = payload.prNumber ? ` (PR #${payload.prNumber})` : '';
  const action = payload.actionUrl ? `\nAcessar: ${payload.actionUrl}\n` : '';
  const authorInfo = payload.author ? `Por: @${payload.author}\n` : '';

  return `[Contexos • Governança - ${payload.repo}]
${label.toUpperCase()}${prInfo}

${payload.title}
${payload.message}

${authorInfo}${action}
---
Você recebeu esta mensagem como revisor de governança no Contexos.`;
}

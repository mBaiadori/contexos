import React, { useState, useEffect, useCallback } from "react";
import {
  Bell,
  Mail,
  Webhook,
  ShieldCheck,
  Send,
  Key,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  UserCheck,
} from "lucide-react";
import { notificationsApi, type NotificationProjectConfigData, type NotificationReviewerInfo } from "../../../../services/api/notifications.api";
import { Button } from "../../../../components/ui/Button";

interface NotificationsTabProps {
  repoName?: string;
  isAdmin?: boolean;
}

export const NotificationsTab: React.FC<NotificationsTabProps> = ({ repoName, isAdmin }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Estados de Configuração
  const [config, setConfig] = useState<NotificationProjectConfigData>({
    enabled: true,
    cooldown_minutes: 15,
    channels: {
      email: {
        enabled: true,
        provider: 'resend',
        sender_address: 'notifications@contextos.dev',
        sender_name: 'Contexos',
      },
      webhook: {
        enabled: false,
        url: '',
      },
    },
    events: {
      on_quorum_requested: true,
      on_quorum_approved: true,
      on_compliance_violation: true,
      on_clearance_changed: false,
    },
  });

  const [reviewers, setReviewers] = useState<NotificationReviewerInfo[]>([]);
  const [vaultStatus, setVaultStatus] = useState({
    hasEmailKey: false,
    hasSmtpConfig: false,
    hasWebhookSecret: false,
  });

  // Estado para inserção de chave no Vault
  const [showVaultKeyInput, setShowVaultKeyInput] = useState(false);
  const [vaultKeyVal, setVaultKeyVal] = useState("");
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await notificationsApi.getConfig(repoName);
      if (res.ok && res.data?.success) {
        if (res.data.config) {
          setConfig((prev) => ({
            ...prev,
            ...res.data.config,
            channels: {
              email: { ...prev.channels?.email, ...res.data.config?.channels?.email },
              webhook: { ...prev.channels?.webhook, ...res.data.config?.channels?.webhook },
            },
            events: { ...prev.events, ...res.data.config?.events },
          }));
        }
        if (Array.isArray(res.data.reviewers)) {
          setReviewers(res.data.reviewers);
        }
        if (res.data.vaultStatus) {
          setVaultStatus(res.data.vaultStatus);
        }
      }
    } catch {
      setFeedback({ type: 'error', message: 'Falha ao carregar configurações de notificação.' });
    } finally {
      setIsLoading(false);
    }
  }, [repoName]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveConfig = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await notificationsApi.saveConfig(repoName, config);
      if (res.ok && res.data?.success) {
        setFeedback({ type: 'success', message: 'Configurações de notificação salvas com sucesso!' });
      } else {
        setFeedback({ type: 'error', message: res.data?.error || 'Erro ao salvar configurações.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Falha na comunicação com o servidor.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveVaultKey = async () => {
    if (!vaultKeyVal.trim()) return;
    setIsSavingKey(true);
    try {
      const res = await notificationsApi.saveVaultKey('email_key', vaultKeyVal.trim());
      if (res.ok && res.data?.success) {
        setVaultStatus((prev) => ({ ...prev, hasEmailKey: true }));
        setShowVaultKeyInput(false);
        setVaultKeyVal("");
        setFeedback({ type: 'success', message: 'Chave salva com sucesso no cofre do sistema operacional!' });
      } else {
        setFeedback({ type: 'error', message: res.data?.error || 'Erro ao salvar chave no Vault.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Falha ao salvar segredo no cofre.' });
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleSendTest = async () => {
    setIsTesting(true);
    setFeedback(null);
    try {
      const res = await notificationsApi.sendTestNotification(repoName, testEmail.trim() || undefined);
      if (res.ok && res.data?.success) {
        setFeedback({ type: 'success', message: res.data.message });
      } else {
        setFeedback({ type: 'error', message: res.data?.message || res.data?.error || 'Erro ao enviar teste.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erro inesperado ao solicitar teste de notificação.' });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center", color: "var(--color-outline, #a6adc8)" }}>
        <RefreshCw size={28} className="animate-spin" style={{ margin: "0 auto 12px" }} />
        <p>Carregando configurações de notificações do projeto...</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Feedback Banner */}
      {feedback && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            background:
              feedback.type === 'success'
                ? "rgba(16, 185, 129, 0.12)"
                : "rgba(239, 68, 68, 0.12)",
            border:
              feedback.type === 'success'
                ? "1px solid rgba(16, 185, 129, 0.3)"
                : "1px solid rgba(239, 68, 68, 0.3)",
            color:
              feedback.type === 'success'
                ? "var(--color-success, #10b981)"
                : "var(--color-error, #ef4444)",
            fontSize: "14px",
          }}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Header Principal com Master Toggle */}
      <div
        style={{
          background: "var(--color-surface-container, rgba(255, 255, 255, 0.03))",
          border: "1px solid var(--color-outline-variant, rgba(255, 255, 255, 0.08))",
          borderRadius: "12px",
          padding: "24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "rgba(99, 102, 241, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-primary, #6366f1)",
            }}
          >
            <Bell size={24} />
          </div>
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: 600 }}>
              Notificações de Governança
            </h2>
            <p style={{ margin: 0, fontSize: "14px", color: "var(--color-outline, #a6adc8)" }}>
              Alertas focados em assinaturas de quorum, aprovações e conformidade de segurança.
            </p>
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", userSelect: "none" }}>
          <span style={{ fontSize: "14px", fontWeight: 500 }}>
            {config.enabled ? "Notificações Ativas" : "Notificações Pausadas"}
          </span>
          <input
            type="checkbox"
            checked={Boolean(config.enabled)}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            style={{ width: "20px", height: "20px", cursor: "pointer" }}
          />
        </label>
      </div>

      {/* Cards de Canais (E-mail e Webhook) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
        {/* Canal 1: E-mail */}
        <div
          style={{
            background: "var(--color-surface-container, rgba(255, 255, 255, 0.03))",
            border: "1px solid var(--color-outline-variant, rgba(255, 255, 255, 0.08))",
            borderRadius: "12px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Mail size={20} color="var(--color-primary, #6366f1)" />
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Canal de E-mail</h3>
            </div>
            <input
              type="checkbox"
              checked={Boolean(config.channels?.email?.enabled)}
              onChange={(e) =>
                setConfig({
                  ...config,
                  channels: {
                    ...config.channels,
                    email: { ...config.channels?.email, enabled: e.target.checked },
                  },
                })
              }
              style={{ width: "18px", height: "18px", cursor: "pointer" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--color-outline, #a6adc8)" }}>
                Provedor de E-mail
              </label>
              <select
                value={config.channels?.email?.provider || 'resend'}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    channels: {
                      ...config.channels,
                      email: { ...config.channels?.email, provider: e.target.value as 'resend' | 'sendgrid' | 'smtp' },
                    },
                  })
                }
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  background: "var(--color-surface, #1e1e2e)",
                  border: "1px solid var(--color-outline-variant, rgba(255, 255, 255, 0.12))",
                  color: "inherit",
                  fontSize: "14px",
                }}
              >
                <option value="resend">Resend (Recomendado)</option>
                <option value="sendgrid">SendGrid</option>
                <option value="smtp">SMTP Corporativo</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--color-outline, #a6adc8)" }}>
                E-mail de Envio (Sender Address)
              </label>
              <input
                type="email"
                value={config.channels?.email?.sender_address || ''}
                placeholder="notifications@seusite.com"
                onChange={(e) =>
                  setConfig({
                    ...config,
                    channels: {
                      ...config.channels,
                      email: { ...config.channels?.email, sender_address: e.target.value },
                    },
                  })
                }
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  background: "var(--color-surface, #1e1e2e)",
                  border: "1px solid var(--color-outline-variant, rgba(255, 255, 255, 0.12))",
                  color: "inherit",
                  fontSize: "14px",
                }}
              />
            </div>

            {/* Status do Vault */}
            <div
              style={{
                padding: "12px",
                borderRadius: "8px",
                background: vaultStatus.hasEmailKey ? "rgba(16, 185, 129, 0.08)" : "rgba(245, 158, 11, 0.08)",
                border: vaultStatus.hasEmailKey ? "1px solid rgba(16, 185, 129, 0.2)" : "1px solid rgba(245, 158, 11, 0.2)",
                fontSize: "13px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 500 }}>
                  <Key size={14} />
                  {vaultStatus.hasEmailKey ? "Chave segura configurada no Vault" : "Chave de API ausente no Vault"}
                </span>
                <button
                  type="button"
                  onClick={() => setShowVaultKeyInput(!showVaultKeyInput)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--color-primary, #6366f1)",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 600,
                    textDecoration: "underline",
                  }}
                >
                  {showVaultKeyInput ? "Cancelar" : vaultStatus.hasEmailKey ? "Alterar Chave" : "Inserir Chave"}
                </button>
              </div>

              {showVaultKeyInput && (
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <input
                    type="password"
                    placeholder="re_123456789..."
                    value={vaultKeyVal}
                    onChange={(e) => setVaultKeyVal(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "6px 10px",
                      borderRadius: "6px",
                      background: "var(--color-surface, #1e1e2e)",
                      border: "1px solid var(--color-outline-variant, rgba(255, 255, 255, 0.12))",
                      color: "inherit",
                      fontSize: "13px",
                    }}
                  />
                  <Button size="sm" onClick={handleSaveVaultKey} disabled={isSavingKey}>
                    Salvar
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Canal 2: Webhook */}
        <div
          style={{
            background: "var(--color-surface-container, rgba(255, 255, 255, 0.03))",
            border: "1px solid var(--color-outline-variant, rgba(255, 255, 255, 0.08))",
            borderRadius: "12px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Webhook size={20} color="var(--color-primary, #6366f1)" />
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Webhook (Discord / Slack)</h3>
            </div>
            <input
              type="checkbox"
              checked={Boolean(config.channels?.webhook?.enabled)}
              onChange={(e) =>
                setConfig({
                  ...config,
                  channels: {
                    ...config.channels,
                    webhook: { ...config.channels?.webhook, enabled: e.target.checked },
                  },
                })
              }
              style={{ width: "18px", height: "18px", cursor: "pointer" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--color-outline, #a6adc8)" }}>
              URL do Webhook
            </label>
            <input
              type="url"
              value={config.channels?.webhook?.url || ''}
              placeholder="https://discord.com/api/webhooks/..."
              onChange={(e) =>
                setConfig({
                  ...config,
                  channels: {
                    ...config.channels,
                    webhook: { ...config.channels?.webhook, url: e.target.value },
                  },
                })
              }
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                background: "var(--color-surface, #1e1e2e)",
                border: "1px solid var(--color-outline-variant, rgba(255, 255, 255, 0.12))",
                color: "inherit",
                fontSize: "14px",
              }}
            />
            <p style={{ margin: "6px 0 0", fontSize: "12px", color: "var(--color-outline, #a6adc8)" }}>
              Detecta automaticamente formato Discord ou Slack para envio de mensagens com embed.
            </p>
          </div>
        </div>
      </div>

      {/* Matriz de Gatilhos & Cooldown */}
      <div
        style={{
          background: "var(--color-surface-container, rgba(255, 255, 255, 0.03))",
          border: "1px solid var(--color-outline-variant, rgba(255, 255, 255, 0.08))",
          borderRadius: "12px",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: 600 }}>Gatilhos de Governança</h3>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--color-outline, #a6adc8)" }}>
              Defina quais eventos autorizam o envio de notificações externas.
            </p>
          </div>

          {/* Seletor de Cooldown */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Clock size={16} color="var(--color-primary, #6366f1)" />
            <span style={{ fontSize: "13px" }}>Janela de Cooldown:</span>
            <select
              value={config.cooldown_minutes ?? 15}
              onChange={(e) => setConfig({ ...config, cooldown_minutes: parseInt(e.target.value, 10) })}
              style={{
                padding: "6px 10px",
                borderRadius: "6px",
                background: "var(--color-surface, #1e1e2e)",
                border: "1px solid var(--color-outline-variant, rgba(255, 255, 255, 0.12))",
                color: "inherit",
                fontSize: "13px",
              }}
            >
              <option value={5}>5 minutos</option>
              <option value={15}>15 minutos (Padrão)</option>
              <option value={30}>30 minutos</option>
              <option value={60}>1 hora</option>
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "14px" }}>
            <input
              type="checkbox"
              checked={Boolean(config.events?.on_quorum_requested ?? true)}
              onChange={(e) =>
                setConfig({
                  ...config,
                  events: { ...config.events, on_quorum_requested: e.target.checked },
                })
              }
            />
            <span>Solicitação de Quorum / Revisão</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "14px" }}>
            <input
              type="checkbox"
              checked={Boolean(config.events?.on_quorum_approved ?? true)}
              onChange={(e) =>
                setConfig({
                  ...config,
                  events: { ...config.events, on_quorum_approved: e.target.checked },
                })
              }
            />
            <span>Quorum Atingido / Aprovação</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "14px" }}>
            <input
              type="checkbox"
              checked={Boolean(config.events?.on_compliance_violation ?? true)}
              onChange={(e) =>
                setConfig({
                  ...config,
                  events: { ...config.events, on_compliance_violation: e.target.checked },
                })
              }
            />
            <span>Alerta de Violação de Compliance</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "14px" }}>
            <input
              type="checkbox"
              checked={Boolean(config.events?.on_clearance_changed ?? false)}
              onChange={(e) =>
                setConfig({
                  ...config,
                  events: { ...config.events, on_clearance_changed: e.target.checked },
                })
              }
            />
            <span>Atualização de Permissão / Clearance</span>
          </label>
        </div>
      </div>

      {/* Reviewers Cadastrados no Projeto */}
      <div
        style={{
          background: "var(--color-surface-container, rgba(255, 255, 255, 0.03))",
          border: "1px solid var(--color-outline-variant, rgba(255, 255, 255, 0.08))",
          borderRadius: "12px",
          padding: "24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <UserCheck size={20} color="var(--color-primary, #6366f1)" />
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
            Revisores & Destinatários ({reviewers.length})
          </h3>
        </div>

        {reviewers.length === 0 ? (
          <p style={{ margin: 0, fontSize: "14px", color: "var(--color-outline, #a6adc8)" }}>
            Nenhum revisor específico com e-mail cadastrado no .project.config.json. Notificações serão enviadas para os administradores gerais.
          </p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {reviewers.map((rev) => (
              <div
                key={rev.id || rev.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 14px",
                  borderRadius: "20px",
                  background: "var(--color-surface, #1e1e2e)",
                  border: "1px solid var(--color-outline-variant, rgba(255, 255, 255, 0.12))",
                  fontSize: "13px",
                }}
              >
                <span style={{ fontWeight: 600 }}>{rev.name}</span>
                {rev.email && <span style={{ color: "var(--color-outline, #a6adc8)" }}>({rev.email})</span>}
                {rev.tier && (
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      background: "rgba(99, 102, 241, 0.15)",
                      color: "var(--color-primary, #6366f1)",
                      textTransform: "uppercase",
                      fontWeight: 700,
                    }}
                  >
                    {rev.tier}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ações de Salvar e Teste */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          padding: "16px 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <input
            type="email"
            placeholder="e-mail para teste (opcional)"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              background: "var(--color-surface, #1e1e2e)",
              border: "1px solid var(--color-outline-variant, rgba(255, 255, 255, 0.12))",
              color: "inherit",
              fontSize: "13px",
              width: "220px",
            }}
          />
          <Button variant="outline" onClick={handleSendTest} disabled={isTesting}>
            <Send size={14} style={{ marginRight: "6px" }} />
            {isTesting ? "Enviando..." : "Enviar Notificação de Teste"}
          </Button>
        </div>

        {isAdmin && (
          <Button onClick={handleSaveConfig} disabled={isSaving}>
            <ShieldCheck size={16} style={{ marginRight: "6px" }} />
            {isSaving ? "Salvando..." : "Salvar Configurações"}
          </Button>
        )}
      </div>
    </div>
  );
};

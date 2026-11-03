import React, { useState } from "react";
import {
  Mail,
  X,
  Check,
  Building2,
  FolderGit2,
  User,
  Loader2,
  Clock,
} from "lucide-react";
import { Button, IconButton, Badge, AlertBanner } from "../ui";
import type { PendingInvitationsResult, RepoInvitation, OrgInvitation } from "../../types";

interface InvitationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  invitations: PendingInvitationsResult | null;
  isLoading: boolean;
  onAccept: (payload: { type: "repository" | "org"; id?: number | string; org?: string }) => Promise<{ success: boolean; message?: string; error?: string }>;
  onDecline: (payload: { type: "repository" | "org"; id?: number | string; org?: string }) => Promise<{ success: boolean; message?: string; error?: string }>;
  onRefresh: () => Promise<void>;
}

export const InvitationsModal: React.FC<InvitationsModalProps> = ({
  isOpen,
  onClose,
  invitations,
  isLoading,
  onAccept,
  onDecline,
  onRefresh,
}) => {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  if (!isOpen) return null;

  const repoInvites: RepoInvitation[] = invitations?.repository_invitations || [];
  const orgInvites: OrgInvitation[] = invitations?.org_invitations || [];
  const totalCount = repoInvites.length + orgInvites.length;

  const handleAcceptInvite = async (type: "repository" | "org", id?: number | string, org?: string) => {
    const key = `${type}-${id || org}`;
    setProcessingId(key);
    setFeedback(null);
    try {
      const res = await onAccept({ type, id, org });
      if (res.success) {
        setFeedback({ type: "success", text: res.message || "Convite aceito com sucesso!" });
        await onRefresh();
      } else {
        setFeedback({ type: "error", text: res.error || "Não foi possível aceitar o convite." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Erro de conexão ao aceitar convite." });
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeclineInvite = async (type: "repository" | "org", id?: number | string, org?: string) => {
    const key = `${type}-${id || org}`;
    setProcessingId(key);
    setFeedback(null);
    try {
      const res = await onDecline({ type, id, org });
      if (res.success) {
        setFeedback({ type: "success", text: res.message || "Convite recusado." });
        await onRefresh();
      } else {
        setFeedback({ type: "error", text: res.error || "Não foi possível recusar o convite." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Erro de conexão ao recusar convite." });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div
      id="modal-invitations-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.7)",
        backdropFilter: "blur(6px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        boxSizing: "border-box",
      }}
      onClick={onClose}
    >
      <div
        id="modal-invitations-card"
        style={{
          width: "100%",
          maxWidth: "580px",
          maxHeight: "85vh",
          backgroundColor: "var(--color-surface, #ffffff)",
          color: "var(--color-on-surface, #1e293b)",
          borderRadius: "16px",
          border: "1px solid var(--color-outline-variant, #e2e8f0)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "fadeIn 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header do Modal */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--color-outline-variant, #e2e8f0)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "var(--color-surface-container-low, #f8fafc)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                backgroundColor: "rgba(37, 99, 235, 0.12)",
                color: "var(--color-primary, #2563eb)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Mail size={18} />
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "17px",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                Convites de Acesso & Colaboração
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: "12px",
                  color: "var(--color-on-surface-variant, #64748b)",
                }}
              >
                Aceite convites recebidos no GitHub para sincronizar os repositórios com 1 clique
              </p>
            </div>
          </div>
          <IconButton icon={<X size={18} />} onClick={onClose} aria-label="Fechar" size="sm" />
        </div>

        {/* Corpo do Modal */}
        <div
          style={{
            padding: "20px 24px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            flex: 1,
          }}
        >
          {feedback && (
            <AlertBanner
              variant={feedback.type}
              title={feedback.text}
              onClose={() => setFeedback(null)}
            />
          )}

          {isLoading ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "48px 16px",
                gap: "12px",
                color: "var(--color-on-surface-variant, #64748b)",
              }}
            >
              <Loader2 size={24} className="animate-spin" />
              <span style={{ fontSize: "13px" }}>Consultando convites pendentes no GitHub...</span>
            </div>
          ) : totalCount === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "48px 16px",
                textAlign: "center",
                gap: "12px",
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(16, 185, 129, 0.12)",
                  color: "#10b981",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Check size={24} />
              </div>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>
                Nenhum convite pendente
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  color: "var(--color-on-surface-variant, #64748b)",
                  maxWidth: "340px",
                }}
              >
                Você já tem acesso a todos os repositórios e organizações para os quais foi convidado.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Convites de Repositório */}
              {repoInvites.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      color: "var(--color-on-surface-variant, #64748b)",
                      letterSpacing: "0.05em",
                      marginBottom: "8px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <FolderGit2 size={13} />
                    <span>Repositórios ({repoInvites.length})</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {repoInvites.map((inv) => {
                      const isActing = processingId === `repository-${inv.id}`;
                      return (
                        <div
                          key={`repo-invite-${inv.id}`}
                          style={{
                            padding: "14px 16px",
                            borderRadius: "12px",
                            border: "1px solid var(--color-outline-variant, #e2e8f0)",
                            backgroundColor: "var(--color-surface-container-lowest, #ffffff)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              gap: "10px",
                            }}
                          >
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span
                                  style={{
                                    fontSize: "14px",
                                    fontWeight: 700,
                                    color: "var(--color-on-surface, #0f172a)",
                                  }}
                                >
                                  {inv.full_name}
                                </span>
                                <Badge variant={inv.permissions === "admin" ? "purple" : "primary"}>
                                  {inv.permissions === "admin" ? "Admin" : inv.permissions === "write" ? "Escrita" : "Leitura"}
                                </Badge>
                              </div>
                              <div
                                style={{
                                  fontSize: "12px",
                                  color: "var(--color-on-surface-variant, #64748b)",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  marginTop: "4px",
                                }}
                              >
                                <User size={12} />
                                <span>Convidado por <strong>@{inv.inviter}</strong></span>
                              </div>
                            </div>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              gap: "8px",
                              marginTop: "4px",
                              paddingTop: "8px",
                              borderTop: "1px dashed var(--color-outline-variant, #e2e8f0)",
                            }}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeclineInvite("repository", inv.id)}
                              disabled={isActing}
                              style={{ fontSize: "12px", color: "var(--color-error, #ef4444)" }}
                            >
                              Recusar
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleAcceptInvite("repository", inv.id)}
                              loading={isActing}
                              disabled={Boolean(processingId && !isActing)}
                              style={{ fontSize: "12px", fontWeight: 600 }}
                            >
                              <Check size={14} />
                              <span>Aceitar e Liberar Acesso</span>
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Convites de Organização */}
              {orgInvites.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      color: "var(--color-on-surface-variant, #64748b)",
                      letterSpacing: "0.05em",
                      marginBottom: "8px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Building2 size={13} />
                    <span>Organizações ({orgInvites.length})</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {orgInvites.map((inv) => {
                      const isActing = processingId === `org-${inv.org_login}`;
                      return (
                        <div
                          key={`org-invite-${inv.org_login}`}
                          style={{
                            padding: "14px 16px",
                            borderRadius: "12px",
                            border: "1px solid var(--color-outline-variant, #e2e8f0)",
                            backgroundColor: "var(--color-surface-container-lowest, #ffffff)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              {inv.avatar_url ? (
                                <img
                                  src={inv.avatar_url}
                                  alt={inv.org_name}
                                  style={{ width: "32px", height: "32px", borderRadius: "8px" }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: "32px",
                                    height: "32px",
                                    borderRadius: "8px",
                                    backgroundColor: "var(--color-primary-container, #d2e3fc)",
                                    color: "var(--color-primary, #1a73e8)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  <Building2 size={16} />
                                </div>
                              )}
                              <div>
                                <div
                                  style={{
                                    fontSize: "14px",
                                    fontWeight: 700,
                                    color: "var(--color-on-surface, #0f172a)",
                                  }}
                                >
                                  {inv.org_name}
                                </div>
                                <div
                                  style={{
                                    fontSize: "12px",
                                    color: "var(--color-on-surface-variant, #64748b)",
                                  }}
                                >
                                  @{inv.org_login} • Papel: {inv.role === "admin" ? "Administrador" : "Membro"}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              gap: "8px",
                              marginTop: "4px",
                              paddingTop: "8px",
                              borderTop: "1px dashed var(--color-outline-variant, #e2e8f0)",
                            }}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeclineInvite("org", undefined, inv.org_login)}
                              disabled={isActing}
                              style={{ fontSize: "12px", color: "var(--color-error, #ef4444)" }}
                            >
                              Recusar
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleAcceptInvite("org", undefined, inv.org_login)}
                              loading={isActing}
                              disabled={Boolean(processingId && !isActing)}
                              style={{ fontSize: "12px", fontWeight: 600 }}
                            >
                              <Check size={14} />
                              <span>Entrar na Organização</span>
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--color-outline-variant, #e2e8f0)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "var(--color-surface-container-low, #f8fafc)",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              color: "var(--color-on-surface-variant, #64748b)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <Clock size={12} />
            Atualização em tempo real via GitHub
          </span>
          <Button variant="subtle" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
};

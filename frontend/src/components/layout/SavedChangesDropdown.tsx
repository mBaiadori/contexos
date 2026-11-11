import React, { useEffect, useState } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { API } from "../../services/api";
import type { StashDetails } from "../../types";
import { Button } from "../ui";
import { humanizeBranchName } from "../../views/subviews/prs/utils/prFormatters";
import {
  RotateCcw,
  Download,
  Trash2,
  Clock,
  GitBranch,
  FileText,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

export interface SavedChangesDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export const SavedChangesDropdown: React.FC<SavedChangesDropdownProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    versionGraph,
    activeRepo,
    popStash,
    dropStash,
    createOrSwitchBranch,
    refreshVersionGraph,
    refreshGitStatus,
  } = useWorkspace();

  const [details, setDetails] = useState<StashDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const stashes = versionGraph?.stashes || [];
  const latestStash = stashes[0];

  useEffect(() => {
    if (!isOpen || !latestStash) return;

    let isMounted = true;
    setIsLoading(true);
    setFeedback(null);

    API.getStashDetails(latestStash.id, activeRepo?.name)
      .then((res) => {
        if (isMounted && res.ok && res.data) {
          setDetails(res.data);
        }
      })
      .catch((err) => {
        console.error("[SavedChangesDropdown] Erro ao carregar detalhes do rascunho guardado:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, latestStash?.id, activeRepo?.name]);

  if (!isOpen || stashes.length === 0) return null;

  const currentBranch = versionGraph?.currentBranch || "main";
  const fromBranch = details?.fromBranch || "main";
  const isSameBranch = currentBranch === fromBranch;

  const currentBranchLabel = humanizeBranchName(currentBranch, versionGraph?.nodes);
  const fromBranchLabel = humanizeBranchName(fromBranch, versionGraph?.nodes);

  // Formatar tempo relativo
  const formatDate = (isoString?: string) => {
    if (!isoString) return "recente";
    try {
      const dt = new Date(isoString);
      return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
        " - " +
        dt.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
    } catch {
      return isoString;
    }
  };

  // 1. Voltar para a versão de origem e restaurar
  const handleSwitchAndRestore = async () => {
    if (!latestStash) return;
    setIsProcessing(true);
    setFeedback(null);

    try {
      if (!isSameBranch) {
        const switchRes = await createOrSwitchBranch(fromBranch);
        if (!switchRes?.success) {
          setFeedback({
            type: "error",
            message:
              switchRes?.message ||
              `Não foi possível alternar para a versão de origem "${fromBranchLabel}".`,
          });
          setIsProcessing(false);
          return;
        }
      }

      const popRes = await popStash(latestStash.id);
      if (popRes.success) {
        setFeedback({
          type: "success",
          message: `Rascunho restaurado com sucesso na versão "${fromBranchLabel}"!`,
        });
        if (refreshGitStatus) await refreshGitStatus(activeRepo?.name);
        if (refreshVersionGraph) await refreshVersionGraph(activeRepo?.name);
        setTimeout(() => onClose(), 1200);
      } else {
        setFeedback({
          type: "error",
          message: popRes.message || "Erro ao restaurar alterações guardadas.",
        });
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message: (err as Error).message || "Falha ao restaurar rascunho.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Aplicar na versão atual
  const handleApplyCurrent = async () => {
    if (!latestStash) return;
    setIsProcessing(true);
    setFeedback(null);

    try {
      const popRes = await popStash(latestStash.id);
      if (popRes.success) {
        setFeedback({
          type: "success",
          message: `Rascunho aplicado com sucesso na versão atual "${currentBranchLabel}"!`,
        });
        if (refreshGitStatus) await refreshGitStatus(activeRepo?.name);
        if (refreshVersionGraph) await refreshVersionGraph(activeRepo?.name);
        setTimeout(() => onClose(), 1200);
      } else {
        setFeedback({
          type: "error",
          message: popRes.message || "Erro ao aplicar na versão atual (possível conflito de edição).",
        });
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message: (err as Error).message || "Falha ao aplicar alterações.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Mover para a Lixeira permanente
  const handleMoveToTrash = async () => {
    if (!latestStash) return;
    if (
      !window.confirm(
        "Mover este rascunho guardado para a Lixeira? Ele continuará preservado na Lixeira e poderá ser recuperado a qualquer momento."
      )
    ) {
      return;
    }

    setIsProcessing(true);
    setFeedback(null);

    try {
      const res = await dropStash(latestStash.id);
      if (res.success) {
        setFeedback({
          type: "success",
          message: "Rascunho movido para a Lixeira com segurança.",
        });
        if (refreshVersionGraph) await refreshVersionGraph(activeRepo?.name);
        setTimeout(() => onClose(), 1200);
      } else {
        setFeedback({
          type: "error",
          message: res.message || "Erro ao mover para a Lixeira.",
        });
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message: (err as Error).message || "Falha ao mover para a Lixeira.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      id="saved-changes-dropdown-menu"
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        left: 0,
        width: "360px",
        backgroundColor: "var(--bg-surface-elevated, #ffffff)",
        borderRadius: "12px",
        border: "1px solid var(--border-color, rgba(0, 0, 0, 0.12))",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
        zIndex: 1000,
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      {/* Cabeçalho */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid var(--border-color, rgba(0, 0, 0, 0.08))",
          paddingBottom: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "24px",
              height: "24px",
              borderRadius: "6px",
              backgroundColor: "rgba(245, 158, 11, 0.15)",
              color: "#d97706",
            }}
          >
            📦
          </span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-heading)" }}>
            Alterações Guardadas
          </span>
        </div>
        <span
          style={{
            fontSize: "11px",
            color: "var(--text-secondary)",
            backgroundColor: "var(--bg-surface, rgba(0, 0, 0, 0.04))",
            padding: "2px 8px",
            borderRadius: "9999px",
          }}
        >
          {stashes.length} {stashes.length === 1 ? "rascunho" : "rascunhos"}
        </span>
      </div>

      {feedback && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor:
              feedback.type === "success"
                ? "rgba(34, 197, 94, 0.12)"
                : "rgba(239, 68, 68, 0.12)",
            color: feedback.type === "success" ? "#16a34a" : "#dc2626",
            border: `1px solid ${
              feedback.type === "success"
                ? "rgba(34, 197, 94, 0.3)"
                : "rgba(239, 68, 68, 0.3)"
            }`,
          }}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 size={14} />
          ) : (
            <AlertCircle size={14} />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {isLoading ? (
        <div style={{ fontSize: "12px", color: "var(--text-secondary)", textAlign: "center", padding: "12px" }}>
          Carregando informações do rascunho...
        </div>
      ) : (
        <>
          {/* Informações de Origem e Tempo */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              backgroundColor: "var(--bg-surface, rgba(0, 0, 0, 0.02))",
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid var(--border-color, rgba(0, 0, 0, 0.06))",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
              <GitBranch size={13} style={{ color: "#7c3aed" }} />
              <span style={{ color: "var(--text-secondary)" }}>Origem:</span>
              <strong style={{ color: "var(--text-primary)" }}>{fromBranchLabel}</strong>
              {!isSameBranch && (
                <span
                  style={{
                    fontSize: "10px",
                    color: "#d97706",
                    backgroundColor: "rgba(245, 158, 11, 0.12)",
                    padding: "1px 6px",
                    borderRadius: "4px",
                    marginLeft: "auto",
                  }}
                >
                  ativa: {currentBranchLabel}
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
              <Clock size={13} style={{ color: "var(--text-secondary)" }} />
              <span style={{ color: "var(--text-secondary)" }}>Guardado em:</span>
              <span style={{ color: "var(--text-primary)" }}>{formatDate(details?.date || latestStash.date)}</span>
            </div>
          </div>

          {/* Lista de Arquivos Modificados */}
          {details?.files && details.files.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Arquivos ({details.files.length})
              </div>
              <div
                style={{
                  maxHeight: "120px",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  border: "1px solid var(--border-color, rgba(0, 0, 0, 0.06))",
                  borderRadius: "6px",
                  padding: "6px 8px",
                }}
              >
                {details.files.map((file, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "11px",
                      gap: "6px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={file.path}
                    >
                      <FileText size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                        {file.path}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "4px", flexShrink: 0, fontSize: "10px", fontWeight: 600 }}>
                      {file.additions > 0 && (
                        <span style={{ color: "#16a34a" }}>+{file.additions}</span>
                      )}
                      {file.deletions > 0 && (
                        <span style={{ color: "#dc2626" }}>-{file.deletions}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ações */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSwitchAndRestore}
              disabled={isProcessing}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                width: "100%",
                backgroundColor: "#2563eb",
              }}
            >
              <RotateCcw size={13} />
              <span>
                {isSameBranch
                  ? "Restaurar edições nesta versão"
                  : `Voltar para "${fromBranchLabel}" e Restaurar`}
              </span>
            </Button>

            {!isSameBranch && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleApplyCurrent}
                disabled={isProcessing}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  width: "100%",
                  fontSize: "11px",
                }}
              >
                <Download size={13} />
                <span>Aplicar na versão ativa atual ("{currentBranchLabel}")</span>
              </Button>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "1px solid var(--border-color, rgba(0, 0, 0, 0.08))",
                paddingTop: "8px",
                marginTop: "4px",
              }}
            >
              <button
                type="button"
                onClick={handleMoveToTrash}
                disabled={isProcessing}
                style={{
                  background: "none",
                  border: "none",
                  padding: "4px",
                  color: "#dc2626",
                  fontSize: "11px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  cursor: "pointer",
                  borderRadius: "4px",
                }}
                title="Mover este rascunho para a Lixeira permanente"
              >
                <Trash2 size={12} />
                <span>Mover para a Lixeira</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                style={{
                  background: "none",
                  border: "none",
                  padding: "4px 8px",
                  color: "var(--text-secondary)",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

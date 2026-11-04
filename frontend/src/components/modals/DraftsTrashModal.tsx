import React, { useEffect, useState } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { API } from "../../services/api";
import type { DiscardedDraftItem } from "../../types";
import { Modal, Button } from "../ui";
import {
  Trash2,
  RotateCcw,
  Clock,
  GitBranch,
  FileText,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

export interface DraftsTrashModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DraftsTrashModal: React.FC<DraftsTrashModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { activeRepo, refreshGitStatus, refreshPendingChanges } = useWorkspace();
  const [trashItems, setTrashItems] = useState<DiscardedDraftItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DiscardedDraftItem | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadTrash = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await API.getTrash(activeRepo?.name);
      if (res.ok && res.data?.trash) {
        setTrashItems(res.data.trash);
        if (res.data.trash.length > 0 && !selectedItem) {
          setSelectedItem(res.data.trash[0]);
        }
      }
    } catch (err: any) {
      console.error("[DraftsTrashModal] Erro ao carregar lixeira:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTrash();
    }
  }, [isOpen, activeRepo?.name]);

  const handleRestore = async (id: string) => {
    setIsProcessing(true);
    setFeedback(null);
    try {
      const res = await API.restoreTrash(id, activeRepo?.name);
      if (res.ok && res.data?.success) {
        setFeedback({
          type: "success",
          message: res.data.message || "Rascunho restaurado com sucesso no workspace!",
        });
        if (refreshGitStatus) await refreshGitStatus(activeRepo?.name);
        if (refreshPendingChanges) await refreshPendingChanges(activeRepo?.name);
        await loadTrash();
      } else {
        setFeedback({
          type: "error",
          message: res.data?.message || "Erro ao restaurar rascunho da lixeira.",
        });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Falha na comunicação com o servidor." });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Excluir permanentemente este rascunho da lixeira?")) return;
    setIsProcessing(true);
    try {
      await API.deleteTrashItem(id, activeRepo?.name);
      if (selectedItem?.id === id) setSelectedItem(null);
      await loadTrash();
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearTrash = async () => {
    if (!window.confirm("Esvaziar permanentemente toda a lixeira de rascunhos? Esta ação não pode ser desfeita.")) return;
    setIsProcessing(true);
    try {
      await API.clearTrash(activeRepo?.name);
      setSelectedItem(null);
      await loadTrash();
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" }) +
        " às " +
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return isoString;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title="Lixeira Local de Rascunhos"
      subtitle="Rascunhos e alterações descartadas são mantidos localmente por tempo indeterminado para que você nunca perca trabalho acidentalmente."
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
          <div>
            {trashItems.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearTrash}
                disabled={isProcessing}
                style={{ color: "#dc2626", borderColor: "rgba(239, 68, 68, 0.4)" }}
              >
                Esvaziar Lixeira
              </Button>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {feedback && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
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
            {feedback.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{feedback.message}</span>
          </div>
        )}

        {isLoading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-secondary)", fontSize: "13px" }}>
            Carregando lixeira de rascunhos...
          </div>
        ) : trashItems.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "50px 20px",
              color: "var(--text-secondary)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <span style={{ fontSize: "36px" }}>🗑️</span>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
              A lixeira está vazia
            </div>
            <p style={{ margin: 0, fontSize: "12px", maxWidth: "420px" }}>
              Quando você descarta alterações ou rascunhos de navegação, eles são preservados aqui automaticamente para recuperação a qualquer momento.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "320px 1fr",
              gap: "14px",
              minHeight: "360px",
              maxHeight: "480px",
            }}
          >
            {/* Lista Lateral de Rascunhos Descartados */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                overflowY: "auto",
                borderRight: "1px solid var(--border-color)",
                paddingRight: "10px",
              }}
            >
              {trashItems.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      backgroundColor: isSelected
                        ? "rgba(37, 99, 235, 0.1)"
                        : "var(--bg-surface)",
                      border: `1px solid ${
                        isSelected
                          ? "rgba(37, 99, 235, 0.4)"
                          : "var(--border-color, rgba(0, 0, 0, 0.08))"
                      }`,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-heading)" }}>
                        {item.message || "Rascunho"}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteItem(item.id, e)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: "2px 4px",
                          color: "var(--text-secondary)",
                          cursor: "pointer",
                          opacity: 0.6,
                        }}
                        title="Excluir da lixeira"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-secondary)" }}>
                      <GitBranch size={12} style={{ color: "#7c3aed" }} />
                      <span>{item.fromBranch}</span>
                      <span>·</span>
                      <span>{item.fileCount} {item.fileCount === 1 ? "arquivo" : "arquivos"}</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "var(--text-secondary)" }}>
                      <Clock size={11} />
                      <span>{formatDate(item.discardedAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Painel de Detalhes e Ações do Item Selecionado */}
            {selectedItem ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", paddingLeft: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                  <div>
                    <h3 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: 700, color: "var(--text-heading)" }}>
                      {selectedItem.message || "Rascunho descartado"}
                    </h3>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--text-secondary)" }}>
                      <span>Origem: <strong>{selectedItem.fromBranch}</strong></span>
                      <span>·</span>
                      <span>Descartado em: {formatDate(selectedItem.discardedAt)}</span>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleRestore(selectedItem.id)}
                    disabled={isProcessing}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      backgroundColor: "#2563eb",
                    }}
                  >
                    <RotateCcw size={13} />
                    <span>Restaurar no Workspace</span>
                  </Button>
                </div>

                {/* Arquivos do Rascunho */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                    Arquivos modificados ({selectedItem.files.length}):
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      backgroundColor: "var(--bg-surface)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "6px",
                      padding: "8px 10px",
                    }}
                  >
                    {selectedItem.files.map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <FileText size={12} style={{ opacity: 0.7 }} />
                          <span>{f.path}</span>
                        </div>
                        <div style={{ display: "flex", gap: "6px", fontSize: "10px", fontWeight: 600 }}>
                          {(f.additions || 0) > 0 && <span style={{ color: "#16a34a" }}>+{f.additions}</span>}
                          {(f.deletions || 0) > 0 && <span style={{ color: "#dc2626" }}>-{f.deletions}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Patch Diff Preview */}
                {selectedItem.patch && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                      Pré-visualização do Patch:
                    </div>
                    <pre
                      style={{
                        margin: 0,
                        padding: "10px",
                        borderRadius: "6px",
                        backgroundColor: "var(--bg-surface-elevated, #1e1e1e)",
                        color: "var(--text-primary, #e0e0e0)",
                        fontFamily: "monospace",
                        fontSize: "11px",
                        maxHeight: "180px",
                        overflow: "auto",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {selectedItem.patch}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "12px" }}>
                Selecione um rascunho da lista lateral para visualizar detalhes e restaurar.
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

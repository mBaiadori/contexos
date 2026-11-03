import React, { useState } from "react";
import { Modal, Button, Badge, Input } from "../ui";
import type { GitFileStatus } from "../../types";

export interface SafeSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetBranch: string;
  currentBranch: string;
  uncommittedFiles: GitFileStatus[];
  onConfirmCommit?: (message: string) => void | Promise<void>;
  onConfirmStash: () => void | Promise<void>;
  onConfirmDiscard: () => void | Promise<void>;
  isProcessing?: boolean;
}

export const SafeSwitchModal: React.FC<SafeSwitchModalProps> = ({
  isOpen,
  onClose,
  targetBranch,
  currentBranch,
  uncommittedFiles,
  onConfirmCommit,
  onConfirmStash,
  onConfirmDiscard,
  isProcessing = false,
}) => {
  const [commitMsg, setCommitMsg] = useState("");

  if (!isOpen) return null;

  const handleCommitAndSwitch = () => {
    if (!onConfirmCommit) return;
    const msg = commitMsg.trim() || `Marco de trabalho em ${currentBranch}`;
    onConfirmCommit(msg);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title="Alterações Pendentes no Disco"
      subtitle={`Você tem alterações na versão "${currentBranch}". Como deseja prosseguir antes de mudar para "${targetBranch}"?`}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: "8px", flexWrap: "wrap" }}>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isProcessing}
          >
            Cancelar
          </Button>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Button
              variant="outline"
              size="sm"
              onClick={onConfirmDiscard}
              disabled={isProcessing}
              style={{ color: "var(--color-error, #ef4444)", borderColor: "rgba(239, 68, 68, 0.4)" }}
            >
              Descartar
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onConfirmStash}
              disabled={isProcessing}
            >
              Guardar rascunhos (Stash)
            </Button>

            {onConfirmCommit && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleCommitAndSwitch}
                disabled={isProcessing}
              >
                {isProcessing ? "Salvando..." : "Salvar marco e alternar"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
          Para que nenhuma alteração seja perdida, você pode <strong>salvar um marco permanente (commit)</strong> nesta versão atual ou <strong>guardar em rascunhos temporários</strong>. O histórico de edições continuará visível e intacto.
        </p>

        {onConfirmCommit && (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-heading)" }}>
              Descrição do marco (opcional):
            </label>
            <Input
              type="text"
              placeholder={`Marco de trabalho em ${currentBranch}`}
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              style={{ height: "30px", fontSize: "12px" }}
            />
          </div>
        )}

        {uncommittedFiles.length > 0 && (
          <div
            style={{
              maxHeight: "150px",
              overflowY: "auto",
              border: "1px solid var(--border-color)",
              borderRadius: "6px",
              background: "var(--bg-surface)",
              padding: "6px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            {uncommittedFiles.map((f, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "11px",
                  padding: "3px 6px",
                  borderRadius: "4px",
                  background: "var(--bg-main)",
                }}
              >
                <span
                  style={{
                    fontFamily: "monospace",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "75%",
                  }}
                  title={f.path}
                >
                  {f.path}
                </span>
                <Badge
                  variant={f.status === "M" ? "warning" : f.status === "A" || f.status === "??" ? "success" : "info"}
                  size="sm"
                >
                  {f.status === "M" ? "Modificado" : f.status === "A" || f.status === "??" ? "Novo" : "Excluído"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
export default SafeSwitchModal;

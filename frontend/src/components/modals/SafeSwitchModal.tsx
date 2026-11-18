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
  onConfirmStash?: () => void | Promise<void>;
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
  onConfirmDiscard,
  isProcessing = false,
}) => {
  const [commitMsg, setCommitMsg] = useState("");

  if (!isOpen) return null;

  const handleCommitAndSwitch = () => {
    if (!onConfirmCommit) return;
    const msg = commitMsg.trim() || `Checkpoint em ${currentBranch}`;
    onConfirmCommit(msg);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title="Alterações sem Checkpoint"
      subtitle={`Você possui edições não salvas em checkpoint em "${currentBranch}". Como deseja prosseguir antes de mudar para "${targetBranch}"?`}
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
              title="Descarta as alterações não salvas (movendo para a lixeira local)."
              style={{ color: "var(--color-error, #ef4444)", borderColor: "rgba(239, 68, 68, 0.4)" }}
            >
              Descartar alterações e Trocar
            </Button>

            {onConfirmCommit && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleCommitAndSwitch}
                disabled={isProcessing}
              >
                {isProcessing ? "Salvando..." : "Criar Checkpoint e Trocar"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
          Para não perder o que você editou, salve um <strong>Checkpoint</strong> na versão atual antes de alternar, ou descarte essas alterações pendentes.
        </p>

        {onConfirmCommit && (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-heading)" }}>
              Descrição do checkpoint (opcional):
            </label>
            <Input
              type="text"
              placeholder={`Checkpoint em ${currentBranch}`}
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

import React, { useEffect, useState } from "react";
import { Modal, Button, Badge, Input } from "../ui";
import type { GitFileStatus } from "../../types";

export interface SafeSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetBranch: string;
  currentBranch: string;
  uncommittedFiles: GitFileStatus[];
  isProtectedSource?: boolean;
  isOfficialSource?: boolean;
  onConfirmCommit?: (message: string) => void | Promise<void>;
  onConfirmCreateDraftAndSwitch?: (draftTitle: string) => void | Promise<void>;
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
  isProtectedSource = false,
  isOfficialSource = false,
  onConfirmCommit,
  onConfirmCreateDraftAndSwitch,
  onConfirmStash,
  onConfirmDiscard,
  isProcessing = false,
}) => {
  const [commitMsg, setCommitMsg] = useState("");
  const [draftTitle, setDraftTitle] = useState("Rascunho de alterações");

  useEffect(() => {
    if (isOpen) {
      setCommitMsg("");
      setDraftTitle(`Rascunho ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h")}`);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCommitAndSwitch = () => {
    if (!onConfirmCommit || isProtectedSource) return;
    const msg = commitMsg.trim() || `Checkpoint em ${currentBranch}`;
    onConfirmCommit(msg);
  };

  const handleCreateDraftAndSwitch = () => {
    if (!onConfirmCreateDraftAndSwitch) return;
    onConfirmCreateDraftAndSwitch(draftTitle.trim() || "Rascunho de alterações");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title="Alterações sem Checkpoint"
      subtitle={`Você possui edições não salvas em "${currentBranch}". Como deseja prosseguir antes de mudar para "${targetBranch}"?`}
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

            {isProtectedSource && onConfirmStash && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onConfirmStash}
                disabled={isProcessing}
              >
                Guardar no Stash e Trocar
              </Button>
            )}

            {isProtectedSource && isOfficialSource && onConfirmCreateDraftAndSwitch && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateDraftAndSwitch}
                disabled={isProcessing || !draftTitle.trim()}
              >
                {isProcessing ? "Salvando..." : "Salvar em Rascunho e Trocar"}
              </Button>
            )}

            {!isProtectedSource && onConfirmCommit && (
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
        {isProtectedSource ? (
          <div
            style={{
              padding: "8px 10px",
              borderRadius: "6px",
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.35)",
              fontSize: "12px",
              color: "#92400e",
              lineHeight: 1.45,
            }}
          >
            {isOfficialSource
              ? "A Versão Oficial é protegida e não recebe checkpoints diretos. Você pode isolar suas alterações em um novo rascunho antes de trocar, guardá-las no stash ou descartá-las."
              : "Esta visualização é somente leitura e não recebe checkpoints diretos. Guarde suas alterações no stash ou descarte antes de trocar."}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
            Para não perder o que você editou, salve um <strong>Checkpoint</strong> na versão atual antes de alternar, ou descarte essas alterações pendentes.
          </p>
        )}

        {isProtectedSource && isOfficialSource && onConfirmCreateDraftAndSwitch && (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-heading)" }}>
              Nome do novo rascunho de versão:
            </label>
            <Input
              type="text"
              placeholder="Ex: ajuste-documento"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              style={{ height: "30px", fontSize: "12px" }}
            />
          </div>
        )}

        {!isProtectedSource && onConfirmCommit && (
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

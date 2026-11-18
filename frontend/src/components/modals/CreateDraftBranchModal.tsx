import React, { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import { Modal, Button, FormField, Input } from "../ui";

export interface CreateDraftBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultBaseBranch: string;
  currentBranchLabel?: string;
  availableBranches?: Array<{ name: string; displayName?: string; isDefault?: boolean }>;
  suggestedName?: string;
  onConfirmCreate: (params: {
    branchName: string;
    baseBranch: string;
    displayTitle: string;
  }) => void | Promise<void>;
  isProcessing?: boolean;
}

export const CreateDraftBranchModal: React.FC<CreateDraftBranchModalProps> = ({
  isOpen,
  onClose,
  defaultBaseBranch,
  availableBranches = [],
  suggestedName = "",
  onConfirmCreate,
  isProcessing = false,
}) => {
  const [title, setTitle] = useState("");
  const [baseBranch, setBaseBranch] = useState(defaultBaseBranch);
  const [showAdvancedBase, setShowAdvancedBase] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle(suggestedName || "Nova edição");
      setBaseBranch(defaultBaseBranch);
      setShowAdvancedBase(false);
    }
  }, [isOpen, suggestedName, defaultBaseBranch]);

  if (!isOpen) return null;

  const slugify = (raw: string) =>
    raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || `rascunho-${Date.now().toString().slice(-4)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim() || "Nova edição";
    await onConfirmCreate({
      branchName: slugify(cleanTitle),
      baseBranch: baseBranch || defaultBaseBranch,
      displayTitle: cleanTitle,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <GitBranch size={18} color="var(--color-primary, #2563eb)" />
          <span>Criar Rascunho de Versão</span>
        </span>
      }
      subtitle="Para proteger a Versão Oficial, suas edições ficam salvas em um rascunho próprio até você decidir publicar."
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", width: "100%" }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            isLoading={isProcessing}
            disabled={!title.trim() || isProcessing}
          >
            {isProcessing ? "Criando..." : "Criar e Começar a Editar"}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <FormField
          label="Nome deste rascunho de versão"
          required
          helperText="Use um nome curto para identificar o que você vai alterar."
        >
          <Input
            id="create-draft-branch-name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Ajuste no guia de onboarding"
            autoFocus
          />
        </FormField>

        <div
          style={{
            padding: "10px 12px",
            borderRadius: "8px",
            background: "var(--bg-main, #f8fafc)",
            border: "1px solid var(--border-color, #e2e8f0)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px" }}>
            <span style={{ color: "var(--text-secondary)" }}>
              Base inicial:{" "}
              <strong style={{ color: "var(--text-heading)" }}>
                {baseBranch === defaultBaseBranch
                  ? "Versão Oficial (Padrão)"
                  : availableBranches.find((b) => b.name === baseBranch)?.displayName || baseBranch}
              </strong>
            </span>
            {availableBranches.length > 1 && (
              <button
                type="button"
                onClick={() => setShowAdvancedBase((v) => !v)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--color-primary, #2563eb)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {showAdvancedBase ? "Ocultar opções" : "Alterar base"}
              </button>
            )}
          </div>

          {showAdvancedBase && (
            <select
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              style={{
                height: "34px",
                borderRadius: "6px",
                border: "1px solid var(--border-color, #cbd5e1)",
                padding: "0 10px",
                fontSize: "12.5px",
                background: "var(--bg-surface, #ffffff)",
                color: "var(--text-heading, #0f172a)",
              }}
            >
              {availableBranches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.isDefault ? "Versão Oficial (Padrão)" : b.displayName || b.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </form>
    </Modal>
  );
};

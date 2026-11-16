import React from "react";
import { FileText, Plus } from "lucide-react";

interface EditorEmptyStateProps {
  onOpenScaffoldWizard?: () => void;
}

export const EditorEmptyState: React.FC<EditorEmptyStateProps> = ({
  onOpenScaffoldWizard,
}) => {
  return (
    <div id="editor-empty-state" className="editor-empty-state">
      <div className="editor-empty-state-card">
        <div className="empty-icon-circle">
          <FileText size={32} color="var(--primary, #2563eb)" />
        </div>
        <h2
          style={{
            fontSize: "18px",
            fontWeight: 600,
            color: "var(--text-heading, #0f172a)",
            margin: "14px 0 6px",
          }}
        >
          Nenhum Documento Selecionado
        </h2>
        <p
          style={{
            fontSize: "13px",
            color: "var(--text-muted, #64748b)",
            margin: "0 0 22px",
            lineHeight: 1.5,
            maxWidth: "380px",
          }}
        >
          Selecione uma especificação na árvore lateral ou inicie a modelagem
          de um novo domínio de arquitetura.
        </p>
        <div
          className="empty-state-actions"
          style={{ display: "flex", gap: "10px", justifyContent: "center" }}
        >
          {onOpenScaffoldWizard && (
            <button
              id="btn-empty-new-spec"
              className="btn btn-primary btn-sm"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
              onClick={onOpenScaffoldWizard}
            >
              <Plus size={15} />
              <span>Explorar Templates & Criar</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

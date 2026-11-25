import React from "react";

export type EditorWidthMode = "narrow" | "normal" | "wide";

export interface DocConnectivityActionsProps {
  onCopyDoc?: () => void;
  onExportDoc?: () => void;
  onImportDoc?: () => void;
  isGitMode?: boolean;
  onToggleGitMode?: () => void;
  isHistoryDrawerOpen?: boolean;
  onToggleHistoryDrawer?: () => void;
  widthMode?: EditorWidthMode;
  onCycleWidthMode?: () => void;
  onSave?: (metaOverride?: Record<string, any>) => void;
  saveStatus?: string;
  isDirty?: boolean;
}

const WIDTH_MODE_META: Record<
  EditorWidthMode,
  { label: string; nextLabel: string; icon: string }
> = {
  narrow: { label: "Estreito", nextLabel: "Normal", icon: "unfold_less" },
  normal: { label: "Normal", nextLabel: "Largo", icon: "view_stream" },
  wide: { label: "Largo", nextLabel: "Estreito", icon: "open_in_full" },
};

export const DocConnectivityActions: React.FC<DocConnectivityActionsProps> = ({
  onCopyDoc,
  onExportDoc,
  onImportDoc,
  isGitMode = false,
  onToggleGitMode,
  isHistoryDrawerOpen = false,
  onToggleHistoryDrawer,
  widthMode = "normal",
  onCycleWidthMode,
  onSave,
  saveStatus,
  isDirty = false,
}) => {
  const widthMeta = WIDTH_MODE_META[widthMode];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      {onCycleWidthMode && (
        <button
          id="btn-cycle-width-mode"
          className={`btn-icon-action ${widthMode !== "normal" ? "active" : ""}`}
          type="button"
          title={`Largura: ${widthMeta.label} (clique para ${widthMeta.nextLabel})`}
          onClick={onCycleWidthMode}
          style={{
            width: "28px",
            height: "28px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "6px",
            border: "1px solid",
            borderColor:
              widthMode !== "normal"
                ? "var(--primary, #2563eb)"
                : "var(--color-outline-variant, #e2e8f0)",
            background:
              widthMode !== "normal"
                ? "var(--color-primary-container, #eff6ff)"
                : "transparent",
            cursor: "pointer",
            color:
              widthMode !== "normal"
                ? "var(--primary, #2563eb)"
                : "var(--color-outline, #64748b)",
            transition: "all 0.15s ease",
          }}
        >
          <span
            className="material-symbols-outlined icon-xs"
            style={{ fontSize: "16px" }}
          >
            {widthMeta.icon}
          </span>
        </button>
      )}
      {onCopyDoc && (
        <button
          id="btn-copy-doc-content"
          className="btn-icon-action"
          type="button"
          title="Copiar conteúdo completo do documento (Markdown)"
          onClick={onCopyDoc}
          style={{
            width: "28px",
            height: "28px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "6px",
            border: "1px solid var(--color-outline-variant, #e2e8f0)",
            background: "transparent",
            cursor: "pointer",
            color: "var(--color-outline, #64748b)",
            transition: "all 0.15s ease",
          }}
        >
          <span
            className="material-symbols-outlined icon-xs"
            style={{ fontSize: "16px" }}
          >
            content_copy
          </span>
        </button>
      )}

      {onExportDoc && (
        <button
          id="btn-export-doc"
          className="btn-icon-action"
          type="button"
          title="Exportar documento como arquivo .md"
          onClick={onExportDoc}
          style={{
            width: "28px",
            height: "28px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "6px",
            border: "1px solid var(--color-outline-variant, #e2e8f0)",
            background: "transparent",
            cursor: "pointer",
            color: "var(--color-outline, #64748b)",
            transition: "all 0.15s ease",
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>
      )}

      {onImportDoc && (
        <button
          id="btn-import-doc"
          className="btn-icon-action"
          type="button"
          title="Importar documento (.md ou colar)"
          onClick={onImportDoc}
          style={{
            width: "28px",
            height: "28px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "6px",
            border: "1px solid var(--color-outline-variant, #e2e8f0)",
            background: "transparent",
            cursor: "pointer",
            color: "var(--color-outline, #64748b)",
            transition: "all 0.15s ease",
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
        </button>
      )}

      {onToggleGitMode && (
        <button
          id="btn-toggle-git-mode"
          className={`btn-icon-action ${isGitMode ? "active" : ""}`}
          type="button"
          title={
            isGitMode
              ? "Voltar para Modo de Edição"
              : "Modo Comparativo & Auditoria (Diffs / Raw)"
          }
          onClick={onToggleGitMode}
          style={{
            width: "28px",
            height: "28px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "6px",
            border: "1px solid",
            borderColor: isGitMode
              ? "var(--primary, #2563eb)"
              : "var(--color-outline-variant, #e2e8f0)",
            background: isGitMode
              ? "var(--color-primary-container, #eff6ff)"
              : "transparent",
            cursor: "pointer",
            color: isGitMode
              ? "var(--primary, #2563eb)"
              : "var(--color-outline, #64748b)",
            transition: "all 0.15s ease",
          }}
        >
          <span
            className="material-symbols-outlined icon-xs"
            style={{ fontSize: "16px" }}
          >
            visibility
          </span>
        </button>
      )}

      {onToggleHistoryDrawer && (
        <button
          id="btn-toggle-history-drawer"
          className={`btn-icon-action ${isHistoryDrawerOpen ? "active" : ""}`}
          type="button"
          title="Linha do Tempo de Versões & Auditoria deste documento"
          onClick={onToggleHistoryDrawer}
          style={{
            width: "28px",
            height: "28px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "6px",
            border: "1px solid",
            borderColor: isHistoryDrawerOpen
              ? "var(--primary, #2563eb)"
              : "var(--color-outline-variant, #e2e8f0)",
            background: isHistoryDrawerOpen
              ? "var(--color-primary-container, #eff6ff)"
              : "transparent",
            cursor: "pointer",
            color: isHistoryDrawerOpen
              ? "var(--primary, #2563eb)"
              : "var(--color-outline, #64748b)",
            transition: "all 0.15s ease",
          }}
        >
          <span
            className="material-symbols-outlined icon-xs"
            style={{ fontSize: "16px" }}
          >
            history
          </span>
        </button>
      )}

      {onSave && !isGitMode && (
        <button
          id="btn-save-draft"
          className={`btn-icon-action ${
            saveStatus === "Salvando..."
              ? "is-saving"
              : saveStatus === "Salvo no disco"
                ? "saved-success"
                : saveStatus === "Erro" && isDirty
                  ? "has-error"
                  : isDirty
                    ? "has-unsaved"
                    : "is-synced"
          }`}
          type="button"
          title={
            saveStatus === "Salvando..."
              ? "Gravando alterações no disco da máquina..."
              : saveStatus === "Salvo no disco"
                ? "Salvo no disco com sucesso!"
                : saveStatus === "Erro" && isDirty
                  ? "Erro ao gravar no disco. Rascunho preservado."
                  : isDirty
                    ? "Salvar alterações no disco (Ctrl+S)"
                    : "Arquivo já sincronizado e salvo no disco (Ctrl+S)"
          }
          onClick={
            isDirty && saveStatus !== "Salvando..." ? () => onSave() : undefined
          }
          disabled={!isDirty || saveStatus === "Salvando..."}
          style={{
            height: "28px",
            width: "auto",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            padding: "0 6px",
            borderRadius: "6px",
            fontSize: "11.5px",
            cursor:
              !isDirty || saveStatus === "Salvando..."
                ? "not-allowed"
                : "pointer",
            border: "1px solid",
            borderColor:
              saveStatus === "Salvo no disco"
                ? "rgba(16, 185, 129, 0.4)"
                : saveStatus === "Erro" && isDirty
                  ? "rgba(239, 68, 68, 0.4)"
                  : isDirty
                    ? "rgba(37, 99, 235, 0.4)"
                    : "var(--color-outline-variant, #cbd5e1)",
            background:
              saveStatus === "Salvo no disco"
                ? "rgba(16, 185, 129, 0.08)"
                : saveStatus === "Erro" && isDirty
                  ? "rgba(239, 68, 68, 0.08)"
                  : isDirty
                    ? "var(--color-primary-container, #eff6ff)"
                    : "var(--color-surface-variant, rgba(0, 0, 0, 0.03))",
            color:
              saveStatus === "Salvo no disco"
                ? "#059669"
                : saveStatus === "Erro" && isDirty
                  ? "#dc2626"
                  : isDirty
                    ? "var(--color-primary, #2563eb)"
                    : "var(--color-outline, #94a3b8)",
            opacity: !isDirty && saveStatus !== "Salvo no disco" ? 0.65 : 1,
            transition: "all 0.15s ease",
          }}
        >
          {saveStatus === "Salvando..." ? (
            <span
              className="material-symbols-outlined icon-xs"
              style={{
                animation: "spin 1s linear infinite",
                fontSize: "15px",
                color: "var(--primary, #2563eb)",
                flexShrink: 0,
              }}
            >
              progress_activity
            </span>
          ) : saveStatus === "Salvo no disco" ? (
            <span
              className="material-symbols-outlined icon-xs"
              style={{ color: "#10b981", fontSize: "15px", flexShrink: 0 }}
            >
              check
            </span>
          ) : saveStatus === "Erro" && isDirty ? (
            <span
              className="material-symbols-outlined icon-xs"
              style={{ color: "#ef4444", fontSize: "15px", flexShrink: 0 }}
            >
              error
            </span>
          ) : (
            <span
              className="material-symbols-outlined icon-xs"
              style={{
                fontSize: "15px",
                flexShrink: 0,
                color: isDirty
                  ? "var(--color-primary, #2563eb)"
                  : "var(--color-outline, #94a3b8)",
              }}
            >
              save
            </span>
          )}
        </button>
      )}
    </div>
  );
};

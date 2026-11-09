import React from "react";

export interface EditorFooterProps {
  isGitMode: boolean;
  isTemplateMode?: boolean;
  customSaveStatus?: string;
  saveStatus: string;
  isDirty: boolean;
  wordCount: number;
  lineCount: number;
  onReload: () => void;
}

export const EditorFooter: React.FC<EditorFooterProps> = ({
  isGitMode,
  isTemplateMode = false,
  customSaveStatus,
  saveStatus,
  isDirty,
  wordCount,
  lineCount,
  onReload,
}) => {
  return (
    <footer className="editor-bottom-bar">
      <div
        className="editor-status-left"
        style={{ display: "flex", alignItems: "center", gap: "8px" }}
      >
        <span
          id="save-draft-status"
          className="status-indicator"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          {isGitMode ? (
            <span>Histórico & Auditoria Ativos</span>
          ) : isTemplateMode ? (
            <>
              <span
                className="material-symbols-outlined icon-xs"
                style={{ color: "#10b981" }}
              >
                bookmark
              </span>
              <span style={{ color: "#10b981" }}>
                {customSaveStatus || "Editor de Template"}
              </span>
            </>
          ) : saveStatus === "Salvando..." ? (
            <>
              <span
                className="material-symbols-outlined icon-xs"
                style={{
                  animation: "spin 1s linear infinite",
                  color: "var(--primary, #2563eb)",
                }}
              >
                progress_activity
              </span>
              <span>Salvando no disco...</span>
            </>
          ) : saveStatus === "Salvo no disco" ? (
            <>
              <span
                className="material-symbols-outlined icon-xs"
                style={{ color: "#10b981" }}
              >
                check_circle
              </span>
              <span style={{ color: "#10b981" }}>Salvo no disco</span>
            </>
          ) : saveStatus === "Erro" && isDirty ? (
            <>
              <span
                className="material-symbols-outlined icon-xs"
                style={{ color: "#ef4444" }}
              >
                error
              </span>
              <span style={{ color: "#ef4444" }}>Erro ao gravar</span>
            </>
          ) : (
            <>
              <span
                className="material-symbols-outlined icon-xs"
                style={{ color: "#10b981" }}
              >
                cloud_done
              </span>
              <span>Sincronizado</span>
            </>
          )}
        </span>
        <span className="status-divider">&bull;</span>
        <span id="doc-word-count">{wordCount} palavras</span>
        <span className="status-divider">&bull;</span>
        <span id="doc-line-count">{lineCount} linhas</span>
      </div>
      <div className="editor-status-right">
        <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
          Atalho: <code>Ctrl+S</code> / <code>Cmd+S</code>
        </span>
        <button
          id="btn-reload-doc"
          className="btn-icon-subtle"
          title="Recarregar do disco"
          onClick={onReload}
        >
          <span className="material-symbols-outlined icon-xs">refresh</span>
        </button>
      </div>
    </footer>
  );
};

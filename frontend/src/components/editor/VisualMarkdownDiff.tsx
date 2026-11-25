import React, { useState, useMemo } from "react";
import { marked } from "marked";
import { sanitizeHtml } from "../../utils/sanitize";
import { generateSideBySideMarkdownHtml } from "../../utils/rich-diff";
import {
  parseFrontmatter,
  type DocumentMetadata,
} from "../../services/frontmatter";
import { useTemplateStore } from "../../stores/templateStore";
import { useGovernanceStore } from "../../stores/governanceStore";

interface VisualMarkdownDiffProps {
  oldContent: string;
  newContent: string;
  oldTitle?: string;
  newTitle?: string;
  fileName?: string;
  hideHeader?: boolean;
  initialViewMode?: "split" | "lines" | "inline";
  blameData?: Array<{
    line: number;
    author: string;
    date: string;
    commit: string;
    content: string;
  }>;
  showAuthorship?: boolean;
  onRestoreOldVersion?: () => void;
  onClose?: () => void;
}

export const VisualMarkdownDiff: React.FC<VisualMarkdownDiffProps> = ({
  oldContent,
  newContent,
  oldTitle = "Versão Base",
  newTitle = "Rascunho Atual",
  fileName,
  hideHeader = true,
  blameData,
  showAuthorship = false,
  onRestoreOldVersion,
  onClose,
}) => {
  const [showMetadata, setShowMetadata] = useState<boolean | null>(null);
  const templates = useTemplateStore((s) => s.templates);
  const projectMetaOptions = useGovernanceStore((s) => s.projectMetaOptions);

  // Parse frontmatter metadata and extract the pure document body for both versions
  const oldParsed = useMemo(
    () => parseFrontmatter(oldContent || ""),
    [oldContent],
  );
  const newParsed = useMemo(
    () => parseFrontmatter(newContent || ""),
    [newContent],
  );

  const hasMetadata = oldParsed.hasFrontmatter || newParsed.hasFrontmatter;

  const oldBody = useMemo(
    () => (oldParsed.hasFrontmatter ? oldParsed.body : oldContent || ""),
    [oldParsed, oldContent],
  );
  const newBody = useMemo(
    () => (newParsed.hasFrontmatter ? newParsed.body : newContent || ""),
    [newParsed, newContent],
  );

  const isNewDocument = useMemo(() => {
    return (
      !oldBody.trim() &&
      !oldParsed.hasFrontmatter &&
      (Boolean(newBody.trim()) || newParsed.hasFrontmatter)
    );
  }, [oldBody, newBody, oldParsed, newParsed]);

  const isDeletedDocument = useMemo(() => {
    return (
      (Boolean(oldBody.trim()) || oldParsed.hasFrontmatter) &&
      !newBody.trim() &&
      !newParsed.hasFrontmatter
    );
  }, [oldBody, newBody, oldParsed, newParsed]);

  const hasBodyChanges = useMemo(() => {
    return oldBody.trim() !== newBody.trim();
  }, [oldBody, newBody]);

  const isMetaExpanded = showMetadata !== null ? showMetadata : !hasBodyChanges;

  const sideBySideHtml = useMemo(() => {
    if (isNewDocument || isDeletedDocument) {
      return { oldHtml: "", newHtml: "" };
    }
    return generateSideBySideMarkdownHtml(oldBody, newBody);
  }, [oldBody, newBody, isNewDocument, isDeletedDocument]);

  const renderedNewHtml = useMemo(() => {
    if (!newBody.trim()) return "";
    return marked.parse(newBody) as string;
  }, [newBody]);

  const renderedOldHtml = useMemo(() => {
    if (!oldBody.trim()) return "";
    return marked.parse(oldBody) as string;
  }, [oldBody]);

  // Render stylized metadata chips for frontmatter
  const renderMetadataPills = (
    currentMeta: DocumentMetadata,
    otherMeta: DocumentMetadata,
    side: "old" | "new",
  ) => {
    const keys = Array.from(
      new Set([
        ...Object.keys(currentMeta || {}),
        ...Object.keys(otherMeta || {}),
      ]),
    ).filter((k) => k !== "extra");

    if (keys.length === 0) {
      return (
        <span
          style={{
            color: "var(--color-outline, #64748b)",
            fontStyle: "italic",
            fontSize: "11px",
          }}
        >
          Sem metadados adicionais.
        </span>
      );
    }

    return keys.map((key) => {
      const curVal = (currentMeta as Record<string, unknown> | undefined)?.[key];
      const otherVal = (otherMeta as Record<string, unknown> | undefined)?.[key];
      let curStr =
        curVal !== undefined && curVal !== null
          ? typeof curVal === "object"
            ? JSON.stringify(curVal)
            : String(curVal)
          : "";
      let otherStr =
        otherVal !== undefined && otherVal !== null
          ? typeof otherVal === "object"
            ? JSON.stringify(otherVal)
            : String(otherVal)
          : "";

      let displayLabel = key;
      if (key === "templateId") {
        displayLabel = "template";
        const tplCur = templates?.find(
          (t) =>
            t.id === curStr || t.templateName === curStr || t.title === curStr,
        );
        if (tplCur?.title) curStr = tplCur.title;

        const tplOther = templates?.find(
          (t) =>
            t.id === otherStr ||
            t.templateName === otherStr ||
            t.title === otherStr,
        );
        if (tplOther?.title) otherStr = tplOther.title;
      }

      const isDiff = curStr !== otherStr;

      let customColor: string | null = null;
      if (curStr && curStr !== "<vazio>") {
        if (key === "categories" || key === "category") {
          const match = projectMetaOptions?.categories?.find((c) => {
            const name = typeof c === "object" ? c.name || c.label : c;
            return name?.toLowerCase() === curStr.toLowerCase();
          });
          if (typeof match === "object" && match?.color) customColor = match.color;
        } else if (key === "status") {
          const match = projectMetaOptions?.statuses?.find(
            (s) =>
              (s.name || s.key || s.label)?.toLowerCase() === curStr.toLowerCase(),
          );
          if (match?.color) customColor = match.color;
        } else if (key === "tags" || key === "tag") {
          const match = projectMetaOptions?.tags?.find((t) => {
            const name = typeof t === "object" ? t.name || t.label : t;
            return name?.toLowerCase() === curStr.toLowerCase();
          });
          if (typeof match === "object" && match?.color) customColor = match.color;
        } else if (key === "badge" || key === "badges") {
          const match = projectMetaOptions?.badges?.find((b) => {
            const name = typeof b === "object" ? b.name : b;
            return name?.toLowerCase() === curStr.toLowerCase();
          });
          if (typeof match === "object" && match?.color) customColor = match.color;
        }
      }

      const bg = isDiff
        ? side === "old"
          ? "rgba(239, 68, 68, 0.15)"
          : "rgba(34, 197, 94, 0.15)"
        : customColor
          ? `${customColor}18`
          : "var(--color-surface-container, #e2e8f0)";

      const color = isDiff
        ? side === "old"
          ? "#991b1b"
          : "#166534"
        : customColor || "var(--color-on-surface, #1e293b)";

      const border = isDiff
        ? side === "old"
          ? "1px solid rgba(239, 68, 68, 0.3)"
          : "1px solid rgba(34, 197, 94, 0.3)"
        : customColor
          ? `1px solid ${customColor}40`
          : "1px solid var(--color-border-subtle, #e2e8f0)";

      return (
        <div
          key={key}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            background: bg,
            color: color,
            border: border,
            padding: "2px 8px",
            borderRadius: "4px",
            fontSize: "11px",
            fontWeight: 500,
          }}
        >
          <span style={{ opacity: 0.7, fontWeight: 600 }}>{displayLabel}:</span>
          <span>{curStr || "<vazio>"}</span>
        </div>
      );
    });
  };

  return (
    <div
      className="visual-markdown-diff-container"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        background: "var(--color-surface, #ffffff)",
        overflow: "hidden",
      }}
    >
      {/* Action Bar (rendered when standalone or explicit actions exist) */}
      {((!hideHeader && fileName) || onRestoreOldVersion || onClose) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 16px",
            borderBottom: "1px solid var(--color-border-subtle, #e2e8f0)",
            background: "var(--color-surface-container-low, #f8fafc)",
            gap: "12px",
          }}
        >
          {fileName && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: "18px",
                  color: "var(--color-primary, #2563eb)",
                }}
              >
                description
              </span>
              <span>{fileName}</span>
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginLeft: "auto",
            }}
          >
            {onRestoreOldVersion && (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={onRestoreOldVersion}
                style={{ display: "flex", alignItems: "center", gap: "4px" }}
              >
                <span className="material-symbols-outlined icon-xs">
                  history_toggle_off
                </span>
                Restaurar
              </button>
            )}
            {onClose && (
              <button
                type="button"
                className="btn-icon-subtle"
                onClick={onClose}
                title="Fechar visualização"
              >
                <span className="material-symbols-outlined icon-sm">close</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Collapsible Metadata Bar (Frontmatter) */}
      {hasMetadata && (
        <div
          style={{
            padding: "8px 16px",
            background: "var(--color-surface-container-lowest, #ffffff)",
            borderBottom: hasBodyChanges
              ? "1px solid var(--color-border-subtle, #e2e8f0)"
              : "none",
          }}
        >
          <button
            type="button"
            onClick={() => setShowMetadata(!isMetaExpanded)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "transparent",
              border: "none",
              padding: "2px 0",
              cursor: "pointer",
              color: "var(--color-primary, #2563eb)",
              fontSize: "11.5px",
              fontWeight: 600,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "16px" }}
            >
              {isMetaExpanded ? "expand_less" : "expand_more"}
            </span>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "14px" }}
            >
              tune
            </span>
            <span>
              {isMetaExpanded ? "Ocultar Metadados" : "Mostrar Metadados"}
            </span>
          </button>

          {isMetaExpanded && (
            isNewDocument ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                  marginTop: "8px",
                  paddingTop: "8px",
                  borderTop: "1px dashed var(--color-border-subtle, #e2e8f0)",
                }}
              >
                {renderMetadataPills(newParsed.metadata, {}, "new")}
              </div>
            ) : isDeletedDocument ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                  marginTop: "8px",
                  paddingTop: "8px",
                  borderTop: "1px dashed var(--color-border-subtle, #e2e8f0)",
                }}
              >
                {renderMetadataPills(oldParsed.metadata, {}, "old")}
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px",
                  marginTop: "8px",
                  paddingTop: "8px",
                  borderTop: "1px dashed var(--color-border-subtle, #e2e8f0)",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {renderMetadataPills(
                    oldParsed.metadata,
                    newParsed.metadata,
                    "old",
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {renderMetadataPills(
                    newParsed.metadata,
                    oldParsed.metadata,
                    "new",
                  )}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Main Diff Render Canvas */}
      {isNewDocument ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            minHeight: "320px",
            width: "100%",
          }}
        >
          {/* Header Centralizado para Documento Novo */}
          <div
            style={{
              padding: "6px 20px",
              background: "var(--color-surface-container-low, #f8fafc)",
              borderBottom: "1px solid var(--color-border-subtle, #e2e8f0)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "16px", color: "#16a34a" }}
              >
                note_add
              </span>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: "12px",
                  color: "var(--color-on-surface, #1e293b)",
                }}
              >
                {newTitle || "Documento Novo"}
              </span>
            </div>
            <span
              style={{
                fontSize: "11px",
                color: "#166534",
                fontWeight: 600,
                background: "rgba(34, 197, 94, 0.12)",
                padding: "2px 8px",
                borderRadius: "12px",
                border: "1px solid rgba(34, 197, 94, 0.3)",
              }}
            >
              Documento Novo
            </span>
          </div>

          {/* Conteúdo Centralizado */}
          <div
            style={{
              padding: "24px 32px",
              overflowY: "auto",
              flex: 1,
              background: "var(--color-surface, #ffffff)",
            }}
          >
            <div
              className="notion-diff-canvas prose markdown-rendered"
              style={{
                maxWidth: "860px",
                margin: "0 auto",
                fontSize: "14.5px",
                lineHeight: 1.7,
                color: "var(--color-on-surface, #1e293b)",
              }}
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(renderedNewHtml),
              }}
            />
          </div>
        </div>
      ) : isDeletedDocument ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            minHeight: "320px",
            width: "100%",
          }}
        >
          {/* Header Centralizado para Documento Removido */}
          <div
            style={{
              padding: "6px 20px",
              background: "var(--color-surface-container-low, #f8fafc)",
              borderBottom: "1px solid var(--color-border-subtle, #e2e8f0)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "16px", color: "#dc2626" }}
              >
                delete
              </span>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: "12px",
                  color: "var(--color-on-surface, #1e293b)",
                }}
              >
                {oldTitle || "Documento Removido"}
              </span>
            </div>
            <span
              style={{
                fontSize: "11px",
                color: "#991b1b",
                fontWeight: 600,
                background: "rgba(239, 68, 68, 0.12)",
                padding: "2px 8px",
                borderRadius: "12px",
                border: "1px solid rgba(239, 68, 68, 0.3)",
              }}
            >
              Documento Removido
            </span>
          </div>

          <div
            style={{
              padding: "24px 32px",
              overflowY: "auto",
              flex: 1,
              background: "var(--color-surface, #ffffff)",
            }}
          >
            <div
              className="notion-diff-canvas prose markdown-rendered"
              style={{
                maxWidth: "860px",
                margin: "0 auto",
                fontSize: "14.5px",
                lineHeight: 1.7,
                color: "var(--color-on-surface, #1e293b)",
                opacity: 0.85,
              }}
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(renderedOldHtml),
              }}
            />
          </div>
        </div>
      ) : hasBodyChanges ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            minHeight: "320px",
            width: "100%",
          }}
        >
          {/* Left Column: Old Version (Base) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              borderRight: "1px solid var(--color-border-subtle, #e2e8f0)",
              minWidth: 0,
            }}
          >
            <div
              style={{
                padding: "6px 16px",
                background: "var(--color-surface-container-low, #f8fafc)",
                borderBottom: "1px solid var(--color-border-subtle, #e2e8f0)",
                color: "var(--color-on-surface-variant, #475569)",
                fontWeight: 600,
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "15px" }}
                >
                  history
                </span>
                <span>{oldTitle}</span>
              </div>
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--color-outline, #64748b)",
                }}
              >
                Base
              </span>
            </div>
            <div
              className="notion-diff-canvas prose markdown-rendered"
              style={{
                padding: "16px 20px",
                overflowY: "auto",
                flex: 1,
                fontSize: "14.5px",
                lineHeight: 1.7,
                color: "var(--color-on-surface, #1e293b)",
              }}
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(sideBySideHtml.oldHtml),
              }}
            />
          </div>

          {/* Right Column: New Version (Draft) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            <div
              style={{
                padding: "6px 16px",
                background: "var(--color-surface-container-low, #f8fafc)",
                borderBottom: "1px solid var(--color-border-subtle, #e2e8f0)",
                color: "var(--color-on-surface-variant, #475569)",
                fontWeight: 600,
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "15px", color: "#16a34a" }}
                >
                  edit_note
                </span>
                <span>{newTitle}</span>
              </div>
              <span
                style={{ fontSize: "11px", color: "#16a34a", fontWeight: 600 }}
              >
                Rascunho
              </span>
            </div>
            <div
              className="notion-diff-canvas prose markdown-rendered"
              style={{
                padding: "16px 20px",
                overflowY: "auto",
                flex: 1,
                fontSize: "14.5px",
                lineHeight: 1.7,
                color: "var(--color-on-surface, #1e293b)",
              }}
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(sideBySideHtml.newHtml),
              }}
            />
          </div>
        </div>
      ) : !hasMetadata ? (
        <div
          style={{
            padding: "24px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            color: "var(--color-outline, #64748b)",
            fontSize: "12.5px",
            background: "var(--color-surface-container-lowest, #ffffff)",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "18px", color: "#16a34a" }}
          >
            check_circle
          </span>
          <span>Nenhuma alteração detectada neste arquivo.</span>
        </div>
      ) : null}

      {/* Authorship & Contributors Overlay (if enabled) */}
      {showAuthorship && blameData && blameData.length > 0 && (
        <div
          style={{
            marginTop: "16px",
            borderTop: "1px solid var(--color-border-subtle, #e2e8f0)",
            padding: "12px 16px",
          }}
        >
          <h4
            style={{
              margin: "0 0 8px 0",
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--color-on-surface)",
            }}
          >
            Anotações de Autoria & Contribuidores
          </h4>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              maxHeight: "180px",
              overflowY: "auto",
              fontFamily: "var(--font-mono)",
              fontSize: "11.5px",
            }}
          >
            {blameData.map((b, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  background: "var(--color-surface-container-low, #f8fafc)",
                }}
              >
                <span
                  style={{ color: "var(--color-outline)", width: "32px" }}
                >
                  L{b.line}
                </span>
                <span
                  className="badge badge-neutral"
                  style={{ fontSize: "10.5px" }}
                >
                  #{b.commit.slice(0, 7)}
                </span>
                <strong
                  style={{
                    color: "var(--color-on-surface)",
                    minWidth: "110px",
                  }}
                >
                  {b.author}
                </strong>
                <span
                  style={{
                    color: "var(--color-outline)",
                    fontSize: "11px",
                    minWidth: "70px",
                  }}
                >
                  {b.date}
                </span>
                <span
                  style={{
                    color: "var(--color-on-surface-variant)",
                    flex: 1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {b.content}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

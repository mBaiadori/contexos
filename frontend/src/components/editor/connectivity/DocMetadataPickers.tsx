import React from "react";
import type { StatusItem, TaxonomyItem } from "../../../types";

const TAG_PALETTES: Record<
  string,
  { bg: string; color: string; border: string }
> = {
  rfc: {
    bg: "rgba(99, 102, 241, 0.12)",
    color: "#4f46e5",
    border: "rgba(99, 102, 241, 0.25)",
  },
  prd: {
    bg: "rgba(168, 85, 247, 0.12)",
    color: "#7e22ce",
    border: "rgba(168, 85, 247, 0.25)",
  },
  api: {
    bg: "rgba(14, 165, 233, 0.12)",
    color: "#0284c7",
    border: "rgba(14, 165, 233, 0.25)",
  },
  backend: {
    bg: "rgba(59, 130, 246, 0.12)",
    color: "#2563eb",
    border: "rgba(59, 130, 246, 0.25)",
  },
  frontend: {
    bg: "rgba(236, 72, 153, 0.12)",
    color: "#db2777",
    border: "rgba(236, 72, 153, 0.25)",
  },
  infra: {
    bg: "rgba(234, 88, 12, 0.12)",
    color: "#c2410c",
    border: "rgba(234, 88, 12, 0.25)",
  },
  sipoc: {
    bg: "rgba(20, 184, 166, 0.12)",
    color: "#0f766e",
    border: "rgba(20, 184, 166, 0.25)",
  },
  processos: {
    bg: "rgba(245, 158, 11, 0.12)",
    color: "#d97706",
    border: "rgba(245, 158, 11, 0.25)",
  },
  qualidade: {
    bg: "rgba(16, 185, 129, 0.12)",
    color: "#059669",
    border: "rgba(16, 185, 129, 0.25)",
  },
  security: {
    bg: "rgba(239, 68, 68, 0.12)",
    color: "#dc2626",
    border: "rgba(239, 68, 68, 0.25)",
  },
  database: {
    bg: "rgba(139, 92, 246, 0.12)",
    color: "#6d28d9",
    border: "rgba(139, 92, 246, 0.25)",
  },
};

export function getTagStyle(tagName: string, customColor?: string) {
  if (customColor && customColor !== "#3b82f6" && customColor !== "#6366f1") {
    return {
      background: `${customColor}15`,
      color: customColor,
      borderColor: `${customColor}35`,
    };
  }
  const normalized = tagName.toLowerCase().trim();
  if (TAG_PALETTES[normalized]) {
    return {
      background: TAG_PALETTES[normalized].bg,
      color: TAG_PALETTES[normalized].color,
      borderColor: TAG_PALETTES[normalized].border,
    };
  }
  let hash = 0;
  for (let i = 0; i < normalized.length; i++)
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  return {
    background: `hsla(${hue}, 70%, 50%, 0.1)`,
    color: `hsl(${hue}, 75%, 38%)`,
    borderColor: `hsla(${hue}, 70%, 50%, 0.25)`,
  };
}

export interface DocMetadataPickersProps {
  currentStatus: string;
  activeStatusObj: StatusItem | null | undefined;
  statusOptions: StatusItem[];
  showStatusPicker: boolean;
  setShowStatusPicker: (v: boolean) => void;
  onStatusChange: (status: string) => void;

  currentCategories: string;
  catColor: string;
  categoryOptions: TaxonomyItem[];
  showCategoryPicker: boolean;
  setShowCategoryPicker: (v: boolean) => void;
  customCategoryInput: string;
  setCustomCategoryInput: (v: string) => void;
  onCategoryChange: (cat: string) => void;

  currentTemplateId: string;
  activeTemplate: { id?: string; title?: string; name?: string; category?: string; [key: string]: unknown } | null | undefined;
  showTemplatePicker: boolean;
  setShowTemplatePicker: (v: boolean) => void;
  templateSearchInput: string;
  setTemplateSearchInput: (v: string) => void;
  filteredTemplates: Array<{ id: string; title?: string; name?: string; badge?: string; category?: string; templateName?: string }>;
  onTemplateChange: (tplId: string) => void;

  currentTags: string[];
  availableTags: TaxonomyItem[];
  showTagPicker: boolean;
  setShowTagPicker: (v: boolean) => void;
  newTagInput: string;
  setNewTagInput: (v: string) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;

  activeDept: { id: string; name: string; color?: string } | undefined;
  onCloseOtherPickers?: () => void;
}

export const DocMetadataPickers: React.FC<DocMetadataPickersProps> = ({
  currentStatus,
  activeStatusObj,
  statusOptions,
  showStatusPicker,
  setShowStatusPicker,
  onStatusChange,

  currentCategories,
  catColor,
  categoryOptions,
  showCategoryPicker,
  setShowCategoryPicker,
  customCategoryInput,
  setCustomCategoryInput,
  onCategoryChange,

  currentTemplateId,
  activeTemplate,
  showTemplatePicker,
  setShowTemplatePicker,
  templateSearchInput,
  setTemplateSearchInput,
  filteredTemplates,
  onTemplateChange,

  currentTags,
  availableTags,
  showTagPicker,
  setShowTagPicker,
  newTagInput,
  setNewTagInput,
  onAddTag,
  onRemoveTag,

  activeDept,
}) => {
  return (
    <>
      {/* 1. Status Badge & Popover */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => {
            setShowStatusPicker(!showStatusPicker);
          }}
          style={{
            fontSize: "11px",
            padding: "2.5px 8px",
            borderRadius: "4px",
            fontWeight: 600,
            backgroundColor: activeStatusObj
              ? `${activeStatusObj.color}18`
              : "var(--color-surface-container-high, #f1f5f9)",
            color: activeStatusObj
              ? activeStatusObj.color
              : "var(--color-outline, #64748b)",
            border: `1px solid ${
              activeStatusObj
                ? activeStatusObj.color + "40"
                : "var(--color-outline-variant, #cbd5e1)"
            }`,
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            cursor: "pointer",
            letterSpacing: "0.02em",
            transition: "all 0.15s ease",
          }}
          title="Clique para alterar o status do documento"
        >
          <span>{activeStatusObj ? activeStatusObj.label : "-"}</span>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "13px", opacity: 0.7 }}
          >
            expand_more
          </span>
        </button>

        {showStatusPicker && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 5px)",
              left: 0,
              background: "var(--color-surface, #ffffff)",
              border: "1px solid var(--color-outline-variant, #cbd5e1)",
              borderRadius: "8px",
              boxShadow:
                "0 10px 25px -5px rgba(0,0,0,0.14), 0 8px 10px -6px rgba(0,0,0,0.06)",
              padding: "6px",
              minWidth: "160px",
              zIndex: 120,
              display: "flex",
              flexDirection: "column",
              gap: "3px",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "var(--color-outline, #64748b)",
                padding: "4px 8px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Status do Documento
            </div>

            <button
              type="button"
              onClick={() => {
                onStatusChange("");
                setShowStatusPicker(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "5px 8px",
                borderRadius: "5px",
                border: "none",
                background: !currentStatus
                  ? "var(--color-surface-container, #f1f5f9)"
                  : "transparent",
                color: "var(--color-outline, #64748b)",
                cursor: "pointer",
                fontSize: "11.5px",
                textAlign: "left",
                width: "100%",
              }}
              className="dropdown-item-hover"
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#94a3b8",
                }}
              />
              <span>- (Sem status)</span>
            </button>

            {statusOptions.map((opt) => {
              const optKey = opt.key || opt.name || "";
              const optName = opt.name || opt.key || "";
              const isSelected =
                currentStatus.toLowerCase() === optName.toLowerCase() ||
                currentStatus.toLowerCase() === optKey.toLowerCase();
              return (
                <button
                  key={optKey || optName}
                  type="button"
                  onClick={() => {
                    onStatusChange(optKey || optName);
                    setShowStatusPicker(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "5px 8px",
                    borderRadius: "5px",
                    border: "none",
                    background: isSelected ? `${opt.color}15` : "transparent",
                    cursor: "pointer",
                    fontSize: "11.5px",
                    textAlign: "left",
                    width: "100%",
                  }}
                  className="dropdown-item-hover"
                >
                  <span
                    style={{
                      padding: "1.5px 6px",
                      borderRadius: "4px",
                      fontWeight: 600,
                      fontSize: "11px",
                      backgroundColor: `${opt.color}18`,
                      color: opt.color,
                      border: `1px solid ${opt.color}40`,
                    }}
                  >
                    {opt.label || optName.toUpperCase()}
                  </span>
                  {isSelected && (
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "14px", color: opt.color }}
                    >
                      check
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Categoria Badge & Popover */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => {
            setShowCategoryPicker(!showCategoryPicker);
          }}
          style={{
            fontSize: "11px",
            padding: "2.5px 8px",
            borderRadius: "4px",
            fontWeight: 500,
            backgroundColor: currentCategories
              ? `${catColor}18`
              : "var(--color-surface-container-high, #f1f5f9)",
            color: currentCategories
              ? catColor
              : "var(--color-outline, #64748b)",
            border: `1px solid ${
              currentCategories
                ? catColor + "40"
                : "var(--color-outline-variant, #cbd5e1)"
            }`,
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          title="Clique para alterar a categoria do documento"
        >
          <span>
            {currentCategories
              ? Array.isArray(currentCategories)
                ? currentCategories.join(", ")
                : currentCategories
              : "-"}
          </span>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "13px", opacity: 0.7 }}
          >
            expand_more
          </span>
        </button>

        {showCategoryPicker && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 5px)",
              left: 0,
              background: "var(--color-surface, #ffffff)",
              border: "1px solid var(--color-outline-variant, #cbd5e1)",
              borderRadius: "8px",
              boxShadow:
                "0 10px 25px -5px rgba(0,0,0,0.14), 0 8px 10px -6px rgba(0,0,0,0.06)",
              padding: "6px",
              minWidth: "170px",
              zIndex: 120,
              display: "flex",
              flexDirection: "column",
              gap: "3px",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "var(--color-outline, #64748b)",
                padding: "4px 8px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Categoria
            </div>

            <button
              type="button"
              onClick={() => {
                onCategoryChange("");
                setShowCategoryPicker(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "5px 8px",
                borderRadius: "5px",
                border: "none",
                background: !currentCategories
                  ? "var(--color-surface-container, #f1f5f9)"
                  : "transparent",
                color: "var(--color-outline, #64748b)",
                cursor: "pointer",
                fontSize: "11.5px",
                textAlign: "left",
                width: "100%",
              }}
              className="dropdown-item-hover"
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#94a3b8",
                }}
              />
              <span>- (Sem categoria)</span>
            </button>

            {categoryOptions.map((cat) => (
              <button
                key={cat.name}
                type="button"
                onClick={() => {
                  onCategoryChange(cat.name);
                  setShowCategoryPicker(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "5px 8px",
                  borderRadius: "5px",
                  border: "none",
                  background:
                    currentCategories.toLowerCase() === cat.name.toLowerCase()
                      ? `${cat.color}15`
                      : "transparent",
                  cursor: "pointer",
                  fontSize: "11.5px",
                  textAlign: "left",
                  width: "100%",
                }}
                className="dropdown-item-hover"
              >
                <span
                  style={{
                    padding: "1.5px 6px",
                    borderRadius: "4px",
                    fontWeight: 500,
                    fontSize: "11px",
                    backgroundColor: `${cat.color}18`,
                    color: cat.color,
                    border: `1px solid ${cat.color}40`,
                  }}
                >
                  {cat.name.toUpperCase()}
                </span>
                {currentCategories.toLowerCase() ===
                  cat.name.toLowerCase() && (
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "14px", color: cat.color }}
                  >
                    check
                  </span>
                )}
              </button>
            ))}

            {/* Input de categoria customizada */}
            <div
              style={{
                marginTop: "4px",
                borderTop: "1px solid var(--color-outline-variant, #f1f5f9)",
                paddingTop: "4px",
                display: "flex",
                gap: "4px",
              }}
            >
              <input
                type="text"
                placeholder="Outra..."
                value={customCategoryInput}
                onChange={(e) => setCustomCategoryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customCategoryInput.trim()) {
                    e.preventDefault();
                    onCategoryChange(customCategoryInput.trim());
                    setCustomCategoryInput("");
                    setShowCategoryPicker(false);
                  }
                }}
                style={{
                  fontSize: "11px",
                  padding: "3px 6px",
                  borderRadius: "4px",
                  border: "1px solid var(--color-outline-variant, #cbd5e1)",
                  flex: 1,
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (customCategoryInput.trim()) {
                    onCategoryChange(customCategoryInput.trim());
                    setCustomCategoryInput("");
                    setShowCategoryPicker(false);
                  }
                }}
                style={{
                  padding: "3px 6px",
                  borderRadius: "4px",
                  background: "var(--primary, #2563eb)",
                  color: "#fff",
                  border: "none",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2.5 Template Chip & Popover */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => {
            setShowTemplatePicker(!showTemplatePicker);
          }}
          style={{
            fontSize: "11px",
            padding: "2.5px 8px",
            borderRadius: "4px",
            fontWeight: 500,
            backgroundColor: currentTemplateId
              ? "rgba(99, 102, 241, 0.08)"
              : "transparent",
            color: currentTemplateId
              ? "#4f46e5"
              : "var(--color-outline, #64748b)",
            border: currentTemplateId
              ? "1px solid rgba(99, 102, 241, 0.3)"
              : "1px dashed var(--color-outline-variant, #cbd5e1)",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          title={
            currentTemplateId
              ? `Template: ${activeTemplate?.title || currentTemplateId} (Clique para alterar ou desvincular)`
              : "Clique para associar um template a este documento"
          }
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "13px", opacity: 0.85 }}
          >
            {currentTemplateId ? "description" : "add"}
          </span>
          <span>
            {currentTemplateId
              ? (activeTemplate?.title || currentTemplateId)
              : "Template"}
          </span>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "13px", opacity: 0.6 }}
          >
            expand_more
          </span>
        </button>

        {showTemplatePicker && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 5px)",
              left: 0,
              background: "var(--color-surface, #ffffff)",
              border: "1px solid var(--color-outline-variant, #cbd5e1)",
              borderRadius: "8px",
              boxShadow:
                "0 10px 25px -5px rgba(0,0,0,0.14), 0 8px 10px -6px rgba(0,0,0,0.06)",
              padding: "8px",
              minWidth: "240px",
              maxWidth: "300px",
              zIndex: 120,
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "var(--color-outline, #64748b)",
                padding: "2px 4px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>Associar Template</span>
              {currentTemplateId && (
                <span style={{ fontSize: "9px", color: "var(--color-primary, #4f46e5)" }}>
                  Vinculado
                </span>
              )}
            </div>

            {/* Input de busca rápida */}
            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Buscar template..."
                value={templateSearchInput}
                onChange={(e) => setTemplateSearchInput(e.target.value)}
                style={{
                  fontSize: "11px",
                  padding: "4px 8px 4px 24px",
                  borderRadius: "4px",
                  border: "1px solid var(--color-outline-variant, #cbd5e1)",
                  width: "100%",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                autoFocus
              />
              <span
                className="material-symbols-outlined"
                style={{
                  position: "absolute",
                  left: "6px",
                  top: "5px",
                  fontSize: "13px",
                  color: "var(--color-outline, #94a3b8)",
                  pointerEvents: "none",
                }}
              >
                search
              </span>
            </div>

            {/* Opção Desvincular / Nenhum */}
            <button
              type="button"
              onClick={() => onTemplateChange("")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "5px 8px",
                borderRadius: "5px",
                border: "none",
                background: !currentTemplateId
                  ? "var(--color-surface-container, #f1f5f9)"
                  : "transparent",
                color: "var(--color-outline, #64748b)",
                cursor: "pointer",
                fontSize: "11.5px",
                textAlign: "left",
                width: "100%",
              }}
              className="dropdown-item-hover"
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#94a3b8",
                }}
              />
              <span>- (Nenhum template vinculado)</span>
            </button>

            <div
              style={{
                maxHeight: "200px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
              }}
            >
              {filteredTemplates.length === 0 ? (
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--color-outline, #94a3b8)",
                    padding: "8px 4px",
                    textAlign: "center",
                  }}
                >
                  Nenhum template encontrado
                </div>
              ) : (
                filteredTemplates.map((tpl) => {
                  const isSelected =
                    currentTemplateId === tpl.id ||
                    currentTemplateId === tpl.templateName;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => onTemplateChange(tpl.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "5px 8px",
                        borderRadius: "5px",
                        border: "none",
                        background: isSelected
                          ? "rgba(99, 102, 241, 0.12)"
                          : "transparent",
                        cursor: "pointer",
                        fontSize: "11.5px",
                        textAlign: "left",
                        width: "100%",
                        gap: "6px",
                      }}
                      className="dropdown-item-hover"
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        <span
                          className="material-symbols-outlined"
                          style={{
                            fontSize: "14px",
                            color: isSelected
                              ? "#4f46e5"
                              : "var(--color-outline, #64748b)",
                          }}
                        >
                          description
                        </span>
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontWeight: isSelected ? 600 : 400,
                            color: isSelected
                              ? "#4f46e5"
                              : "var(--color-text-primary, #0f172a)",
                          }}
                          title={tpl.title}
                        >
                          {tpl.title}
                        </span>
                      </div>
                      {tpl.category && (
                        <span
                          style={{
                            fontSize: "9.5px",
                            padding: "1px 4px",
                            borderRadius: "3px",
                            background: "var(--color-surface-container-high, #f1f5f9)",
                            color: "var(--color-outline, #64748b)",
                            flexShrink: 0,
                          }}
                        >
                          {tpl.category}
                        </span>
                      )}
                      {isSelected && (
                        <span
                          className="material-symbols-outlined"
                          style={{
                            fontSize: "14px",
                            color: "#4f46e5",
                            flexShrink: 0,
                          }}
                        >
                          check
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Tags Chips & Popover */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          position: "relative",
        }}
      >
        {currentTags.map((tag) => {
          const tagOpt = availableTags.find(
            (t) => t.name.toLowerCase() === tag.toLowerCase(),
          );
          const style = getTagStyle(tag, tagOpt?.color);
          return (
            <span
              key={tag}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                fontSize: "10.5px",
                padding: "2px 6px",
                borderRadius: "10px",
                background: style.background,
                color: style.color,
                border: `1px solid ${style.borderColor}`,
                fontWeight: 600,
              }}
            >
              #{tag}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveTag(tag);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  color: "inherit",
                  opacity: 0.7,
                }}
                title={`Remover #${tag}`}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "11px" }}
                >
                  close
                </span>
              </button>
            </span>
          );
        })}

        {/* Botão + Tag */}
        <button
          type="button"
          onClick={() => {
            setShowTagPicker(!showTagPicker);
          }}
          style={{
            border: "1px dashed var(--color-outline-variant, #cbd5e1)",
            background: showTagPicker
              ? "var(--color-surface-container, #f1f5f9)"
              : "transparent",
            color: "var(--color-outline, #64748b)",
            borderRadius: "10px",
            fontSize: "10.5px",
            padding: "1.5px 6px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "2px",
            fontWeight: 500,
            transition: "all 0.15s ease",
          }}
          title="Adicionar ou selecionar tags"
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "12px" }}
          >
            add
          </span>
          <span>Tag</span>
        </button>

        {showTagPicker && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 5px)",
              left: 0,
              background: "var(--color-surface, #ffffff)",
              border: "1px solid var(--color-outline-variant, #cbd5e1)",
              borderRadius: "8px",
              boxShadow:
                "0 10px 25px -5px rgba(0,0,0,0.14), 0 8px 10px -6px rgba(0,0,0,0.06)",
              padding: "10px",
              minWidth: "220px",
              maxWidth: "280px",
              zIndex: 120,
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "var(--color-outline, #64748b)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Gerenciar Tags
            </div>

            {/* Input de nova tag */}
            <div style={{ display: "flex", gap: "4px" }}>
              <input
                type="text"
                placeholder="Nova tag..."
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTagInput.trim()) {
                    e.preventDefault();
                    onAddTag(newTagInput.trim());
                    setNewTagInput("");
                  }
                }}
                style={{
                  fontSize: "11px",
                  padding: "3px 6px",
                  borderRadius: "4px",
                  border: "1px solid var(--color-outline-variant, #cbd5e1)",
                  flex: 1,
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (newTagInput.trim()) {
                    onAddTag(newTagInput.trim());
                    setNewTagInput("");
                  }
                }}
                disabled={!newTagInput.trim()}
                style={{
                  padding: "3px 8px",
                  borderRadius: "4px",
                  background: "var(--primary, #2563eb)",
                  color: "#fff",
                  border: "none",
                  fontSize: "11px",
                  cursor: newTagInput.trim() ? "pointer" : "not-allowed",
                  opacity: newTagInput.trim() ? 1 : 0.6,
                }}
              >
                +
              </button>
            </div>

            {/* Sugestões do projeto */}
            {availableTags.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    color: "var(--color-outline, #64748b)",
                  }}
                >
                  Tags configuradas:
                </span>
                <div
                  style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}
                >
                  {availableTags.map((t) => {
                    const isSelected = currentTags.includes(
                      t.name.toLowerCase(),
                    );
                    const style = getTagStyle(t.name, t.color);
                    return (
                      <button
                        key={t.name}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            onRemoveTag(t.name.toLowerCase());
                          } else {
                            onAddTag(t.name);
                          }
                        }}
                        style={{
                          border: `1px solid ${
                            isSelected
                              ? style.borderColor
                              : "var(--color-outline-variant, #cbd5e1)"
                          }`,
                          background: isSelected
                            ? style.background
                            : "transparent",
                          color: isSelected
                            ? style.color
                            : "var(--color-outline, #64748b)",
                          borderRadius: "10px",
                          fontSize: "10px",
                          padding: "2px 6px",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "2px",
                          fontWeight: isSelected ? 600 : 400,
                        }}
                      >
                        {isSelected ? "✓" : "+"} #{t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Departamento Badge */}
      {activeDept && (
        <span
          style={{
            fontSize: "10.5px",
            padding: "2px 8px",
            borderRadius: "12px",
            backgroundColor: activeDept.color + "15",
            borderColor: activeDept.color + "40",
            borderWidth: "1px",
            borderStyle: "solid",
            color: activeDept.color,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
          title={`Departamento: ${activeDept.name}`}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "12px" }}
          >
            domain
          </span>
          {activeDept.name}
        </span>
      )}
    </>
  );
};

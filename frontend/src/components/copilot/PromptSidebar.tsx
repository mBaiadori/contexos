// =============================================================================
// COMPONENT: PROMPT SIDEBAR (HIERARQUIA & PARÂMETROS DA IA)
// Exibe com clareza as camadas de instrução:
// - Modo Documento: Prompt do Documento e Template Vinculado.
// =============================================================================

import React, { useState } from "react";
import { useAI } from "../../context/AIContext";
import { Button, IconButton } from "../ui";

interface PromptSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  systemPrompt?: string;
  defaultPrompt?: string;
  onSavePrompt?: (prompt: string) => void;
  onResetPrompt?: () => void;
  onOpenAIModal?: () => void;
  modelName?: string;
  agentName?: string;
}

export const PromptSidebar: React.FC<PromptSidebarProps> = ({
  isOpen,
  onClose,
  agentName = "Agent",
}) => {
  const {
    templatePrompt,
    templateTitle,
    templateId,
    isTemplatePromptEnabled,
    toggleTemplatePrompt,
    docPrompt,
    isDocPromptEnabled,
    toggleDocPrompt,
  } = useAI();

  const openPromptInEditor = () => {
    const tabBtn = document.getElementById("tab-mode-copilot-prompt");
    if (tabBtn) {
      tabBtn.click();
    }
  };

  // Mode specific tabs
  const [docTab, setDocTab] = useState<"doc_prompt" | "template_linked">(
    "doc_prompt",
  );

  if (!isOpen) return null;

  return (
    <aside
      className="ai-copilot-prompt-sidebar"
      style={{ display: "flex", width: "340px", flexDirection: "column" }}
    >
      {/* Header */}
      <div className="ai-prompt-sidebar-header">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            minWidth: 0,
          }}
        >
          <span
            className="material-symbols-outlined icon-sm"
            style={{ color: "var(--primary, #2563eb)", flexShrink: 0 }}
          >
            tune
          </span>
          <div
            style={{ display: "flex", flexDirection: "column", minWidth: 0 }}
          >
            <strong
              style={{
                fontSize: "13px",
                color: "var(--text-heading, #0f172a)",
                whiteSpace: "nowrap",
              }}
            >
              Instruções do Copilot
            </strong>
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-muted, #64748b)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Documento & Template &bull;{" "}
              <span className="ai-copilot-prompt-agent-tag">{agentName}</span>
            </span>
          </div>
        </div>
        <IconButton
          size="sm"
          variant="ghost"
          title="Fechar painel"
          onClick={onClose}
          icon={<span className="material-symbols-outlined icon-sm">close</span>}
        />
      </div>

      <div
        className="ai-prompt-sidebar-body"
        style={{
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          background: "#ffffff",
        }}
      >

        {/* MODO DOCUMENTO REGULAR */}
        <>
            {/* Tabs do Modo Documento */}
            <div
              style={{
                display: "flex",
                gap: "4px",
                background: "var(--bg-hover, #f1f5f9)",
                padding: "3px",
                borderRadius: "8px",
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                className={`notion-tab-btn ${docTab === "doc_prompt" ? "active" : ""}`}
                onClick={() => setDocTab("doc_prompt")}
                style={{
                  flex: 1,
                  padding: "5px 8px",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: docTab === "doc_prompt" ? 600 : 500,
                  background:
                    docTab === "doc_prompt" ? "#ffffff" : "transparent",
                  color:
                    docTab === "doc_prompt"
                      ? "var(--primary, #2563eb)"
                      : "var(--text-muted, #64748b)",
                  boxShadow:
                    docTab === "doc_prompt"
                      ? "0 1px 2px rgba(0,0,0,0.08)"
                      : "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                📄 Prompt do Documento
              </button>
              <button
                type="button"
                className={`notion-tab-btn ${docTab === "template_linked" ? "active" : ""}`}
                onClick={() => setDocTab("template_linked")}
                style={{
                  flex: 1,
                  padding: "5px 8px",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: docTab === "template_linked" ? 600 : 500,
                  background:
                    docTab === "template_linked" ? "#ffffff" : "transparent",
                  color:
                    docTab === "template_linked"
                      ? "var(--primary, #2563eb)"
                      : "var(--text-muted, #64748b)",
                  boxShadow:
                    docTab === "template_linked"
                      ? "0 1px 2px rgba(0,0,0,0.08)"
                      : "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                📋 Template Vinculado
              </button>
            </div>

            {/* Tab 1: Prompt do Documento */}
            {docTab === "doc_prompt" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  minHeight: 0,
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color, #e2e8f0)",
                    background: "var(--bg-hover, #f8fafc)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "6px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11.5px",
                        fontWeight: 600,
                        color: "var(--text-heading, #0f172a)",
                      }}
                    >
                      Instrução deste Documento:
                    </span>
                    {docPrompt ? (
                      <button
                        type="button"
                        onClick={toggleDocPrompt}
                        style={{
                          fontSize: "10.5px",
                          padding: "3px 10px",
                          borderRadius: "12px",
                          border: "1px solid",
                          background: isDocPromptEnabled
                            ? "#2563eb"
                            : "#ffffff",
                          color: isDocPromptEnabled ? "#ffffff" : "var(--text-muted, #64748b)",
                          borderColor: isDocPromptEnabled
                            ? "#1d4ed8"
                            : "var(--border-color, #cbd5e1)",
                          cursor: "pointer",
                          fontWeight: 600,
                          boxShadow: isDocPromptEnabled
                            ? "0 1px 3px rgba(37, 99, 235, 0.3)"
                            : "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: "12px" }}
                        >
                          {isDocPromptEnabled ? "check_circle" : "cancel"}
                        </span>
                        {isDocPromptEnabled ? "Ativo" : "Inativo"}
                      </button>
                    ) : (
                      <span
                        className="badge badge-neutral"
                        style={{ fontSize: "9px" }}
                      >
                        Não definido
                      </span>
                    )}
                  </div>
                  {docPrompt ? (
                    <>
                      <div
                        style={{
                          padding: "8px 10px",
                          borderRadius: "6px",
                          background: "#ffffff",
                          border: "1px solid var(--border-color, #cbd5e1)",
                          fontSize: "11px",
                          fontFamily: "var(--font-mono, monospace)",
                          whiteSpace: "pre-wrap",
                          maxHeight: "160px",
                          overflowY: "auto",
                        }}
                      >
                        {docPrompt}
                      </div>
                      <div style={{ marginTop: "8px", display: "flex", justifyContent: "flex-end" }}>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={openPromptInEditor}
                          icon={
                            <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                              edit_note
                            </span>
                          }
                        >
                          Editar no Editor
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div
                      style={{
                        padding: "12px 10px",
                        borderRadius: "6px",
                        background: "#ffffff",
                        border: "1px dashed var(--border-color, #cbd5e1)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "8px",
                        textAlign: "center",
                      }}
                    >
                      <span style={{ fontSize: "11.5px", color: "var(--text-muted, #64748b)" }}>
                        Nenhum prompt específico gravado neste documento.
                      </span>
                      <Button
                        size="xs"
                        variant="primary"
                        onClick={openPromptInEditor}
                        icon={
                          <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                            edit_note
                          </span>
                        }
                      >
                        Criar Prompt no Editor
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Template Vinculado */}
            {docTab === "template_linked" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  minHeight: 0,
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color, #e2e8f0)",
                    background: "var(--bg-hover, #f8fafc)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "6px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11.5px",
                        fontWeight: 600,
                        color: "var(--text-heading, #0f172a)",
                        maxWidth: "170px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: "inline-block",
                      }}
                      title={templateTitle || templateId || "Nenhum"}
                    >
                      Template: {templateTitle || templateId || "Nenhum"}
                    </span>
                    {templatePrompt && (
                      <button
                        type="button"
                        onClick={toggleTemplatePrompt}
                        style={{
                          fontSize: "10.5px",
                          padding: "3px 10px",
                          borderRadius: "12px",
                          border: "1px solid",
                          background: isTemplatePromptEnabled
                            ? "#10b981"
                            : "#ffffff",
                          color: isTemplatePromptEnabled
                            ? "#ffffff"
                            : "var(--text-muted, #64748b)",
                          borderColor: isTemplatePromptEnabled
                            ? "#059669"
                            : "var(--border-color, #cbd5e1)",
                          cursor: "pointer",
                          fontWeight: 600,
                          boxShadow: isTemplatePromptEnabled
                            ? "0 1px 3px rgba(16, 185, 129, 0.3)"
                            : "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: "12px" }}
                        >
                          {isTemplatePromptEnabled ? "check_circle" : "cancel"}
                        </span>
                        {isTemplatePromptEnabled ? "Ativo" : "Inativo"}
                      </button>
                    )}
                  </div>
                  <div
                    style={{
                      padding: "8px 10px",
                      borderRadius: "6px",
                      background: "#ffffff",
                      border: "1px solid var(--border-color, #cbd5e1)",
                      fontSize: "11px",
                      fontFamily: "var(--font-mono, monospace)",
                      whiteSpace: "pre-wrap",
                      maxHeight: "160px",
                      overflowY: "auto",
                    }}
                  >
                    {templatePrompt
                      ? templatePrompt
                      : "Este documento não possui template vinculado ou o template não possui prompt customizado."}
                  </div>
                </div>
              </div>
            )}
          </>
      </div>
    </aside>
  );
};

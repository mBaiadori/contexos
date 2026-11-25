import React from "react";
import { Button } from "../../../../components/ui";
import type { CustomToolItem } from "../../../../types";

interface CustomToolModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingCustomTool: Partial<CustomToolItem>;
  setEditingCustomTool: (val: Partial<CustomToolItem>) => void;
  customToolSchemaStr: string;
  setCustomToolSchemaStr: (val: string) => void;
  handleSaveCustomTool: (e: React.FormEvent) => Promise<void>;
  handleTestCustomToolDirect: () => Promise<void>;
  isTestingCustomTool: boolean;
  customToolTestArgs: string;
  setCustomToolTestArgs: (val: string) => void;
  customToolTestOutput: Record<string, unknown> | null;
}

export const CustomToolModal: React.FC<CustomToolModalProps> = ({
  isOpen,
  onClose,
  editingCustomTool,
  setEditingCustomTool,
  customToolSchemaStr,
  setCustomToolSchemaStr,
  handleSaveCustomTool,
  handleTestCustomToolDirect,
  isTestingCustomTool,
  customToolTestArgs,
  setCustomToolTestArgs,
  customToolTestOutput,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 1150,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "960px",
          maxHeight: "90vh",
          background: "var(--color-surface, #fff)",
          borderRadius: "14px",
          border: "1px solid var(--color-outline-variant, #e2e8f0)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-outline-variant, #e2e8f0)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--color-surface-container-low, #f8f9fa)",
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: 700,
                color: "var(--color-on-surface)",
              }}
            >
              {editingCustomTool.id
                ? `Editar Tool: ${editingCustomTool.name}`
                : "Nova Ferramenta Customizada (.tools/)"}
            </h3>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Configure esquemas de parâmetros e o código executor para
              capacitar o Copilot no projeto.
            </span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          <form id="custom-tool-form" onSubmit={handleSaveCustomTool}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
                marginBottom: "16px",
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Nome Técnico (snake_case) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: format_sql_query, jira_create_issue"
                  value={editingCustomTool.name || ""}
                  onChange={(e) =>
                    setEditingCustomTool({
                      ...editingCustomTool,
                      name: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    fontSize: "12px",
                    fontFamily: "monospace",
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px solid var(--color-outline-variant, #cbd5e1)",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Título Amigável
                </label>
                <input
                  type="text"
                  placeholder="ex: Formatador de Consultas SQL"
                  value={editingCustomTool.title || ""}
                  onChange={(e) =>
                    setEditingCustomTool({
                      ...editingCustomTool,
                      title: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    fontSize: "12px",
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px solid var(--color-outline-variant, #cbd5e1)",
                  }}
                />
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr",
                gap: "16px",
                marginBottom: "16px",
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Descrição para a IA (Quando e como usar) *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Explique detalhadamente o objetivo desta ferramenta para que o LLM saiba quando acioná-la..."
                  value={editingCustomTool.description || ""}
                  onChange={(e) =>
                    setEditingCustomTool({
                      ...editingCustomTool,
                      description: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    fontSize: "12px",
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px solid var(--color-outline-variant, #cbd5e1)",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Categoria
                </label>
                <select
                  value={editingCustomTool.category || "utility"}
                  onChange={(e) =>
                    setEditingCustomTool({
                      ...editingCustomTool,
                      category: e.target.value as CustomToolItem["category"],
                    })
                  }
                  style={{
                    width: "100%",
                    fontSize: "12px",
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px solid var(--color-outline-variant, #cbd5e1)",
                  }}
                >
                  <option value="utility">Utilitário (Utility)</option>
                  <option value="integration">Integração Externa</option>
                  <option value="domain">Lógica de Domínio</option>
                  <option value="validation">Validação / Lint</option>
                  <option value="general">Geral</option>
                </select>
              </div>
            </div>

            {/* Handler Type Tabs */}
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  display: "block",
                  marginBottom: "6px",
                }}
              >
                Tipo de Executor (Handler)
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                {[
                  {
                    id: "javascript",
                    label: "JavaScript (Node.js Sandbox)",
                  },
                  { id: "http", label: "Webhook / API HTTP" },
                  { id: "shell", label: "Comando Shell CLI" },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setEditingCustomTool({
                        ...editingCustomTool,
                        handler_type: t.id as CustomToolItem["handler_type"],
                      })
                    }
                    className={`store-filter-chip ${editingCustomTool.handler_type === t.id ? "active" : ""}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Handler Configuration Area */}
            {editingCustomTool.handler_type === "javascript" && (
              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "4px",
                  }}
                >
                  <label style={{ fontSize: "11px", fontWeight: 600 }}>
                    Código do Handler (JavaScript Assíncrono):
                  </label>
                  <span
                    style={{
                      fontSize: "10.5px",
                      color: "var(--text-muted)",
                    }}
                  >
                    args • context.repoName • utils.fetch • utils.readProjectFile
                  </span>
                </div>
                <textarea
                  rows={8}
                  value={editingCustomTool.handler_code || ""}
                  onChange={(e) =>
                    setEditingCustomTool({
                      ...editingCustomTool,
                      handler_code: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    fontSize: "12px",
                    fontFamily: "var(--font-mono, monospace)",
                    padding: "10px",
                    borderRadius: "8px",
                    background: "var(--color-surface-container-lowest, #1e1e1e)",
                    color: "#d4d4d4",
                    border: "1px solid var(--color-outline-variant, #333)",
                  }}
                />
              </div>
            )}

            {editingCustomTool.handler_type === "http" && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 3fr",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Método
                  </label>
                  <select
                    value={editingCustomTool.handler_config?.method || "POST"}
                    onChange={(e) =>
                      setEditingCustomTool({
                        ...editingCustomTool,
                        handler_config: {
                          ...editingCustomTool.handler_config,
                          method: e.target.value as NonNullable<CustomToolItem["handler_config"]>["method"],
                        },
                      })
                    }
                    style={{
                      width: "100%",
                      fontSize: "12px",
                      padding: "8px",
                      borderRadius: "6px",
                      border: "1px solid var(--color-outline-variant, #cbd5e1)",
                    }}
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
                <div>
                  <label
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    URL do Endpoint HTTP
                  </label>
                  <input
                    type="url"
                    placeholder="https://api.external.com/v1/webhook"
                    value={editingCustomTool.handler_config?.url || ""}
                    onChange={(e) =>
                      setEditingCustomTool({
                        ...editingCustomTool,
                        handler_config: {
                          ...editingCustomTool.handler_config,
                          url: e.target.value,
                        },
                      })
                    }
                    style={{
                      width: "100%",
                      fontSize: "12px",
                      padding: "8px",
                      borderRadius: "6px",
                      border: "1px solid var(--color-outline-variant, #cbd5e1)",
                    }}
                  />
                </div>
              </div>
            )}

            {editingCustomTool.handler_type === "shell" && (
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Comando Shell CLI (utilize {`{{param}}`} para substituição de argumentos)
                </label>
                <input
                  type="text"
                  placeholder="ex: npm run format -- {{file_path}}"
                  value={editingCustomTool.handler_config?.command || ""}
                  onChange={(e) =>
                    setEditingCustomTool({
                      ...editingCustomTool,
                      handler_config: {
                        ...editingCustomTool.handler_config,
                        command: e.target.value,
                      },
                    })
                  }
                  style={{
                    width: "100%",
                    fontSize: "12px",
                    fontFamily: "monospace",
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px solid var(--color-outline-variant, #cbd5e1)",
                  }}
                />
              </div>
            )}

            {/* Schema Parameters JSON */}
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "4px",
                }}
              >
                <label style={{ fontSize: "11px", fontWeight: 600 }}>
                  Esquema de Parâmetros JSON (Schema):
                </label>
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
                  Define o contrato consumido pelo Gemini / OpenAI / Anthropic
                </span>
              </div>
              <textarea
                rows={5}
                value={customToolSchemaStr}
                onChange={(e) => setCustomToolSchemaStr(e.target.value)}
                style={{
                  width: "100%",
                  fontSize: "11.5px",
                  fontFamily: "var(--font-mono, monospace)",
                  padding: "8px",
                  borderRadius: "6px",
                  border: "1px solid var(--color-outline-variant, #cbd5e1)",
                  background: "var(--color-surface-container-low, #f8f9fa)",
                }}
              />
            </div>

            {/* Live Test Console inside Modal */}
            <div
              style={{
                border: "1px solid var(--color-outline-variant, #e2e8f0)",
                borderRadius: "8px",
                padding: "12px",
                background: "var(--color-surface-container-lowest, #f8f9fa)",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <span style={{ fontSize: "12px", fontWeight: 700 }}>
                  🧪 Teste Rápido em Sandbox
                </span>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleTestCustomToolDirect}
                  disabled={isTestingCustomTool}
                  style={{ fontSize: "11px" }}
                >
                  {isTestingCustomTool
                    ? "Executando..."
                    : "Executar Teste Agora"}
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: "10.5px",
                      fontWeight: 600,
                      display: "block",
                      marginBottom: "2px",
                    }}
                  >
                    Argumentos de Teste (JSON):
                  </label>
                  <textarea
                    rows={3}
                    value={customToolTestArgs}
                    onChange={(e) => setCustomToolTestArgs(e.target.value)}
                    style={{
                      width: "100%",
                      fontSize: "11px",
                      fontFamily: "monospace",
                      padding: "6px",
                      borderRadius: "4px",
                      border: "1px solid #cbd5e1",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: "10.5px",
                      fontWeight: 600,
                      display: "block",
                      marginBottom: "2px",
                    }}
                  >
                    Retorno da Execução:
                  </label>
                  <pre
                    style={{
                      fontSize: "10.5px",
                      fontFamily: "monospace",
                      padding: "6px",
                      borderRadius: "4px",
                      background: "#fff",
                      border: "1px solid #cbd5e1",
                      maxHeight: "68px",
                      overflowY: "auto",
                      margin: 0,
                    }}
                  >
                    {customToolTestOutput
                      ? JSON.stringify(customToolTestOutput, null, 2)
                      : "Aguardando execução..."}
                  </pre>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--color-outline-variant, #e2e8f0)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            background: "var(--color-surface-container-low, #f8f9fa)",
          }}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="custom-tool-form"
            variant="primary"
            size="sm"
            icon={
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                save
              </span>
            }
          >
            Salvar Ferramenta no Projeto
          </Button>
        </div>
      </div>
    </div>
  );
};

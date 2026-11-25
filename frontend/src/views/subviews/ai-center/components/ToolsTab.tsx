import React from "react";
import { FilterChips } from "../../../../components/ui";
import { type ScopeFilter, type MainTab } from "../types";
import { renderOriginBadge } from "../utils/renderOriginBadge";
import type {
  ToolItem,
  CustomToolItem,
  CommunityToolItem,
  MCPServerDefinition,
} from "../../../../types";

interface ToolsTabProps {
  toolScope: ScopeFilter;
  setToolScope: (val: ScopeFilter) => void;
  customTools: CustomToolItem[];
  toolsList: ToolItem[];
  communityTools: CommunityToolItem[];
  handleOpenCreateCustomTool: () => void;
  handleOpenEditCustomTool: (tool: CustomToolItem) => void;
  handleDeleteCustomTool: (toolId: string) => Promise<void>;
  setTestingTool: (tool: ToolItem | null) => void;
  setToolArgsInput: (val: string) => void;
  setToolTestResult: (val: Record<string, unknown> | null) => void;
  communityToolCategory: string;
  setCommunityToolCategory: (val: string) => void;
  communityToolSearch: string;
  setCommunityToolSearch: (val: string) => void;
  setSelectedCommunityTool: (tool: CommunityToolItem | null) => void;
  projectMcpServers: MCPServerDefinition[];
  mcpTemplates: MCPServerDefinition[];
  handleSaveMcpFromTemplate: (tpl: MCPServerDefinition) => Promise<void>;
  setActiveMainTab: (tab: MainTab) => void;
}

export const ToolsTab: React.FC<ToolsTabProps> = ({
  toolScope,
  setToolScope,
  customTools,
  toolsList,
  communityTools,
  handleOpenCreateCustomTool,
  handleOpenEditCustomTool,
  handleDeleteCustomTool,
  setTestingTool,
  setToolArgsInput,
  setToolTestResult,
  communityToolCategory,
  setCommunityToolCategory,
  communityToolSearch,
  setCommunityToolSearch,
  setSelectedCommunityTool,
  projectMcpServers,
  mcpTemplates,
  handleSaveMcpFromTemplate,
  setActiveMainTab,
}) => {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <FilterChips
          items={[
            { id: "installed", label: "Instaladas", count: customTools.length },
            { id: "system", label: "Sistema", count: toolsList.length },
            { id: "community", label: "Comunidade", count: communityTools.length },
          ]}
          activeId={toolScope}
          onChange={(s) => setToolScope(s as ScopeFilter)}
          size="sm"
        />

        {toolScope === "installed" && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleOpenCreateCustomTool}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span className="material-symbols-outlined icon-xs">add</span>
            Nova Ferramenta Customizada
          </button>
        )}
      </div>

      {/* Scope 1: Installed Project Custom Tools */}
      {toolScope === "installed" && (
        <div>
          {customTools.length === 0 ? (
            <div
              style={{
                padding: "36px 20px",
                background: "var(--color-surface-container-low, #f8f9fa)",
                borderRadius: "12px",
                border: "1px dashed var(--color-outline-variant, #e2e8f0)",
                textAlign: "center",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: "36px",
                  color: "var(--text-muted)",
                  opacity: 0.6,
                }}
              >
                extension
              </span>
              <h4
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  margin: "8px 0 4px 0",
                  color: "var(--color-on-surface)",
                }}
              >
                Nenhuma ferramenta customizada criada no projeto
              </h4>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  maxWidth: "480px",
                  margin: "0 auto 16px auto",
                }}
              >
                Crie ferramentas personalizadas em JavaScript (sandbox),
                Webhooks HTTP ou Comandos Shell para permitir que o
                Copilot e seus agentes executem ações avançadas no
                projeto.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleOpenCreateCustomTool}
              >
                <span className="material-symbols-outlined icon-xs">
                  add
                </span>
                Criar Primeira Ferramenta
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: "16px",
              }}
            >
              {customTools.map((tool) => (
                <div
                  key={tool.id || tool.name}
                  className="template-card"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    background: "var(--color-surface-container-low, #f8f9fa)",
                    border: "1px solid var(--color-outline-variant, #e2e8f0)",
                    borderRadius: "12px",
                    padding: "16px",
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
                        fontSize: "13px",
                        fontWeight: 700,
                        fontFamily: "monospace",
                        color: "var(--color-primary, #1a73e8)",
                      }}
                    >
                      {tool.name}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      {renderOriginBadge("project")}
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          textTransform: "uppercase",
                          background:
                            tool.handler_type === "javascript"
                              ? "rgba(245, 158, 11, 0.15)"
                              : tool.handler_type === "http"
                                ? "rgba(16, 185, 129, 0.15)"
                                : "rgba(139, 92, 246, 0.15)",
                          color:
                            tool.handler_type === "javascript"
                              ? "#b45309"
                              : tool.handler_type === "http"
                                ? "#047857"
                                : "#6d28d9",
                        }}
                      >
                        {tool.handler_type}
                      </span>
                    </div>
                  </div>

                  <h4
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      margin: "0 0 4px 0",
                      color: "var(--color-on-surface)",
                    }}
                  >
                    {tool.title || tool.name}
                  </h4>

                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      lineHeight: "1.4",
                      flex: 1,
                      margin: "0 0 12px 0",
                    }}
                  >
                    {tool.description}
                  </p>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingTop: "10px",
                      borderTop: "1px solid var(--color-outline-variant, #e2e8f0)",
                    }}
                  >
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleOpenEditCustomTool(tool)}
                        style={{ fontSize: "11px", padding: "4px 8px" }}
                      >
                        <span className="material-symbols-outlined icon-xs">
                          edit
                        </span>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          handleDeleteCustomTool(tool.id || tool.name)
                        }
                        style={{
                          color: "var(--color-error, #d93025)",
                          fontSize: "11px",
                          padding: "4px 8px",
                        }}
                      >
                        Excluir
                      </button>
                    </div>

                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleOpenEditCustomTool(tool)}
                      style={{
                        fontSize: "11px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <span className="material-symbols-outlined icon-xs">
                        play_arrow
                      </span>
                      Testar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scope 2: Native System Tools */}
      {toolScope === "system" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "16px",
          }}
        >
          {toolsList.map((tool) => (
            <div
              key={tool.name}
              className="template-card"
              style={{
                display: "flex",
                flexDirection: "column",
                background: "var(--color-surface-container-low, #f8f9fa)",
                border: "1px solid var(--color-outline-variant, #e2e8f0)",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                }}
              >
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    fontFamily: "monospace",
                    color: "var(--color-primary, #1a73e8)",
                  }}
                >
                  {tool.name}
                </span>
                {renderOriginBadge("system")}
              </div>

              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  lineHeight: "1.4",
                  flex: 1,
                  margin: "0 0 12px 0",
                }}
              >
                {tool.description}
              </p>

              <div
                style={{
                  paddingTop: "10px",
                  borderTop: "1px solid var(--color-outline-variant, #e2e8f0)",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setTestingTool(tool);
                    setToolArgsInput(
                      JSON.stringify(
                        tool.parameters?.properties
                          ? Object.keys(tool.parameters.properties).reduce(
                              (acc: Record<string, string>, k) => {
                                acc[k] = "";
                                return acc;
                              },
                              {},
                            )
                          : {},
                        null,
                        2,
                      ),
                    );
                    setToolTestResult(null);
                  }}
                  style={{
                    fontSize: "11px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <span className="material-symbols-outlined icon-xs">
                    play_arrow
                  </span>
                  Testar Tool
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Scope 3: Community Tools (ECC-main & MCP Connectors) */}
      {toolScope === "community" && (
        <div>
          {/* Search & Category Filter */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "4px",
              }}
            >
              {[
                { id: "all", label: "Todas" },
                { id: "integration", label: "Integração & MCP" },
                { id: "search", label: "Busca & Web" },
                { id: "memory", label: "Memória & Grafos" },
                { id: "devops", label: "DevOps & Cloud" },
                { id: "quality", label: "Qualidade & Testes" },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCommunityToolCategory(cat.id)}
                  className={`store-filter-chip ${communityToolCategory === cat.id ? "active" : ""}`}
                  style={{ fontSize: "11px", padding: "3px 10px" }}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="Filtrar ferramentas da comunidade..."
              value={communityToolSearch}
              onChange={(e) => setCommunityToolSearch(e.target.value)}
              style={{
                fontSize: "12px",
                padding: "5px 12px",
                borderRadius: "16px",
                border: "1px solid var(--color-outline-variant, #cbd5e1)",
                background: "var(--color-surface, #ffffff)",
                color: "var(--color-on-surface, #202124)",
                width: "240px",
              }}
            />
          </div>

          {/* Community Tools Grid */}
          {(() => {
            const filtered = communityTools.filter((t) => {
              const matchesCat =
                communityToolCategory === "all" ||
                t.category?.toLowerCase() === communityToolCategory.toLowerCase();
              const q = communityToolSearch.toLowerCase();
              const matchesSearch =
                !q ||
                t.name.toLowerCase().includes(q) ||
                t.title.toLowerCase().includes(q) ||
                t.description.toLowerCase().includes(q) ||
                (t.server_name && t.server_name.toLowerCase().includes(q));
              return matchesCat && matchesSearch;
            });

            if (filtered.length === 0) {
              return (
                <div
                  style={{
                    padding: "48px 24px",
                    background: "var(--color-surface-container-low, #f8f9fa)",
                    borderRadius: "12px",
                    border: "1px dashed var(--color-outline-variant, #e2e8f0)",
                    textAlign: "center",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: "40px",
                      color: "var(--text-muted)",
                      opacity: 0.6,
                      marginBottom: "8px",
                      display: "block",
                    }}
                  >
                    build_circle
                  </span>
                  <h4
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      margin: "0 0 6px 0",
                      color: "var(--color-on-surface)",
                    }}
                  >
                    Nenhuma ferramenta encontrada
                  </h4>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      maxWidth: "420px",
                      margin: "0 auto",
                    }}
                  >
                    Tente ajustar o termo de busca ou a categoria selecionada.
                  </p>
                </div>
              );
            }

            return (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                  gap: "16px",
                }}
              >
                {filtered.map((tool) => {
                  const isMcpConfigured = tool.server_id
                    ? projectMcpServers.some((s) => s.id === tool.server_id)
                    : false;

                  return (
                    <div
                      key={tool.id || tool.name}
                      className="template-card"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        background: "var(--color-surface-container-low, #f8f9fa)",
                        border: "1px solid var(--color-outline-variant, #e2e8f0)",
                        borderRadius: "12px",
                        padding: "16px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "8px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "13px",
                            fontWeight: 700,
                            fontFamily: "monospace",
                            color: "var(--color-primary, #1a73e8)",
                          }}
                        >
                          {tool.name}
                        </span>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          {renderOriginBadge("community")}
                        </div>
                      </div>

                      {tool.server_name && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            marginBottom: "6px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 600,
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: "rgba(26, 115, 232, 0.08)",
                              color: "var(--color-primary, #1a73e8)",
                              border: "1px solid rgba(26, 115, 232, 0.2)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3px",
                            }}
                          >
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: "11px" }}
                            >
                              cable
                            </span>
                            {tool.server_name}
                          </span>
                          {isMcpConfigured && (
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: 600,
                                padding: "2px 6px",
                                borderRadius: "4px",
                                background: "rgba(16, 185, 129, 0.12)",
                                color: "#10b981",
                              }}
                            >
                              Ativo
                            </span>
                          )}
                        </div>
                      )}

                      <h4
                        style={{
                          fontSize: "14px",
                          fontWeight: 600,
                          margin: "0 0 4px 0",
                          color: "var(--color-on-surface)",
                        }}
                      >
                        {tool.title || tool.name}
                      </h4>

                      <p
                        style={{
                          fontSize: "12px",
                          color: "var(--text-muted)",
                          lineHeight: "1.4",
                          flex: 1,
                          margin: "0 0 12px 0",
                        }}
                      >
                        {tool.description}
                      </p>

                      <div
                        style={{
                          paddingTop: "10px",
                          borderTop: "1px solid var(--color-outline-variant, #e2e8f0)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "6px",
                        }}
                      >
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setSelectedCommunityTool(tool)}
                          style={{
                            fontSize: "11px",
                            padding: "4px 8px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <span className="material-symbols-outlined icon-xs">
                            info
                          </span>
                          Parâmetros
                        </button>

                        {tool.server_id && (
                          <button
                            type="button"
                            className={`btn btn-sm ${isMcpConfigured ? "btn-secondary" : "btn-primary"}`}
                            onClick={() => {
                              const matchingTpl = mcpTemplates.find(
                                (t) => t.id === tool.server_id,
                              );
                              if (matchingTpl) {
                                handleSaveMcpFromTemplate(matchingTpl);
                              } else {
                                setActiveMainTab("mcp");
                              }
                            }}
                            style={{
                              fontSize: "11px",
                              padding: "4px 10px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <span className="material-symbols-outlined icon-xs">
                              {isMcpConfigured ? "check" : "add_link"}
                            </span>
                            {isMcpConfigured ? "Conectado" : "Conectar MCP"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

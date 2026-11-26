import React from "react";
import { Button, Drawer } from "../../../../components/ui";
import { type MainTab } from "../types";
import { renderOriginBadge } from "../utils/renderOriginBadge";
import type { CommunityToolItem, MCPServerDefinition } from "../../../../types";

interface CommunityToolDrawerProps {
  selectedCommunityTool: CommunityToolItem | null;
  onClose: () => void;
  mcpTemplates: MCPServerDefinition[];
  handleSaveMcpFromTemplate: (tpl: MCPServerDefinition) => Promise<void>;
  setActiveMainTab: (tab: MainTab) => void;
}

export const CommunityToolDrawer: React.FC<CommunityToolDrawerProps> = ({
  selectedCommunityTool,
  onClose,
  mcpTemplates,
  handleSaveMcpFromTemplate,
  setActiveMainTab,
}) => {
  if (!selectedCommunityTool) return null;

  return (
    <Drawer
      isOpen={Boolean(selectedCommunityTool)}
      onClose={onClose}
      title={selectedCommunityTool.title || selectedCommunityTool.name}
      subtitle={
        <span
          style={{
            fontSize: "11px",
            color: "var(--color-primary, #1a73e8)",
            fontFamily: "monospace",
          }}
        >
          tool: {selectedCommunityTool.name}
        </span>
      }
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
          >
            Fechar
          </Button>
          {selectedCommunityTool.server_id && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                const matchingTpl = mcpTemplates.find(
                  (t) => t.id === selectedCommunityTool.server_id,
                );
                if (matchingTpl) {
                  handleSaveMcpFromTemplate(matchingTpl);
                }
                onClose();
                setActiveMainTab("mcp");
              }}
            >
              Configurar Conector MCP
            </Button>
          )}
        </div>
      }
    >
      <div>
          <div style={{ marginBottom: "16px" }}>
            <h4
              style={{
                fontSize: "12px",
                fontWeight: 700,
                textTransform: "uppercase",
                color: "var(--text-muted)",
                marginBottom: "6px",
              }}
            >
              Origem & Servidor MCP
            </h4>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              {renderOriginBadge(selectedCommunityTool.source)}
              {selectedCommunityTool.server_name && (
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "4px",
                    background: "rgba(26, 115, 232, 0.1)",
                    color: "var(--color-primary, #1a73e8)",
                  }}
                >
                  Servidor: {selectedCommunityTool.server_name}
                </span>
              )}
            </div>
          </div>

          <h4
            style={{
              fontSize: "12px",
              fontWeight: 700,
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginBottom: "6px",
            }}
          >
            Descrição
          </h4>
          <p
            style={{
              fontSize: "13px",
              lineHeight: "1.5",
              margin: "0 0 16px 0",
            }}
          >
            {selectedCommunityTool.description}
          </p>

          {selectedCommunityTool.command_snippet && (
            <div style={{ marginBottom: "16px" }}>
              <h4
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                  marginBottom: "6px",
                }}
              >
                Comando / Conexão MCP
              </h4>
              <pre
                style={{
                  fontSize: "11.5px",
                  fontFamily: "var(--font-mono, monospace)",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "var(--color-surface-container-low, #f8f9fa)",
                  border: "1px solid var(--color-outline-variant, #e2e8f0)",
                  overflowX: "auto",
                }}
              >
                {selectedCommunityTool.command_snippet}
              </pre>
            </div>
          )}

          <div>
            <h4
              style={{
                fontSize: "12px",
                fontWeight: 700,
                textTransform: "uppercase",
                color: "var(--text-muted)",
                marginBottom: "6px",
              }}
            >
              Esquema de Parâmetros (JSON Schema)
            </h4>
            <pre
              style={{
                fontSize: "11.5px",
                lineHeight: "1.45",
                fontFamily: "var(--font-mono, monospace)",
                padding: "12px",
                borderRadius: "8px",
                background: "var(--color-surface-container-low, #f8f9fa)",
                border: "1px solid var(--color-outline-variant, #e2e8f0)",
                whiteSpace: "pre-wrap",
                overflowX: "auto",
                maxHeight: "260px",
              }}
            >
              {JSON.stringify(
                selectedCommunityTool.parameters || {},
                null,
                2,
              )}
            </pre>
          </div>
        </div>
    </Drawer>
  );
};

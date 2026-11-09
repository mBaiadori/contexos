import React from "react";
import { Sparkles, Bot, Wrench, Cable } from "lucide-react";
import { Tabs } from "../../../../components/ui";
import type { MainTab } from "../types";

interface AICenterHeaderProps {
  activeRepoName?: string;
  loadAllData: () => void;
  loading: boolean;
  actionFeedback: { ok: boolean; msg: string } | null;
  activeMainTab: MainTab;
  setActiveMainTab: (tab: MainTab) => void;
  installedSkillsCount: number;
  installedAgentsCount: number;
  toolsCount: number;
  projectMcpServersCount: number;
}

export const AICenterHeader: React.FC<AICenterHeaderProps> = ({
  activeRepoName,
  loadAllData,
  loading,
  actionFeedback,
  activeMainTab,
  setActiveMainTab,
  installedSkillsCount,
  installedAgentsCount,
  toolsCount,
  projectMcpServersCount,
}) => {
  return (
    <div className="template-store-header" style={{ marginBottom: "16px" }}>
      <div
        className="templates-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "12px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h2
              style={{
                fontSize: "22px",
                fontWeight: 700,
                margin: 0,
                color: "var(--color-on-surface, var(--text-main))",
              }}
            >
              AI Center • Central de Inteligência
            </h2>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "12px",
                background: "var(--color-primary-container, #d2e3fc)",
                color: "var(--color-on-primary-container, #041e49)",
                border: "1px solid var(--color-primary, #1a73e8)",
              }}
            >
              Contexos & Hub Global
            </span>
          </div>
          <p
            className="subtitle"
            style={{
              fontSize: "13px",
              color: "var(--text-muted)",
              marginTop: "4px",
              marginBottom: 0,
            }}
          >
            Gestão integrada de Skills, Personas Autônomas, Ferramentas
            Nativas e Servidores MCP (
            {activeRepoName ? `projects/${activeRepoName}` : "Workspace"}).
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            id="btn-refresh-aicenter"
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={loadAllData}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span className="material-symbols-outlined icon-xs">refresh</span>
            Sincronizar
          </button>
        </div>
      </div>

      {/* Loading Indicator */}
      {loading && (
        <div
          style={{
            padding: "6px 12px",
            marginBottom: "12px",
            borderRadius: "6px",
            fontSize: "11px",
            background: "var(--color-surface-container-low, #f8f9fa)",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span className="material-symbols-outlined icon-xs">sync</span>
          Carregando dados do AI Center...
        </div>
      )}

      {/* Feedback Alert */}
      {actionFeedback && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "8px",
            marginBottom: "14px",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: actionFeedback.ok
              ? "var(--color-primary-container, rgba(26, 115, 232, 0.12))"
              : "var(--color-error-container, rgba(217, 48, 37, 0.12))",
            color: actionFeedback.ok
              ? "var(--color-on-primary-container, #1a73e8)"
              : "var(--color-on-error-container, #d93025)",
            border: "1px solid var(--color-outline-variant, #e2e8f0)",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "16px" }}
          >
            {actionFeedback.ok ? "check_circle" : "error"}
          </span>
          {actionFeedback.msg}
        </div>
      )}

      {/* ── 2. Top-Level Main Tabs ── */}
      <Tabs<MainTab>
        activeTab={activeMainTab}
        onChange={(t) => setActiveMainTab(t)}
        variant="underline"
        tabs={[
          {
            id: "skills",
            label: "Skills",
            icon: <Sparkles size={15} />,
            count: installedSkillsCount,
          },
          {
            id: "agents",
            label: "Agentes",
            icon: <Bot size={15} />,
            count: installedAgentsCount,
          },
          {
            id: "tools",
            label: "Tools",
            icon: <Wrench size={15} />,
            count: toolsCount,
          },
          {
            id: "mcp",
            label: "Conectores MCP",
            icon: <Cable size={15} />,
            count: projectMcpServersCount,
          },
        ]}
      />
    </div>
  );
};

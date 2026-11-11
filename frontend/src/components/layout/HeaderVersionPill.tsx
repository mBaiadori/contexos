import React from "react";
import { useWorkspace } from "../../context/WorkspaceContext";

export interface HeaderVersionPillProps {
  onClick: () => void;
}

export const HeaderVersionPill: React.FC<HeaderVersionPillProps> = ({ onClick }) => {
  const { gitStatus, activeRepo, versionGraph } = useWorkspace();

  const currentBranch = gitStatus?.branch || versionGraph?.currentBranch || "main";
  const defaultBranch = activeRepo?.default_branch || "main";
  const isMain = currentBranch === defaultBranch;

  // Nome semântico da versão ativa
  const activeNode = versionGraph?.nodes?.find((n) => n.name === currentBranch);
  const activeProposal = activeNode?.proposal;

  const semanticName = isMain
    ? "Versão Oficial"
    : activeNode?.displayName || activeProposal?.title || currentBranch;
  const label =
    semanticName.length > 30 ? `${semanticName.slice(0, 29)}…` : semanticName;

  return (
    <button
      id="header-version-pill"
      type="button"
      onClick={onClick}
      title={`Versão ativa: ${semanticName}${currentBranch !== semanticName ? ` (${currentBranch})` : ""}. Clique para abrir o mapa de versões.`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "12px",
        fontWeight: 500,
        padding: "3px 10px",
        borderRadius: "9999px",
        backgroundColor: isMain
          ? "var(--bg-surface, rgba(0, 0, 0, 0.05))"
          : activeProposal
            ? "rgba(245, 158, 11, 0.12)"
            : "rgba(139, 92, 246, 0.12)",
        color: isMain
          ? "var(--text-secondary)"
          : activeProposal
            ? "#d97706"
            : "#7c3aed",
        border: `1px solid ${
          isMain
            ? "var(--border-color, rgba(0, 0, 0, 0.1))"
            : activeProposal
              ? "rgba(245, 158, 11, 0.3)"
              : "rgba(139, 92, 246, 0.3)"
        }`,
        cursor: "pointer",
        transition: "all 0.15s ease",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: isMain
            ? "var(--color-primary, #2563eb)"
            : activeProposal
              ? "#f59e0b"
              : "#8b5cf6",
        }}
      />
      <span>{label}</span>
    </button>
  );
};


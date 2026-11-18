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

  const isRemoteOrPublished =
    Boolean(activeNode?.hasRemote) ||
    Boolean(activeProposal) ||
    activeNode?.type === "proposal" ||
    activeNode?.publicationStatus === "open" ||
    activeNode?.publicationStatus === "synced" ||
    activeNode?.publicationStatus === "remote_only";

  const pillTheme = isMain
    ? {
        bg: "rgba(37, 99, 235, 0.12)",
        border: "rgba(37, 99, 235, 0.3)",
        color: "#2563eb",
        dot: "#2563eb",
      }
    : activeNode?.isMerged
      ? {
          bg: "rgba(5, 150, 105, 0.12)",
          border: "rgba(5, 150, 105, 0.3)",
          color: "#059669",
          dot: "#059669",
        }
      : isRemoteOrPublished
        ? {
            bg: "rgba(124, 58, 237, 0.12)",
            border: "rgba(124, 58, 237, 0.3)",
            color: "#7c3aed",
            dot: "#7c3aed",
          }
        : {
            bg: "rgba(217, 119, 6, 0.12)",
            border: "rgba(217, 119, 6, 0.3)",
            color: "#d97706",
            dot: "#d97706",
          };

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
        backgroundColor: pillTheme.bg,
        color: pillTheme.color,
        border: `1px solid ${pillTheme.border}`,
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
          backgroundColor: pillTheme.dot,
        }}
      />
      <span>{label}</span>
    </button>
  );
};


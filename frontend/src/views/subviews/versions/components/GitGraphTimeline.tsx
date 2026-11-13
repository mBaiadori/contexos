import React, { useMemo } from "react";
import type { GitGraphCommit } from "../../../../types";
import { layoutGitGraph, getGraphEdgePath } from "../layoutGraph";

export interface GitGraphTimelineProps {
  commits: GitGraphCommit[];
  selectedHash: string | null;
  onSelectCommit: (commit: GitGraphCommit) => void;
  onSwitchCommit: (commit: GitGraphCommit) => void;
  searchQuery?: string;
}

const ROW_HEIGHT = 44;
const LANE_WIDTH = 22;
const LANE_OFFSET_X = 16;

export const GitGraphTimeline: React.FC<GitGraphTimelineProps> = ({
  commits,
  selectedHash,
  onSelectCommit,
  onSwitchCommit,
  searchQuery = "",
}) => {
  // Filtro de busca simples
  const filteredCommits = useMemo(() => {
    if (!searchQuery.trim()) return commits;
    const q = searchQuery.toLowerCase().trim();
    return commits.filter(
      (c) =>
        c.message.toLowerCase().includes(q) ||
        c.author.toLowerCase().includes(q) ||
        c.shortHash.toLowerCase().includes(q) ||
        c.hash.toLowerCase().includes(q) ||
        (c.branches && c.branches.some((b) => b.name.toLowerCase().includes(q) || b.displayName.toLowerCase().includes(q))),
    );
  }, [commits, searchQuery]);

  // Cálculo determinístico do layout do DAG
  const layout = useMemo(() => {
    return layoutGitGraph(filteredCommits);
  }, [filteredCommits]);

  const svgWidth = Math.max(layout.laneCount * LANE_WIDTH + LANE_OFFSET_X + 16, 54);
  const svgHeight = layout.rows.length * ROW_HEIGHT;

  if (layout.rows.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--text-secondary)",
          fontSize: "13px",
        }}
      >
        Nenhum commit encontrado no repositório.
      </div>
    );
  }

  return (
    <div
      id="git-graph-timeline"
      style={{
        position: "relative",
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        background: "var(--bg-surface)",
      }}
    >
      <div
        style={{
          position: "relative",
          minHeight: `${svgHeight}px`,
          width: "100%",
        }}
      >
        {/* Camada SVG de Arestas e Conexões do Grafo */}
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: `${svgWidth}px`,
            height: `${svgHeight}px`,
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          {layout.edges.map((edge) => {
            const x1 = edge.fromLane * LANE_WIDTH + LANE_OFFSET_X;
            const y1 = edge.fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
            const x2 = edge.toLane * LANE_WIDTH + LANE_OFFSET_X;
            const y2 = edge.toRow * ROW_HEIGHT + ROW_HEIGHT / 2;
            const pathData = getGraphEdgePath(x1, y1, x2, y2);

            return (
              <path
                key={edge.id}
                d={pathData}
                fill="none"
                stroke={edge.color}
                strokeWidth={edge.isMerge ? "2" : "2.2"}
                strokeDasharray={edge.isMerge ? "3 3" : undefined}
                opacity={edge.isMerge ? 0.75 : 0.85}
              />
            );
          })}
        </svg>

        {/* Linhas da Timeline (Rows) */}
        {layout.rows.map((row) => {
          const isSelected = selectedHash === row.commit.hash;
          const nodeX = row.lane * LANE_WIDTH + LANE_OFFSET_X;
          const nodeY = ROW_HEIGHT / 2;

          return (
            <div
              key={row.commit.hash}
              onClick={() => onSelectCommit(row.commit)}
              onDoubleClick={() => onSwitchCommit(row.commit)}
              style={{
                height: `${ROW_HEIGHT}px`,
                display: "flex",
                alignItems: "center",
                borderBottom: "1px solid rgba(0, 0, 0, 0.04)",
                background: isSelected
                  ? "rgba(37, 99, 235, 0.08)"
                  : "transparent",
                cursor: "pointer",
                transition: "background 0.12s ease",
                paddingRight: "16px",
                position: "relative",
                zIndex: 2,
              }}
              className="git-timeline-row"
              title="Clique para ver detalhes ou dê duplo clique para alternar para este marco"
            >
              {/* Coluna do Grafo SVG com o nó do commit */}
              <div
                style={{
                  width: `${svgWidth}px`,
                  height: "100%",
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                <svg
                  style={{
                    width: "100%",
                    height: "100%",
                    overflow: "visible",
                  }}
                >
                  {/* Halo luminoso pulsante no HEAD ativo */}
                  {row.isHead && (
                    <circle
                      cx={nodeX}
                      cy={nodeY}
                      r={10}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth={2}
                      opacity={0.4}
                    />
                  )}

                  {/* Círculo do Nó de Commit */}
                  <circle
                    cx={nodeX}
                    cy={nodeY}
                    r={row.isHead ? 6 : row.isMainTip ? 5.5 : 4.5}
                    fill={row.isHead ? "#ffffff" : row.color}
                    stroke={row.isHead ? "#2563eb" : "#ffffff"}
                    strokeWidth={row.isHead ? 3 : 1.5}
                  />
                </svg>
              </div>

              {/* Coluna Central: Pílulas de Branches e Mensagem */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  overflow: "hidden",
                  paddingLeft: "6px",
                }}
              >
                {/* Pílulas de Versões / Branches vinculadas a este commit */}
                {row.branches.map((b) => (
                  <span
                    key={b.name}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "2px 8px",
                      borderRadius: "9999px",
                      fontSize: "11px",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      background: b.isDefault
                        ? "#2563eb"
                        : b.isMerged
                          ? "#f0fdf4"
                          : "#ede9fe",
                      color: b.isDefault
                        ? "#ffffff"
                        : b.isMerged
                          ? "#15803d"
                          : "#6d28d9",
                      border: `1px solid ${
                        b.isDefault
                          ? "#1d4ed8"
                          : b.isMerged
                            ? "#bbf7d0"
                            : "#ddd6fe"
                      }`,
                    }}
                  >
                    {b.isDefault ? "★ Principal" : b.displayName || b.name}
                    {b.isCurrent && (
                      <span
                        style={{
                          width: "5px",
                          height: "5px",
                          borderRadius: "50%",
                          background: b.isDefault ? "#93c5fd" : "#16a34a",
                        }}
                      />
                    )}
                  </span>
                ))}

                {/* Mensagem do Commit */}
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: row.isHead || row.isMainTip ? 600 : 400,
                    color: isSelected
                      ? "var(--color-primary, #2563eb)"
                      : "var(--text-heading)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.commit.message.split("\n")[0] || "Commit"}
                </span>
              </div>

              {/* Coluna da Direita: Autor, Data e Hash */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  flexShrink: 0,
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                }}
              >
                <span style={{ maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.commit.author}
                </span>

                <span style={{ fontSize: "11px", whiteSpace: "nowrap", minWidth: "75px" }}>
                  {row.commit.date ? new Date(row.commit.date).toLocaleDateString("pt-BR") : ""}
                </span>

                <code
                  style={{
                    fontFamily: "monospace",
                    fontSize: "11px",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    background: "rgba(0, 0, 0, 0.04)",
                    color: "var(--text-secondary)",
                    fontWeight: 600,
                  }}
                >
                  {row.commit.shortHash || row.commit.hash.slice(0, 7)}
                </code>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

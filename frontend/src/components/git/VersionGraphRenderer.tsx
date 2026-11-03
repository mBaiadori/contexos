import React from "react";
import type { VersionNode } from "../../types";
import { Badge, Button } from "../ui";

export interface VersionGraphRendererProps {
  nodes: VersionNode[];
  onSelectNode?: (node: VersionNode) => void;
  onSwitchNode: (node: VersionNode) => void;
  onEditProposal?: (proposalId: number | string) => void;
  onCompareWithMain?: (node: VersionNode) => void;
  onNewVersionFrom?: (node: VersionNode) => void;
  isSwitching?: boolean;
}

export const VersionGraphRenderer: React.FC<VersionGraphRendererProps> = ({
  nodes,
  onSelectNode,
  onSwitchNode,
  onEditProposal,
  onCompareWithMain,
  onNewVersionFrom,
  isSwitching = false,
}) => {
  if (!nodes || nodes.length === 0) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "var(--text-secondary)" }}>
        Nenhuma versão encontrada no repositório.
      </div>
    );
  }

  const ROW_HEIGHT = 88;
  const SVG_WIDTH = 64;
  const MAIN_X = 24;
  const BRANCH_X = 46;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        gap: "4px",
      }}
    >
      {nodes.map((node, index) => {
        const isMain = node.isDefault;
        const cy = ROW_HEIGHT / 2;
        const cx = isMain ? MAIN_X : BRANCH_X;

        // Cor do nó
        let nodeColor = "var(--color-primary, #2563eb)";
        if (node.type === "proposal") {
          nodeColor = "#f59e0b"; // âmbar para propostas em revisão
        } else if (node.type === "draft") {
          nodeColor = "#8b5cf6"; // violeta para rascunhos locais
        }

        return (
          <div
            key={node.name}
            onClick={() => onSelectNode?.(node)}
            style={{
              display: "flex",
              alignItems: "stretch",
              minHeight: `${ROW_HEIGHT}px`,
              border: node.isCurrent
                ? "1px solid var(--color-primary, #2563eb)"
                : "1px solid var(--border-color)",
              borderRadius: "8px",
              background: node.isCurrent
                ? "var(--color-primary-subtle, rgba(37, 99, 235, 0.04))"
                : "var(--bg-surface)",
              transition: "all 0.15s ease",
            }}
          >
            {/* Coluna Visual do Grafo (SVG) */}
            <div
              style={{
                width: `${SVG_WIDTH}px`,
                position: "relative",
                flexShrink: 0,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <svg
                width={SVG_WIDTH}
                height={ROW_HEIGHT}
                style={{ overflow: "visible" }}
              >
                {/* Linha vertical contínua da Principal */}
                <line
                  x1={MAIN_X}
                  y1={index === 0 ? cy : 0}
                  x2={MAIN_X}
                  y2={index === nodes.length - 1 && isMain ? cy : ROW_HEIGHT}
                  stroke="var(--color-primary, #2563eb)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />

                {/* Curva de ramificação partindo da Principal para a Versão derivada */}
                {!isMain && (
                  <path
                    d={`M ${MAIN_X} 0 C ${MAIN_X} ${cy * 0.7}, ${BRANCH_X} ${cy * 0.3}, ${BRANCH_X} ${cy}`}
                    fill="none"
                    stroke={nodeColor}
                    strokeWidth="2.5"
                    strokeDasharray={node.type === "draft" ? "4 3" : undefined}
                  />
                )}

                {/* Anel de foco para Versão Ativa ("Você está aqui") */}
                {node.isCurrent && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r="14"
                    fill="none"
                    stroke={nodeColor}
                    strokeWidth="2"
                    opacity="0.6"
                  />
                )}

                {/* Círculo do Nó da Versão */}
                <circle
                  cx={cx}
                  cy={cy}
                  r="7"
                  fill={nodeColor}
                  stroke="var(--bg-surface)"
                  strokeWidth="2.5"
                />
              </svg>
            </div>

            {/* Coluna de Informações e Ações da Versão */}
            <div
              style={{
                display: "flex",
                flex: 1,
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              {/* Detalhes da Versão */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "240px", flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-heading)" }}>
                    {isMain ? "Principal" : node.name}
                  </span>

                  {/* Badges de Status simples */}
                  {isMain && (
                    <Badge variant="primary" size="sm">
                      Publicada
                    </Badge>
                  )}

                  {node.proposal && (
                    <Badge
                      variant={node.proposal.status === "OPEN" ? "warning" : "info"}
                      size="sm"
                    >
                      Proposta #{node.proposal.id} · {node.proposal.status === "OPEN" ? "Em revisão" : node.proposal.status}
                    </Badge>
                  )}

                  {!isMain && !node.proposal && (
                    <Badge variant="outline" size="sm">
                      Rascunho local
                    </Badge>
                  )}

                  {node.isCurrent && (
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "9999px",
                        background: "rgba(37, 99, 235, 0.12)",
                        color: "var(--color-primary, #2563eb)",
                      }}
                    >
                      Você está aqui
                    </span>
                  )}
                </div>

                {/* Resumo do Último Marco e Proposta */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--text-secondary)", flexWrap: "wrap" }}>
                  {node.proposal?.title && (
                    <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                      {node.proposal.title}
                    </span>
                  )}

                  {node.lastCommit && (
                    <span>
                      Último marco: {node.lastCommit.message} ({node.lastCommit.author})
                    </span>
                  )}

                  {!isMain && (node.ahead > 0 || node.behind > 0) && (
                    <span style={{ fontFamily: "monospace", fontSize: "11px" }}>
                      ({node.ahead > 0 ? `+${node.ahead}` : ""}{node.behind > 0 ? ` -${node.behind}` : ""})
                    </span>
                  )}
                </div>
              </div>

              {/* Botões de Ação Direta */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                {node.proposal && onEditProposal && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditProposal(node.proposal!.id);
                    }}
                    title="Editar arquivos diretamente nesta proposta"
                  >
                    Editar proposta
                  </Button>
                )}

                {!isMain && onCompareWithMain && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCompareWithMain(node);
                    }}
                    title="Comparar alterações com a versão Principal"
                  >
                    Comparar
                  </Button>
                )}

                {onNewVersionFrom && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNewVersionFrom(node);
                    }}
                    title="Criar nova versão a partir deste ponto"
                  >
                    + Nova versão
                  </Button>
                )}

                {!node.isCurrent && (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isSwitching}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSwitchNode(node);
                    }}
                    title={`Alternar workspace para a versão ${node.name}`}
                  >
                    Alternar
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

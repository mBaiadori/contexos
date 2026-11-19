import React, {
  useState,
  useRef,
  useMemo,
  useEffect,
  useCallback,
} from "react";
import type { GitGraphCommit, VersionNode } from "../../../../types";
import {
  calculateCanvasLayout,
  cleanCommitTitle,
  getSankeyHorizontalPath,
  TRUNK_X,
  DEFAULT_NODE_SPACING,
  COMMIT_RADIUS,
} from "./version-canvas-layout";
import { VersionCanvasControls } from "./VersionCanvasControls";
import { VersionCanvasLegend } from "./VersionCanvasLegend";

export { cleanCommitTitle };

export interface VersionCanvasViewProps {
  commits: GitGraphCommit[];
  nodes?: VersionNode[];
  defaultBranch?: string;
  currentBranch?: string;
  isDetached?: boolean;
  headHash?: string;
  selectedCommitHash: string | null;
  selectedBranchName?: string | null;
  onSelectCommit: (commit: GitGraphCommit, branchName?: string) => void;
  onSwitchCommit: (commit: GitGraphCommit, targetBranch?: string) => void;
  searchQuery?: string;
}

export const VersionCanvasView: React.FC<VersionCanvasViewProps> = ({
  commits,
  nodes = [],
  defaultBranch = "main",
  currentBranch = "main",
  isDetached = false,
  headHash,
  selectedCommitHash,
  selectedBranchName,
  onSelectCommit,
  onSwitchCommit,
  searchQuery = "",
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1.15);
  const [pan, setPan] = useState({ x: 380, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Seleção e hover independentes por nó
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const isInternalClickRef = useRef(false);

  // Espaçamento dinâmico entre nós persistido no localStorage (padrão 16px)
  const [nodeSpacing, setNodeSpacing] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("contexos:canvas_node_spacing");
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 10 && val <= 50) return val;
      }
    } catch {}
    return DEFAULT_NODE_SPACING;
  });

  useEffect(() => {
    try {
      localStorage.setItem("contexos:canvas_node_spacing", String(nodeSpacing));
    } catch {}
  }, [nodeSpacing]);

  // Branches com commits expandidos (por padrão todos os commits começam ocultos!)
  const [expandedBranchNames, setExpandedBranchNames] = useState<Set<string>>(
    () => {
      try {
        const saved = localStorage.getItem("contexos:expanded_branch_commits");
        if (saved) {
          const arr = JSON.parse(saved);
          if (Array.isArray(arr)) return new Set(arr);
        }
      } catch {}
      return new Set<string>();
    },
  );

  const persistExpanded = useCallback((newSet: Set<string>) => {
    setExpandedBranchNames(newSet);
    try {
      localStorage.setItem(
        "contexos:expanded_branch_commits",
        JSON.stringify(Array.from(newSet)),
      );
    } catch {}
  }, []);

  const toggleBranchCommits = useCallback((branchName: string) => {
    setExpandedBranchNames((prev) => {
      const next = new Set(prev);
      if (next.has(branchName)) {
        next.delete(branchName);
      } else {
        next.add(branchName);
      }
      try {
        localStorage.setItem(
          "contexos:expanded_branch_commits",
          JSON.stringify(Array.from(next)),
        );
      } catch {}
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const defaultNode = nodes.find((n) => n.isDefault) || nodes[0];
    const otherNames = nodes
      .filter((n) => n.name !== defaultNode?.name)
      .map((n) => n.name);
    persistExpanded(new Set(otherNames));
  }, [nodes, persistExpanded]);

  const collapseAll = useCallback(() => {
    persistExpanded(new Set<string>());
  }, [persistExpanded]);

  // Helper para obter o commit alvo de uma branch (para seleção e detalhes)
  const getBranchCommit = useCallback(
    (bNode: VersionNode): GitGraphCommit => {
      if (bNode.lastCommit?.hash) {
        const found = commits.find((c) => c.hash === bNode.lastCommit?.hash);
        if (found) return found;
      }
      if (bNode.baseHash) {
        const found = commits.find((c) => c.hash === bNode.baseHash);
        if (found) return found;
      }
      if (bNode.commits && bNode.commits.length > 0) {
        const found = commits.find((c) => c.hash === bNode.commits![0].hash);
        if (found) return found;
      }
      return (
        commits[0] || {
          hash: bNode.name,
          shortHash: bNode.name.slice(0, 7),
          parents: [],
          author: "Workspace",
          date: new Date().toISOString(),
          message: bNode.displayName || bNode.name,
        }
      );
    },
    [commits],
  );

  // Filtro de busca simples
  const matchesSearch = useCallback(
    (text: string) => {
      if (!searchQuery.trim()) return true;
      return text.toLowerCase().includes(searchQuery.toLowerCase().trim());
    },
    [searchQuery],
  );

  // Mapeamento e cálculo do layout com divisão esquerda/direita e altura dinâmica
  const layout = useMemo(() => {
    return calculateCanvasLayout({
      commits,
      nodes,
      defaultBranch,
      currentBranch,
      isDetached,
      nodeSpacing,
      expandedBranchNames,
    });
  }, [
    commits,
    nodes,
    defaultBranch,
    currentBranch,
    isDetached,
    nodeSpacing,
    expandedBranchNames,
  ]);

  // Sincronização de seleção externa para o nó correspondente
  useEffect(() => {
    if (isInternalClickRef.current) {
      isInternalClickRef.current = false;
      return;
    }
    // Quando uma branch específica da ponta estiver selecionada, destaca APENAS a branch, nunca o nó da Principal
    if (selectedBranchName && selectedBranchName !== defaultBranch) {
      setSelectedNodeId(`branch:${selectedBranchName}`);
      return;
    }
    if (!selectedCommitHash) {
      setSelectedNodeId(null);
      return;
    }

    const isTrunk = layout.trunkCommits.some(
      (tc) => tc.commit.hash === selectedCommitHash,
    );
    if (
      isTrunk &&
      (!selectedBranchName || selectedBranchName === defaultBranch)
    ) {
      setSelectedNodeId(`trunk:${selectedCommitHash}`);
      return;
    }

    for (const br of layout.branches) {
      const bc = br.commits.find((c) => c.commit.hash === selectedCommitHash);
      if (bc) {
        setSelectedNodeId(`bcommit:${br.node.name}:${selectedCommitHash}`);
        return;
      }
    }
  }, [selectedCommitHash, selectedBranchName, defaultBranch, layout]);

  // Centralização automática no commit ativo
  const centerOnActive = useCallback(() => {
    if (!layout || layout.trunkCommits.length === 0) return;
    const container = containerRef.current;
    const w = container?.clientWidth || 800;
    const h = container?.clientHeight || 600;

    let targetX = TRUNK_X;
    let targetY = layout.trunkCommits[layout.trunkCommits.length - 1]?.y || 100;

    if (!isDetached && currentBranch !== defaultBranch) {
      const activeBranch = layout.branches.find(
        (b) => b.node.name === currentBranch,
      );
      if (activeBranch) {
        targetX = activeBranch.entryX;
        targetY = activeBranch.entryY;
      }
    } else if (
      selectedCommitHash &&
      layout.allCommitsMap.has(selectedCommitHash)
    ) {
      const pos = layout.allCommitsMap.get(selectedCommitHash)!;
      targetX = pos.x;
      targetY = pos.y;
    }

    const targetZoom = 1.15;
    setZoom(targetZoom);
    setPan({
      x: w / 2 - targetX * targetZoom,
      y: h / 2 - targetY * targetZoom,
    });
  }, [layout, currentBranch, defaultBranch, isDetached, selectedCommitHash]);

  // Centraliza na montagem inicial
  const centeredOnceRef = useRef(false);
  useEffect(() => {
    if (!centeredOnceRef.current && layout.trunkCommits.length > 0) {
      centeredOnceRef.current = true;
      centerOnActive();
    }
  }, [layout, centerOnActive]);

  // Pan com drag do mouse
  const handleMouseDown = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).tagName === "svg" ||
      (e.target as HTMLElement).id === "canvas-bg"
    ) {
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Wheel com zoom e pan livre
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY < 0 ? 1.08 : 0.92;
        setZoom((prev) => Math.min(Math.max(prev * factor, 0.4), 3.5));
      } else {
        setPan((prev) => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }));
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Identifica a branch mergeada ativa para acendimento da curva de retorno de merge
  const activeMergedBranch = useMemo(() => {
    const activeName = hoveredNodeId?.startsWith("branch:")
      ? hoveredNodeId.slice(7)
      : selectedNodeId?.startsWith("branch:")
        ? selectedNodeId.slice(7)
        : null;
    if (!activeName) return null;
    return (
      layout.branches.find((b) => b.node.name === activeName && b.isMerged) ||
      null
    );
  }, [hoveredNodeId, selectedNodeId, layout.branches]);

  const mergeTargetTrunkCommit = useMemo(() => {
    if (!activeMergedBranch?.mergeCommitHash) return null;
    const targetHash = activeMergedBranch.mergeCommitHash.toLowerCase();
    return (
      layout.trunkCommits.find((tc) =>
        tc.commit.hash.toLowerCase().startsWith(targetHash),
      ) || null
    );
  }, [activeMergedBranch, layout.trunkCommits]);

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      id="canvas-bg"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "var(--bg-surface)",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
      }}
    >
      {/* Grade de fundo pontilhada suave */}
      <svg
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        <defs>
          <pattern
            id="canvas-dots"
            width="28"
            height="28"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="14" cy="14" r="0.8" fill="rgba(0, 0, 0, 0.08)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#canvas-dots)" />
      </svg>

      {/* Camada SVG Principal com Transformação de Pan e Zoom */}
      <svg
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          overflow: "visible",
        }}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* 1. LINHA DO TRONCO PRINCIPAL (AZUL CONTÍNUO NO MEIO) */}
          {layout.trunkCommits.length > 0 && (
            <line
              x1={TRUNK_X}
              y1={layout.trunkTopY}
              x2={TRUNK_X}
              y2={layout.trunkBaseY}
              stroke="#2563eb"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
          )}

          {/* 2. CURVAS SANKEY HORIZONTAIS PARA AS BRANCHES (ESQUERDA E DIREITA) */}
          {layout.branches.map((br) => {
            const isHovered =
              hoveredNodeId === `branch:${br.node.name}` ||
              selectedNodeId === `branch:${br.node.name}`;

            return (
              <g key={`branch-connectors-${br.node.name}`}>
                {/* Conexão suave Sankey da origem até o nó de entrada da branch */}
                <path
                  d={br.path}
                  fill="none"
                  stroke={br.color}
                  strokeWidth={isHovered ? "2.6" : "1.8"}
                  opacity={isHovered ? 1 : 0.8}
                  style={{
                    transition: "stroke-width 0.15s ease, opacity 0.15s ease",
                  }}
                />

                {/* Linha horizontal contínua ajustada ao nome que conecta o nó até o ponto de bifurcação dos filhos */}
                {br.hasChildren && (
                  <line
                    x1={br.entryX}
                    y1={br.entryY}
                    x2={br.exitX}
                    y2={br.exitY}
                    stroke={br.color}
                    strokeWidth={isHovered ? "2.6" : "1.8"}
                    strokeLinecap="round"
                    opacity={isHovered ? 1 : 0.85}
                    style={{
                      transition: "stroke-width 0.15s ease, opacity 0.15s ease",
                    }}
                  />
                )}
              </g>
            );
          })}

          {/* 3. CURVA DE RETORNO DE MERGE (ACENDIMENTO SOB DEMANDA) */}
          {activeMergedBranch && mergeTargetTrunkCommit && (
            <g style={{ pointerEvents: "none" }}>
              <path
                d={getSankeyHorizontalPath(
                  activeMergedBranch.entryX,
                  activeMergedBranch.entryY,
                  TRUNK_X,
                  mergeTargetTrunkCommit.y,
                )}
                fill="none"
                stroke="#059669"
                strokeWidth="2.5"
                strokeDasharray="4 4"
                opacity={0.95}
              />
              <circle
                cx={TRUNK_X}
                cy={mergeTargetTrunkCommit.y}
                r="10"
                fill="none"
                stroke="#059669"
                strokeWidth="2.5"
                opacity={0.9}
              />
            </g>
          )}

          {/* 4. COMMITS DO TRONCO PRINCIPAL */}
          {layout.trunkCommits.map((tc) => {
            const trunkNodeId = `trunk:${tc.commit.hash}`;
            const isSelected =
              selectedNodeId === trunkNodeId &&
              (!selectedBranchName || selectedBranchName === defaultBranch);
            const isHovered = hoveredNodeId === trunkNodeId;
            const isMatch = matchesSearch(tc.commit.message);
            const isWorkspaceActive =
              (!isDetached &&
                currentBranch === defaultBranch &&
                (tc.commit.hash === headHash || tc.isTip)) ||
              (isDetached && Boolean(headHash) && tc.commit.hash === headHash);

            return (
              <g
                key={`trunk-${tc.commit.hash}`}
                transform={`translate(${TRUNK_X}, ${tc.y})`}
                onClick={(e) => {
                  e.stopPropagation();
                  isInternalClickRef.current = true;
                  setSelectedNodeId(trunkNodeId);
                  onSelectCommit(tc.commit, defaultBranch);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onSwitchCommit(tc.commit, defaultBranch);
                }}
                onMouseEnter={() => setHoveredNodeId(trunkNodeId)}
                onMouseLeave={() => setHoveredNodeId(null)}
                style={{
                  cursor: "pointer",
                  opacity: isMatch ? 1 : 0.25,
                  transition: "opacity 0.15s ease",
                }}
              >
                {/* Hitbox transparente delimitada para o lado do rótulo */}
                <rect
                  x={tc.labelSide === 1 ? -10 : -140}
                  y="-12"
                  width={tc.isTip ? 110 : 150}
                  height="24"
                  fill="rgba(0, 0, 0, 0.001)"
                  style={{ pointerEvents: "all" }}
                />

                {/* Destaque aprimorado da versão ativa no workspace (High-contrast Pulse & Double-Ring Glow) */}
                {isWorkspaceActive && (
                  <g style={{ pointerEvents: "none" }}>
                    <circle cx="0" cy="0" r="13" fill="#2563eb" opacity="0.22">
                      <animate
                        attributeName="r"
                        values="10;15;10"
                        dur="2.4s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="0.28;0.08;0.28"
                        dur="2.4s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle
                      cx="0"
                      cy="0"
                      r="9"
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="2.2"
                      opacity="0.95"
                    />
                  </g>
                )}

                {/* Anel de seleção suave individual */}
                {isSelected && !isWorkspaceActive && (
                  <circle
                    cx="0"
                    cy="0"
                    r={COMMIT_RADIUS + 5}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2"
                    opacity={0.4}
                  />
                )}

                {/* Nó circular do commit */}
                <circle
                  cx="0"
                  cy="0"
                  r={
                    isWorkspaceActive
                      ? 5.8
                      : tc.isTip
                        ? 5.5
                        : isSelected
                          ? 5.2
                          : COMMIT_RADIUS
                  }
                  fill={
                    isWorkspaceActive
                      ? "#2563eb"
                      : tc.isTip
                        ? "#2563eb"
                        : isSelected
                          ? "#2563eb"
                          : "#ffffff"
                  }
                  stroke={isWorkspaceActive ? "#ffffff" : "#2563eb"}
                  strokeWidth={
                    isWorkspaceActive
                      ? "2"
                      : tc.isTip
                        ? "2.5"
                        : isSelected
                          ? "2.2"
                          : "1.8"
                  }
                  style={{
                    filter: isWorkspaceActive
                      ? "drop-shadow(0 1px 4px rgba(37,99,235,0.6))"
                      : undefined,
                  }}
                />

                {/* Badge Permanente Principal no topo */}
                {tc.isTip ? (
                  <g
                    transform={`translate(${tc.labelSide === 1 ? 12 : -92}, -11)`}
                  >
                    <rect
                      x="0"
                      y="0"
                      width={isWorkspaceActive ? "106" : "86"}
                      height="22"
                      rx="11"
                      fill={isWorkspaceActive ? "#2563eb" : "#1e40af"}
                      style={{
                        filter: isWorkspaceActive
                          ? "drop-shadow(0 2px 8px rgba(37,99,235,0.5))"
                          : "drop-shadow(0 2px 5px rgba(37,99,235,0.25))",
                      }}
                    />
                    <text
                      x={isWorkspaceActive ? "53" : "43"}
                      y="11.5"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#ffffff"
                      fontSize="10"
                      fontWeight="700"
                      fontFamily="system-ui, -apple-system, sans-serif"
                    >
                      {isWorkspaceActive ? "● Oficial (Ativa)" : "★ Oficial"}
                    </text>
                  </g>
                ) : (
                  /* Commits intermediários: etiqueta suave oposta aos galhos */
                  <text
                    x={tc.labelSide === 1 ? 12 : -12}
                    y="0"
                    textAnchor={tc.labelSide === 1 ? "start" : "end"}
                    dominantBaseline="central"
                    fill={
                      isSelected
                        ? "#2563eb"
                        : isHovered
                          ? "var(--text-heading, #1e293b)"
                          : "var(--text-secondary, #64748b)"
                    }
                    fontSize="10"
                    fontWeight={isSelected ? "600" : "500"}
                    fontFamily="system-ui, -apple-system, sans-serif"
                    style={{ letterSpacing: "-0.01em" }}
                  >
                    {tc.shortLabel}
                  </text>
                )}
              </g>
            );
          })}

          {/* 5. NÓS DAS BRANCHES (SEM BORDAS E SEM FUNDO - LIMPOS COMO A PRINCIPAL) E HASTES */}
          {layout.branches.map((br) => {
            const branchNodeId = `branch:${br.node.name}`;
            const isSelectedBranch = selectedNodeId === branchNodeId;
            const isHoveredBranch = hoveredNodeId === branchNodeId;
            const isExpanded = expandedBranchNames.has(br.node.name);

            const displayName =
              (br.node.displayName || br.node.name).length > 20
                ? `${(br.node.displayName || br.node.name).slice(0, 19)}…`
                : br.node.displayName || br.node.name;

            return (
              <g key={`branch-group-${br.node.name}`}>
                {/* Haste vertical guia com a cor da branch descendo do nó até o último commit (somente se expandido) */}
                {isExpanded && br.commits.length > 0 && (
                  <line
                    x1={br.entryX}
                    y1={br.entryY}
                    x2={br.entryX}
                    y2={br.commits[br.commits.length - 1].y}
                    stroke={br.color}
                    strokeWidth="1.6"
                    strokeDasharray="2 2"
                    opacity={0.45}
                  />
                )}

                {/* Nó Principal da Branch (estilo limpo, sem card/fundo/borda retangular) */}
                <g
                  transform={`translate(${br.entryX}, ${br.entryY})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    isInternalClickRef.current = true;
                    setSelectedNodeId(branchNodeId);
                    const targetCommit = getBranchCommit(br.node);
                    onSelectCommit(targetCommit, br.node.name);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    const targetCommit = getBranchCommit(br.node);
                    onSwitchCommit(targetCommit, br.node.name);
                  }}
                  onMouseEnter={() => setHoveredNodeId(branchNodeId)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  style={{ cursor: "pointer", pointerEvents: "all" }}
                >
                  {/* Hitbox precisa clicável no nó e no texto */}
                  {(() => {
                    const hasBadge = br.commitCount > 0;
                    const badgeW = hasBadge
                      ? br.commitCount > 9
                        ? 22
                        : 18
                      : 0;
                    const textW = Math.min(displayName.length * 7.2, 130);
                    const totalW =
                      (hasBadge ? 8 + badgeW + 6 : 10) +
                      textW +
                      (br.isMerged ? 16 : 0) +
                      12;

                    return (
                      <rect
                        x={br.side === 1 ? -10 : -totalW - 8}
                        y="-12"
                        width={totalW + 18}
                        height="24"
                        fill="rgba(0, 0, 0, 0.001)"
                        style={{ pointerEvents: "all" }}
                      />
                    );
                  })()}

                  {/* Destaque aprimorado da versão ativa no workspace (High-contrast Pulse & Double-Ring Glow) */}
                  {br.isCurrent && (
                    <g style={{ pointerEvents: "none" }}>
                      {/* Halo pulsante suave */}
                      <circle
                        cx="0"
                        cy="0"
                        r="12"
                        fill={br.color}
                        opacity="0.22"
                      >
                        <animate
                          attributeName="r"
                          values="10;14;10"
                          dur="2.4s"
                          repeatCount="indefinite"
                        />
                        <animate
                          attributeName="opacity"
                          values="0.28;0.08;0.28"
                          dur="2.4s"
                          repeatCount="indefinite"
                        />
                      </circle>
                      {/* Anel de alto contraste */}
                      <circle
                        cx="0"
                        cy="0"
                        r="8.5"
                        fill="none"
                        stroke={br.color}
                        strokeWidth="2.2"
                        opacity="0.95"
                      />
                    </g>
                  )}

                  {/* Anel de seleção suave individual */}
                  {isSelectedBranch && !br.isCurrent && (
                    <circle
                      cx="0"
                      cy="0"
                      r={COMMIT_RADIUS + 5}
                      fill="none"
                      stroke={br.color}
                      strokeWidth="2"
                      opacity={0.4}
                    />
                  )}

                  {/* Círculo do Nó da Branch com a cor da branch */}
                  <circle
                    cx="0"
                    cy="0"
                    r={
                      br.isCurrent
                        ? 5.5
                        : isSelectedBranch || isHoveredBranch
                          ? 5.2
                          : 4.5
                    }
                    fill={
                      br.isCurrent || isSelectedBranch ? br.color : "#ffffff"
                    }
                    stroke={br.isCurrent ? "#ffffff" : br.color}
                    strokeWidth={br.isCurrent ? "2" : "2.2"}
                    style={{
                      filter: br.isCurrent
                        ? `drop-shadow(0 1px 4px ${br.color}99)`
                        : undefined,
                    }}
                  />

                  {/* Badge do número de commits posicionado diretamente adjacente ao círculo */}
                  {br.commitCount > 0 &&
                    (() => {
                      const badgeW = br.commitCount > 9 ? 22 : 18;
                      const badgeH = 15;
                      const badgeX = br.side === 1 ? 8 : -8 - badgeW;
                      const badgeY = -badgeH / 2;

                      return (
                        <g
                          transform={`translate(${badgeX}, ${badgeY})`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleBranchCommits(br.node.name);
                          }}
                          style={{ cursor: "pointer" }}
                        >
                          <rect
                            x="0"
                            y="0"
                            width={badgeW}
                            height={badgeH}
                            rx={badgeH / 2}
                            fill={
                              isExpanded
                                ? br.color
                                : "var(--bg-surface, #ffffff)"
                            }
                            stroke={br.color}
                            strokeWidth="1.2"
                            style={{
                              filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.08))",
                              transition: "all 0.15s ease",
                            }}
                          />
                          <text
                            x={badgeW / 2}
                            y={badgeH / 2 + 0.5}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill={isExpanded ? "#ffffff" : br.color}
                            fontSize="9"
                            fontWeight="700"
                            fontFamily="system-ui, -apple-system, sans-serif"
                            style={{ pointerEvents: "none" }}
                          >
                            {br.commitCount}
                          </text>
                          <title>{`${isExpanded ? "Ocultar" : "Mostrar"} ${br.commitCount} commit(s) desta versão`}</title>
                        </g>
                      );
                    })()}

                  {/* Nome da Branch com halo protetor contra a linha que passa por trás */}
                  {(() => {
                    const hasBadge = br.commitCount > 0;
                    const badgeW = hasBadge
                      ? br.commitCount > 9
                        ? 22
                        : 18
                      : 0;
                    const textX =
                      br.side === 1
                        ? hasBadge
                          ? 8 + badgeW + 6
                          : 10
                        : hasBadge
                          ? -8 - badgeW - 6
                          : -10;

                    const labelText = br.isCurrent
                      ? `● ${displayName}${br.isMerged ? " ✓" : ""}`
                      : `${displayName}${br.isMerged ? " ✓" : ""}`;
                    const pillW = Math.max(44, Math.min(labelText.length * 6.8 + 16, 156));
                    const pillX = br.side === 1 ? textX - 4 : textX - pillW + 4;

                    return br.isCurrent ? (
                      <g
                        style={{
                          filter: `drop-shadow(0 2px 6px ${br.color}55)`,
                        }}
                      >
                        <rect
                          x={pillX}
                          y="-11"
                          width={pillW}
                          height="22"
                          rx="11"
                          fill={br.color}
                        />
                        <text
                          x={br.side === 1 ? pillX + 9 : pillX + pillW - 9}
                          y="0.5"
                          textAnchor={br.side === 1 ? "start" : "end"}
                          dominantBaseline="central"
                          fill="#ffffff"
                          fontSize="11"
                          fontWeight="700"
                          fontFamily="system-ui, -apple-system, sans-serif"
                          style={{ letterSpacing: "-0.01em" }}
                        >
                          {labelText}
                        </text>
                      </g>
                    ) : (
                      <text
                        x={textX}
                        y="0"
                        textAnchor={br.side === 1 ? "start" : "end"}
                        dominantBaseline="central"
                        fill={br.color}
                        fontSize="11"
                        fontWeight={isSelectedBranch ? "700" : "600"}
                        fontFamily="system-ui, -apple-system, sans-serif"
                        style={{
                          letterSpacing: "-0.01em",
                          paintOrder: "stroke fill",
                          stroke: "var(--bg-surface, #ffffff)",
                          strokeWidth: "3.5px",
                          strokeLinejoin: "round",
                        }}
                      >
                        {labelText}
                      </text>
                    );
                  })()}
                </g>

                {/* Commits individuais da Branch na haste vertical (somente se a branch estiver expandida) */}
                {isExpanded &&
                  br.commits.map((bc) => {
                    const commitNodeId = `bcommit:${br.node.name}:${bc.commit.hash}`;
                    const isSelectedCommit = selectedNodeId === commitNodeId;
                    const isHoveredCommit = hoveredNodeId === commitNodeId;
                    const isMatch = matchesSearch(bc.commit.message);

                    return (
                      <g
                        key={`bcommit-${br.node.name}-${bc.commit.hash}`}
                        transform={`translate(${bc.x}, ${bc.y})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          isInternalClickRef.current = true;
                          setSelectedNodeId(commitNodeId);
                          onSelectCommit(bc.commit, br.node.name);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          onSwitchCommit(bc.commit, br.node.name);
                        }}
                        onMouseEnter={() => setHoveredNodeId(commitNodeId)}
                        onMouseLeave={() => setHoveredNodeId(null)}
                        style={{
                          cursor: "pointer",
                          opacity: isMatch ? 1 : 0.25,
                          transition: "opacity 0.15s ease",
                        }}
                      >
                        {/* Hitbox precisa */}
                        <rect
                          x={br.side === 1 ? -10 : -130}
                          y="-10"
                          width="140"
                          height="20"
                          fill="rgba(0, 0, 0, 0.001)"
                          style={{ pointerEvents: "all" }}
                        />

                        {/* Anel de seleção suave individual */}
                        {isSelectedCommit && (
                          <circle
                            cx="0"
                            cy="0"
                            r="9"
                            fill="none"
                            stroke={br.color}
                            strokeWidth="2"
                            opacity={0.4}
                          />
                        )}

                        {/* Nó do commit na haste da branch */}
                        <circle
                          cx="0"
                          cy="0"
                          r={isSelectedCommit || isHoveredCommit ? 5 : 3.6}
                          fill={isSelectedCommit ? br.color : "#ffffff"}
                          stroke={br.color}
                          strokeWidth="1.8"
                        />

                        {/* Etiqueta suave do commit: fonte menor, sem bordas, perto do nó */}
                        <text
                          x={br.side === 1 ? 10 : -10}
                          y="0"
                          textAnchor={br.side === 1 ? "start" : "end"}
                          dominantBaseline="central"
                          fill={
                            isSelectedCommit
                              ? br.color
                              : isHoveredCommit
                                ? "var(--text-heading)"
                                : "var(--text-secondary, #64748b)"
                          }
                          fontSize="10"
                          fontWeight={isSelectedCommit ? "600" : "500"}
                          fontFamily="system-ui, -apple-system, sans-serif"
                          style={{ letterSpacing: "-0.01em" }}
                        >
                          {bc.shortLabel}
                        </text>
                      </g>
                    );
                  })}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legenda de Cores Flutuante no Canto Inferior Esquerdo */}
      <VersionCanvasLegend />

      {/* Barra de Controles de Zoom Compacta no Canto Inferior Direito */}
      <VersionCanvasControls
        zoom={zoom}
        setZoom={setZoom}
        nodeSpacing={nodeSpacing}
        setNodeSpacing={setNodeSpacing}
        expandedBranchNames={expandedBranchNames}
        expandAll={expandAll}
        collapseAll={collapseAll}
        centerOnActive={centerOnActive}
      />
    </div>
  );
};

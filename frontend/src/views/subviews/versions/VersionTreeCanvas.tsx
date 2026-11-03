import React, { useState, useRef, useMemo } from "react";
import type { VersionNode, GitCommitInfo } from "../../../types";

export interface VersionTreeCanvasProps {
  nodes: VersionNode[];
  mainCommits?: GitCommitInfo[];
  selectedNodeName: string | null;
  onSelectNode: (node: VersionNode) => void;
  onSwitchNode?: (node: VersionNode) => void;
  onSelectCommit?: (commit: GitCommitInfo) => void;
}

interface VerticalBranchLayoutItem {
  node: VersionNode;
  level: number;
  side: -1 | 1; // -1 para Esquerda, 1 para Direita
  branchX: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  labelTopY: number;
  mergeY: number;
  isMerged: boolean;
  color: string;
  mergedDate?: string;
}

// Conector ortogonal vertical com quinas arredondadas a 90 graus (estilo Mind Map vertical Sul -> Norte)
function getVerticalMindMapPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  radius = 6,
): string {
  if (Math.abs(startX - endX) < 1) {
    return `M ${startX} ${startY} L ${endX} ${endY}`;
  }

  const isGoingUp = endY < startY;
  const dy = Math.abs(endY - startY);
  const dirY = isGoingUp ? -1 : 1;
  const cornerOffset = Math.min(Math.max(dy * 0.35, 8), 20);
  const cornerY = startY + dirY * cornerOffset;
  const r = Math.min(radius, Math.abs(endX - startX) / 2, dy / 2);
  const isGoingRight = endX > startX;

  if (isGoingUp) {
    // Crescendo de baixo para cima (Sul para Norte)
    if (isGoingRight) {
      return (
        `M ${startX} ${startY} ` +
        `L ${startX} ${cornerY + r} ` +
        `Q ${startX} ${cornerY}, ${startX + r} ${cornerY} ` +
        `L ${endX - r} ${cornerY} ` +
        `Q ${endX} ${cornerY}, ${endX} ${cornerY - r} ` +
        `L ${endX} ${endY}`
      );
    } else {
      return (
        `M ${startX} ${startY} ` +
        `L ${startX} ${cornerY + r} ` +
        `Q ${startX} ${cornerY}, ${startX - r} ${cornerY} ` +
        `L ${endX + r} ${cornerY} ` +
        `Q ${endX} ${cornerY}, ${endX} ${cornerY - r} ` +
        `L ${endX} ${endY}`
      );
    }
  } else {
    // Caso padrão descendo
    if (isGoingRight) {
      return (
        `M ${startX} ${startY} ` +
        `L ${startX} ${cornerY - r} ` +
        `Q ${startX} ${cornerY}, ${startX + r} ${cornerY} ` +
        `L ${endX - r} ${cornerY} ` +
        `Q ${endX} ${cornerY}, ${endX} ${cornerY + r} ` +
        `L ${endX} ${endY}`
      );
    } else {
      return (
        `M ${startX} ${startY} ` +
        `L ${startX} ${cornerY - r} ` +
        `Q ${startX} ${cornerY}, ${startX - r} ${cornerY} ` +
        `L ${endX + r} ${cornerY} ` +
        `Q ${endX} ${cornerY}, ${endX} ${cornerY + r} ` +
        `L ${endX} ${endY}`
      );
    }
  }
}

// Retorno ortogonal de Merge para a linha central (Sul -> Norte)
function getVerticalMergePath(
  endX: number,
  endY: number,
  trunkX: number,
  mergeY: number,
  radius = 6,
): string {
  if (Math.abs(endX - trunkX) < 1) {
    return `M ${endX} ${endY} L ${trunkX} ${mergeY}`;
  }

  const isGoingUp = mergeY < endY;
  const dy = Math.abs(mergeY - endY);
  const dirY = isGoingUp ? -1 : 1;
  const cornerOffset = Math.min(Math.max(dy * 0.5, 8), 18);
  const cornerY = endY + dirY * cornerOffset;
  const r = Math.min(radius, Math.abs(trunkX - endX) / 2, dy / 2);
  const isGoingLeftToCenter = endX > trunkX;

  if (isGoingUp) {
    // Subindo de volta para o tronco central
    if (isGoingLeftToCenter) {
      return (
        `M ${endX} ${endY} ` +
        `L ${endX} ${cornerY + r} ` +
        `Q ${endX} ${cornerY}, ${endX - r} ${cornerY} ` +
        `L ${trunkX + r} ${cornerY} ` +
        `Q ${trunkX} ${cornerY}, ${trunkX} ${cornerY - r} ` +
        `L ${trunkX} ${mergeY}`
      );
    } else {
      return (
        `M ${endX} ${endY} ` +
        `L ${endX} ${cornerY + r} ` +
        `Q ${endX} ${cornerY}, ${endX + r} ${cornerY} ` +
        `L ${trunkX - r} ${cornerY} ` +
        `Q ${trunkX} ${cornerY}, ${trunkX} ${cornerY - r} ` +
        `L ${trunkX} ${mergeY}`
      );
    }
  } else {
    // Caso padrão descendo
    if (isGoingLeftToCenter) {
      return (
        `M ${endX} ${endY} ` +
        `L ${endX} ${cornerY - r} ` +
        `Q ${endX} ${cornerY}, ${endX - r} ${cornerY} ` +
        `L ${trunkX + r} ${cornerY} ` +
        `Q ${trunkX} ${cornerY}, ${trunkX} ${cornerY + r} ` +
        `L ${trunkX} ${mergeY}`
      );
    } else {
      return (
        `M ${endX} ${endY} ` +
        `L ${endX} ${cornerY - r} ` +
        `Q ${endX} ${cornerY}, ${endX + r} ${cornerY} ` +
        `L ${trunkX - r} ${cornerY} ` +
        `Q ${trunkX} ${cornerY}, ${trunkX} ${cornerY + r} ` +
        `L ${trunkX} ${mergeY}`
      );
    }
  }
}

function formatMergeDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month} ${hours}:${minutes}`;
  } catch {
    return "";
  }
}

export function cleanCommitTitle(text?: string): string {
  if (!text) return "";
  return (
    text
      .replace(
        /^(\[?(PR|pr|pull request|pull|pr#|pr-)[\s#:]*\d+\]?[:\s-]*)/i,
        "",
      )
      .replace(/^([0-9a-f]{7,40}[:\s-]*)/i, "")
      .replace(
        /^(merge pull request #\d+ from [^\n]+|merge branch [^\n]+)/i,
        "Merge de versão",
      )
      .trim() || text
  );
}

export const VersionTreeCanvas: React.FC<VersionTreeCanvasProps> = ({
  nodes,
  mainCommits = [],
  selectedNodeName,
  onSelectNode,
  onSwitchNode,
  onSelectCommit,
}) => {
  // Controle de Pan e Zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 380, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredNodeName, setHoveredNodeName] = useState<string | null>(null);
  const [hoveredCommitHash, setHoveredCommitHash] = useState<string | null>(
    null,
  );
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(
    null,
  );
  const [scaleMode, setScaleMode] = useState<"compact" | "normal" | "wide">(
    "normal",
  );
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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

  // Scroll do mouse: sobe e desce verticalmente por padrão. Com Ctrl/Meta faz zoom, com Shift faz horizontal
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Zoom com Ctrl/Cmd ou pinch do trackpad
      const factor = e.deltaY < 0 ? 1.04 : 0.96;
      setZoom((prev) => Math.min(Math.max(prev * factor, 0.35), 2.5));
    } else if (e.shiftKey) {
      // Pan horizontal com Shift
      setPan((prev) => ({
        ...prev,
        x: prev.x - e.deltaY,
      }));
    } else {
      // Pan vertical padrão: sobe e desce o Canvas confortavelmente
      setPan((prev) => ({
        ...prev,
        y: prev.y - e.deltaY,
      }));
    }
  };

  // Escala sincronizada: fontes compactas, raios e espaçamentos equilibrados
  const scaleProps = useMemo(() => {
    switch (scaleMode) {
      case "compact":
        return {
          stepY: 38,
          levelWidth: 65,
          fontSize: 7,
          labelHeight: 12,
          nodeRadius: 4.5,
          commitRadius: 2.8,
          dateFontSize: 5,
        };
      case "wide":
        return {
          stepY: 66,
          levelWidth: 105,
          fontSize: 8.5,
          labelHeight: 16,
          nodeRadius: 6.5,
          commitRadius: 4,
          dateFontSize: 6.5,
        };
      case "normal":
      default:
        return {
          stepY: 52,
          levelWidth: 85,
          fontSize: 7.5,
          labelHeight: 14,
          nodeRadius: 5.5,
          commitRadius: 3.2,
          dateFontSize: 5.6,
        };
    }
  }, [scaleMode]);

  // Layout Vertical da Árvore: Orientação Sul -> Norte (de Baixo para Cima como uma árvore real)
  const layout = useMemo(() => {
    if (!nodes || nodes.length === 0) {
      return {
        trunkX: 0,
        trunkBaseY: 500,
        trunkTopY: 50,
        totalHeight: 600,
        defaultNode: null,
        branches: [],
        trunkCommits: [],
      };
    }

    const defaultNode = nodes.find((n) => n.isDefault) || nodes[0];
    const otherNodes = nodes.filter((n) => n.name !== defaultNode.name);

    // Mapeamento de níveis (gerações)
    const nodeLevelMap = new Map<string, number>();
    nodeLevelMap.set(defaultNode.name, 0);

    function getNodeLevel(name: string): number {
      if (nodeLevelMap.has(name)) return nodeLevelMap.get(name)!;
      const n = nodes.find((x) => x.name === name);
      if (!n || !n.parentBranch || n.parentBranch === defaultNode.name) {
        nodeLevelMap.set(name, 1);
        return 1;
      }
      const lvl = 1 + getNodeLevel(n.parentBranch);
      nodeLevelMap.set(name, lvl);
      return lvl;
    }

    // Ordenação cronológica para crescimento de baixo para cima
    const sortedOtherNodes = [...otherNodes].sort((a, b) => {
      const timeA = a.baseDate
        ? new Date(a.baseDate).getTime()
        : a.lastCommit?.date
          ? new Date(a.lastCommit.date).getTime()
          : 0;
      const timeB = b.baseDate
        ? new Date(b.baseDate).getTime()
        : b.lastCommit?.date
          ? new Date(b.lastCommit.date).getTime()
          : 0;
      if (timeA && timeB && timeA !== timeB) return timeA - timeB;
      return a.name.localeCompare(b.name);
    });

    const TRUNK_X = 0;
    const directBranches = sortedOtherNodes.filter((b) => {
      const parent = b.parentBranch;
      return !parent || parent === defaultNode.name;
    });

    const validMainCommits = (mainCommits || []).slice(0, 30);
    const totalSteps = Math.max(
      directBranches.length + 1,
      Math.ceil(validMainCommits.length * 0.75) + 1,
      6,
    );
    const totalHeight = totalSteps * scaleProps.stepY + 160;
    const trunkBaseY = totalHeight - 60; // Sul (raiz/base da árvore)

    // Posições dos commits da Principal com espaçamento mínimo garantido para evitar sobreposição de datas
    const commitStep = Math.max(scaleProps.stepY * 0.72, 20);
    const trunkCommits = validMainCommits.map((c, i) => {
      const fromBaseIndex = validMainCommits.length - i;
      return {
        ...c,
        y: trunkBaseY - fromBaseIndex * commitStep - 20,
      };
    });

    // Mapa de posições salvas dos nós
    const branchPosMap = new Map<
      string,
      { branchX: number; endY: number; labelTopY: number; side: -1 | 1 }
    >();
    branchPosMap.set(defaultNode.name, {
      branchX: TRUNK_X,
      endY: trunkBaseY,
      labelTopY: trunkBaseY - scaleProps.labelHeight - 6,
      side: 1,
    });

    const branches: VerticalBranchLayoutItem[] = [];
    let directBranchCount = 0;

    sortedOtherNodes.forEach((bNode) => {
      const level = getNodeLevel(bNode.name);
      const parentName = bNode.parentBranch;
      const parentPos = parentName ? branchPosMap.get(parentName) : null;
      const isSubBranch = Boolean(parentPos && parentName !== defaultNode.name);

      let side: -1 | 1;
      let branchX: number;
      let startX: number;
      let startY: number;
      let branchLength = scaleProps.stepY * 0.85;

      if (isSubBranch && parentPos) {
        // Galho derivado de outro galho:
        // Mantém o mesmo lado do pai (esquerda ou direita)
        side = parentPos.side;
        startX = parentPos.branchX;
        startY = parentPos.endY; // Nasce diretamente da bolinha da versão pai

        // Calcular a largura da etiqueta do pai para garantir que o nível filho sempre fique além dela
        const parentLabelWidth = Math.max(
          (parentName?.length || 10) * (scaleProps.fontSize * 0.58) + 12,
          38,
        );
        const minLevelOffset = parentLabelWidth + scaleProps.nodeRadius * 2 + 18;

        // Identifica irmãos (outros galhos derivados deste mesmo pai já posicionados)
        const siblingBranches = branches.filter((br) => br.node.parentBranch === parentName);
        const siblingIndex = siblingBranches.length;

        // Afastamento horizontal: garante que fique além da etiqueta do pai + pequeno escalonamento por irmão
        const horizontalOffset =
          Math.max(minLevelOffset, scaleProps.levelWidth) + siblingIndex * 16;
        branchX = parentPos.branchX + side * horizontalOffset;

        // Escalonamento vertical por irmão para que múltiplos galhos do mesmo nó pai nunca se sobreponham
        if (siblingIndex > 0) {
          branchLength += siblingIndex * (scaleProps.stepY * 0.75 + 10);
        }
      } else {
        // Galho direto do tronco Principal (Nível 1):
        // 1. Tentar localizar o commit exato no tronco (pelo baseHash ou pelo commit de origem)
        let baseCommit: (typeof trunkCommits)[0] | undefined;
        if (bNode.baseHash) {
          const bh = bNode.baseHash.toLowerCase();
          baseCommit = trunkCommits.find((c) => {
            const ch = c.hash.toLowerCase();
            const cs = (c.shortHash || "").toLowerCase();
            return (
              ch === bh ||
              cs === bh ||
              ch.startsWith(bh) ||
              bh.startsWith(ch) ||
              (cs && bh.startsWith(cs))
            );
          });
        }

        // 2. Se for um rascunho sem commits próprios (ahead === 0) ou se ainda não achou, checar pelo último commit dele
        if (
          !baseCommit &&
          (bNode.ahead === 0 || bNode.type === "draft") &&
          bNode.lastCommit?.hash
        ) {
          const lh = bNode.lastCommit.hash.toLowerCase();
          const ls = (bNode.lastCommit.shortHash || "").toLowerCase();
          baseCommit = trunkCommits.find((c) => {
            const ch = c.hash.toLowerCase();
            const cs = (c.shortHash || "").toLowerCase();
            return (
              ch === lh ||
              cs === lh ||
              (ls && (ch === ls || cs === ls || ch.startsWith(ls))) ||
              ch.startsWith(lh) ||
              lh.startsWith(ch) ||
              (cs && lh.startsWith(cs))
            );
          });
        }

        // 3. Se ainda não achou por hash mas temos baseDate, aproximar pelo commit mais próximo no tempo
        if (!baseCommit && bNode.baseDate) {
          const bTime = new Date(bNode.baseDate).getTime();
          if (!isNaN(bTime)) {
            let closestCommit: (typeof trunkCommits)[0] | undefined;
            let minDiff = Infinity;
            for (const c of trunkCommits) {
              if (c.date) {
                const diff = Math.abs(new Date(c.date).getTime() - bTime);
                if (diff < minDiff) {
                  minDiff = diff;
                  closestCommit = c;
                }
              }
            }
            if (closestCommit && minDiff < 180000) {
              baseCommit = closestCommit;
            }
          }
        }

        // Se o commit de origem foi encontrado no tronco, o galho nasce exatamente nele!
        if (baseCommit) {
          startY = baseCommit.y;
        } else {
          // Fallback sequencial se o commit ancestral for mais antigo que os 30 commits exibidos
          startY = trunkBaseY - (directBranchCount + 1) * scaleProps.stepY;
        }

        // Alternância inteligente de lado (Direita / Esquerda) evitando colisão na mesma altura
        const defaultSide: -1 | 1 = directBranchCount % 2 === 0 ? 1 : -1;
        directBranchCount++;

        const isCollision = (s: -1 | 1, y: number, margin = 26) => {
          return branches.some(
            (prev) => prev.side === s && Math.abs(prev.startY - y) < margin,
          );
        };

        if (isCollision(defaultSide, startY)) {
          const otherSide: -1 | 1 = defaultSide === 1 ? -1 : 1;
          side = !isCollision(otherSide, startY) ? otherSide : defaultSide;
        } else {
          side = defaultSide;
        }

        // Afastamento horizontal (lane) se houver múltiplos galhos na mesma altura e lado
        const nearSameSideBranches = branches.filter(
          (prev) => prev.side === side && Math.abs(prev.startY - startY) < 32,
        );
        const lane = 1 + nearSameSideBranches.length;
        if (lane > 1) {
          branchLength += (lane - 1) * (scaleProps.stepY * 0.65 + 6);
        }

        branchX = TRUNK_X + side * lane * scaleProps.levelWidth;
        startX = TRUNK_X;
      }

      // Extensão vertical compacta subindo para o Norte (Sul -> Norte)
      const endX = branchX;
      const endY = startY - branchLength;

      // Ponto de retorno de merge ao tronco central mais acima (Norte)
      let mergeY = endY - scaleProps.stepY * 0.55;
      if (bNode.isMerged && bNode.mergedDate) {
        const mTime = new Date(bNode.mergedDate).getTime();
        if (!isNaN(mTime)) {
          let closestMergeCommit: (typeof trunkCommits)[0] | undefined;
          let minDiff = Infinity;
          for (const c of trunkCommits) {
            if (c.date) {
              const diff = Math.abs(new Date(c.date).getTime() - mTime);
              if (diff < minDiff) {
                minDiff = diff;
                closestMergeCommit = c;
              }
            }
          }
          if (
            closestMergeCommit &&
            minDiff < 180000 &&
            closestMergeCommit.y < endY
          ) {
            mergeY = closestMergeCommit.y;
          }
        }
      }

      // Topo virtual da etiqueta (mantido para limites e cálculos de bounding box)
      const labelTopY = endY - scaleProps.labelHeight;

      // Cores semafóricas:
      // Verde: Mergeada na Principal
      // Laranja: Tem commits próprios e não está mergeada (ahead > 0 ou proposal)
      // Roxo: Rascunho inicial sem commits ainda (ahead === 0)
      let color = "#8b5cf6"; // roxo para rascunhos
      if (bNode.isMerged) {
        color = "#10b981"; // verde para mergeadas
      } else if (bNode.ahead > 0 || bNode.type === "proposal") {
        color = "#f59e0b"; // laranja para branches com commits pendentes
      }

      branches.push({
        node: bNode,
        level,
        side,
        branchX,
        startX,
        startY,
        endX,
        endY,
        labelTopY,
        mergeY,
        isMerged: Boolean(bNode.isMerged),
        color,
        mergedDate: bNode.mergedDate,
      });

      branchPosMap.set(bNode.name, { branchX, endY, labelTopY, side });
    });

    const minBranchY = branches.reduce(
      (min, b) => Math.min(min, b.isMerged ? b.mergeY : b.labelTopY),
      trunkBaseY - 100,
    );
    const minCommitY =
      trunkCommits.length > 0
        ? Math.min(...trunkCommits.map((c) => c.y))
        : trunkBaseY - 100;
    const trunkTopY = Math.max(Math.min(minBranchY, minCommitY) - 40, 40);

    return {
      trunkX: TRUNK_X,
      trunkBaseY,
      trunkTopY,
      totalHeight,
      defaultNode,
      branches,
      trunkCommits,
    };
  }, [nodes, mainCommits, scaleProps]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#f8fafc", // Fundo Light
        userSelect: "none",
        cursor: isDragging ? "grabbing" : "grab",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Barra Flutuante de Controles: Zoom com Lupas Destacadas, Navegação e Escala */}
      <div
        style={{
          position: "absolute",
          bottom: "16px",
          left: "16px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          zIndex: 10,
        }}
      >
        {/* Controles de Zoom com Lupas de Alta Definição e Destaque */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "3px",
            background: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(8px)",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            padding: "3px 6px",
            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.08)",
          }}
        >
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(z * 1.15, 2.5))}
            title="Aumentar zoom (ou use Ctrl + Scroll)"
            style={{
              border: "none",
              background: "transparent",
              color: "#1e293b",
              padding: "4px 6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              borderRadius: "4px",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "19px" }}>
              zoom_in
            </span>
          </button>

          <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", minWidth: "36px", textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </span>

          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(z * 0.85, 0.35))}
            title="Diminuir zoom (ou use Ctrl + Scroll)"
            style={{
              border: "none",
              background: "transparent",
              color: "#1e293b",
              padding: "4px 6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              borderRadius: "4px",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "19px" }}>
              zoom_out
            </span>
          </button>

          <div style={{ width: "1px", height: "18px", background: "#e2e8f0", margin: "0 2px" }} />

          <button
            type="button"
            onClick={() => {
              setPan((p) => ({ ...p, y: 140 - layout.trunkTopY * zoom }));
            }}
            title="Navegar para o Topo (Fim)"
            style={{
              border: "none",
              background: "transparent",
              color: "#2563eb",
              padding: "3px 7px",
              fontSize: "11px",
              cursor: "pointer",
              fontWeight: 700,
              borderRadius: "4px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(37, 99, 235, 0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Topo ↑
          </button>

          <button
            type="button"
            onClick={() => {
              setPan((p) => ({ ...p, y: 460 - layout.trunkBaseY * zoom }));
            }}
            title="Navegar para o Início (Base)"
            style={{
              border: "none",
              background: "transparent",
              color: "#475569",
              padding: "3px 7px",
              fontSize: "11px",
              cursor: "pointer",
              fontWeight: 600,
              borderRadius: "4px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Início ↓
          </button>

          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 380, y: 80 });
            }}
            title="Centralizar Visualização"
            style={{
              border: "none",
              background: "transparent",
              color: "#64748b",
              padding: "3px 6px",
              fontSize: "11px",
              cursor: "pointer",
              borderRadius: "4px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Reset
          </button>
        </div>

        {/* Seletor de Escala */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2px",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
            padding: "3px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            fontSize: "11px",
          }}
        >
          <span style={{ padding: "0 4px", color: "#64748b", fontWeight: 600 }}>
            Escala:
          </span>
          {(["compact", "normal", "wide"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setScaleMode(m)}
              style={{
                border: "none",
                background: scaleMode === m ? "#2563eb" : "transparent",
                color: scaleMode === m ? "#ffffff" : "#475569",
                borderRadius: "4px",
                padding: "2px 7px",
                fontSize: "10px",
                fontWeight: scaleMode === m ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {m === "compact"
                ? "Compacta"
                : m === "normal"
                  ? "Normal"
                  : "Ampla"}
            </button>
          ))}
        </div>
      </div>

      <svg
        width="100%"
        height="100%"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <defs>
          {/* Grid pontilhado suave Light */}
          <pattern
            id="canvas-dots-light"
            x="0"
            y="0"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1.1" fill="#cbd5e1" opacity="0.75" />
          </pattern>
        </defs>

        <rect
          id="canvas-bg"
          width="100%"
          height="100%"
          fill="url(#canvas-dots-light)"
        />

        {/* Camada Transformada por Pan e Zoom */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* TRONCO PRINCIPAL VERTICAL (CRESCENDO DE SUL PARA NORTE) */}
          <line
            x1={layout.trunkX}
            y1={layout.trunkTopY}
            x2={layout.trunkX}
            y2={layout.trunkBaseY}
            stroke="#2563eb"
            strokeWidth="3.5"
            strokeLinecap="round"
          />

          {/* TODAS AS BOLINHAS DE COMMITS DA PRINCIPAL (CLICÁVEIS COM HIGHLIGHT) */}
          {layout.trunkCommits.map((c) => {
            const isHovered = hoveredCommitHash === c.hash;
            const isSelected = selectedCommitHash === c.hash;
            const cleanMsg = cleanCommitTitle(c.message);

            return (
              <g
                key={c.hash}
                transform={`translate(${layout.trunkX}, ${c.y})`}
                onClick={() => {
                  setSelectedCommitHash(c.hash);
                  onSelectCommit?.(c);
                }}
                onMouseEnter={() => setHoveredCommitHash(c.hash)}
                onMouseLeave={() => setHoveredCommitHash(null)}
                style={{ cursor: "pointer" }}
              >
                {/* Hitbox ampla invisível para clique e hover confortáveis */}
                <circle cx="0" cy="0" r="16" fill="transparent" />

                {/* Data e horário do commit ao lado da bolinha */}
                {c.date && (
                  <text
                    x="-9"
                    y="3"
                    textAnchor="end"
                    fill="#94a3b8"
                    fontSize={scaleProps.dateFontSize}
                    fontWeight="500"
                  >
                    {formatMergeDate(c.date)}
                  </text>
                )}

                {/* Highlight ao passar o mouse ou selecionar */}
                {(isHovered || isSelected) && (
                  <circle
                    cx="0"
                    cy="0"
                    r={scaleProps.commitRadius + 5}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2"
                    opacity="0.6"
                  />
                )}

                {/* Bolinha do commit */}
                <circle
                  cx="0"
                  cy="0"
                  r={
                    isHovered || isSelected
                      ? scaleProps.commitRadius + 2
                      : scaleProps.commitRadius
                  }
                  fill={isHovered || isSelected ? "#3b82f6" : "#2563eb"}
                  stroke="#ffffff"
                  strokeWidth={isHovered || isSelected ? "2.2" : "1.2"}
                  style={{ transition: "all 0.15s ease" }}
                />

                {/* Tooltip sutil e flutuante no hover (sem hash, apenas título limpo) */}
                {isHovered && (
                  <g
                    transform="translate(10, -10)"
                    style={{ pointerEvents: "none" }}
                  >
                    <rect
                      x="0"
                      y="0"
                      width={Math.min(cleanMsg.length * 5.8 + 16, 240)}
                      height="16"
                      rx="3"
                      fill="#1e293b"
                      opacity="0.9"
                    />
                    <text
                      x="6"
                      y="11"
                      fill="#f8fafc"
                      fontSize="8"
                      fontWeight="500"
                    >
                      {cleanMsg.length > 34
                        ? `${cleanMsg.slice(0, 34)}...`
                        : cleanMsg}
                    </text>
                  </g>
                )}

                <title>{`${cleanMsg} (${c.author})`}</title>
              </g>
            );
          })}

          {/* NÓ FIM (TOPO DA ÁRVORE NO NORTE) */}
          <g transform={`translate(${layout.trunkX}, ${layout.trunkTopY})`}>
            <circle
              cx="0"
              cy="0"
              r={scaleProps.nodeRadius}
              fill="#2563eb"
              stroke="#ffffff"
              strokeWidth="2"
            />
            <rect
              x="-18"
              y={-scaleProps.labelHeight - 6}
              width="36"
              height={scaleProps.labelHeight}
              rx={scaleProps.labelHeight / 2}
              fill="#1e293b"
            />
            <text
              x="0"
              y={-scaleProps.labelHeight - 6 + scaleProps.labelHeight * 0.7}
              textAnchor="middle"
              fill="#ffffff"
              fontSize={scaleProps.fontSize - 0.5}
              fontWeight="700"
            >
              Fim
            </text>
          </g>

          {/* NÓ INÍCIO (RAIZ DA ÁRVORE NO SUL / BASE) */}
          {layout.defaultNode && (
            <g
              transform={`translate(${layout.trunkX}, ${layout.trunkBaseY})`}
              onClick={() => onSelectNode(layout.defaultNode!)}
              onDoubleClick={() => onSwitchNode?.(layout.defaultNode!)}
              onMouseEnter={() => setHoveredNodeName(layout.defaultNode!.name)}
              onMouseLeave={() => setHoveredNodeName(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Hitbox ampla invisível */}
              <circle cx="0" cy="0" r="22" fill="transparent" />

              {layout.defaultNode.isCurrent && (
                <circle
                  cx="0"
                  cy="0"
                  r={scaleProps.nodeRadius + 6}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2"
                  opacity="0.6"
                />
              )}
              <circle
                cx="0"
                cy="0"
                r={scaleProps.nodeRadius + 1}
                fill="#2563eb"
                stroke="#ffffff"
                strokeWidth="2.5"
              />
              <rect
                x="-24"
                y="8"
                width="48"
                height={scaleProps.labelHeight}
                rx={scaleProps.labelHeight / 2}
                fill="#2563eb"
              />
              <text
                x="0"
                y={8 + scaleProps.labelHeight * 0.7}
                textAnchor="middle"
                fill="#ffffff"
                fontSize={scaleProps.fontSize}
                fontWeight="700"
              >
                Início
              </text>

              {/* Rótulo 'Ativa' no Início quando for a versão corrente */}
              {layout.defaultNode.isCurrent && (
                <g
                  transform={`translate(-19, ${8 + scaleProps.labelHeight + 4})`}
                >
                  <rect
                    x="0"
                    y="0"
                    width="38"
                    height={scaleProps.labelHeight - 2}
                    rx={(scaleProps.labelHeight - 2) / 2}
                    fill="#2563eb"
                  />
                  <text
                    x="19"
                    y={(scaleProps.labelHeight - 2) * 0.7}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize={scaleProps.fontSize - 1}
                    fontWeight="700"
                  >
                    Ativa
                  </text>
                </g>
              )}
            </g>
          )}

          {/* GALHOS DERIVADOS - CRESCIMENTO SUL -> NORTE (BAIXO PARA CIMA) */}
          {layout.branches.map((br) => {
            const isSelected = selectedNodeName === br.node.name;
            const isHovered = hoveredNodeName === br.node.name;
            const isCurrent = br.node.isCurrent;

            // Conector ortogonal vertical arredondado subindo de Sul para Norte
            const branchPath = getVerticalMindMapPath(
              br.startX,
              br.startY,
              br.endX,
              br.endY,
              6,
            );

            // Retorno ortogonal de Merge à linha central subindo para o Norte
            const mergePath = br.isMerged
              ? getVerticalMergePath(
                  br.endX,
                  br.endY,
                  layout.trunkX,
                  br.mergeY,
                  6,
                )
              : "";

            const labelWidth = Math.max(
              br.node.name.length * (scaleProps.fontSize * 0.58) + 12,
              38,
            );

            // Posicionamento LATERAL da etiqueta (lado externo da bolinha):
            // br.side === 1: Galho à direita -> Etiqueta fica à direita da bolinha
            // br.side === -1: Galho à esquerda -> Etiqueta fica à esquerda da bolinha
            // Isso deixa o fluxo vertical para o Norte (sub-galhos e merges) 100% desimpedido sem sobreposição de linhas!
            const labelX =
              br.side === 1
                ? br.endX + scaleProps.nodeRadius + 6
                : br.endX - scaleProps.nodeRadius - 6 - labelWidth;
            const labelY = br.endY - scaleProps.labelHeight / 2;

            const badgeX = br.side === 1 ? labelX : labelX + labelWidth - 36;
            const badgeY = labelY - scaleProps.labelHeight - 3;

            return (
              <g
                key={br.node.name}
                onClick={() => onSelectNode(br.node)}
                onDoubleClick={() => onSwitchNode?.(br.node)}
                onMouseEnter={() => setHoveredNodeName(br.node.name)}
                onMouseLeave={() => setHoveredNodeName(null)}
                style={{ cursor: "pointer" }}
              >
                {/* Hitbox ampla invisível */}
                <path
                  d={branchPath}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="20"
                />

                {/* Traço Visível do Galho */}
                <path
                  d={branchPath}
                  fill="none"
                  stroke={br.color}
                  strokeWidth={isSelected || isHovered ? "3.5" : "1.8"}
                  strokeDasharray={
                    !br.isMerged &&
                    br.node.type === "draft" &&
                    br.node.ahead === 0
                      ? "4 3"
                      : undefined
                  }
                  opacity={isSelected || isHovered ? 1 : 0.85}
                  style={{
                    transition: "stroke-width 0.15s ease, opacity 0.15s ease",
                  }}
                />

                {/* Ponto de Bifurcação no Tronco Principal */}
                {br.startX === layout.trunkX && (
                  <circle
                    cx={br.startX}
                    cy={br.startY}
                    r={scaleProps.nodeRadius - 2.8}
                    fill={br.color}
                    stroke="#ffffff"
                    strokeWidth="1.2"
                  />
                )}

                {/* Retorno do Merge com Quina Arredondada (se unida à Principal) */}
                {br.isMerged && (
                  <path
                    d={mergePath}
                    fill="none"
                    stroke={br.color}
                    strokeWidth={isSelected || isHovered ? "2.5" : "1.6"}
                    opacity={isSelected || isHovered ? 1 : 0.75}
                  />
                )}

                {/* Ponto de Merge final no Tronco Central */}
                {br.isMerged && (
                  <g>
                    <circle
                      cx={layout.trunkX}
                      cy={br.mergeY}
                      r={scaleProps.nodeRadius - 2.5}
                      fill={br.color}
                      stroke="#ffffff"
                      strokeWidth="1.2"
                    />

                    {/* Data e horário do merge: posicionado sempre à direita do tronco para nunca colidir com commits */}
                    {br.mergedDate && (
                      <g
                        transform={`translate(${layout.trunkX + 8}, ${br.mergeY + 3})`}
                      >
                        <text
                          x="0"
                          y="0"
                          textAnchor="start"
                          fill="#94a3b8"
                          fontSize={scaleProps.dateFontSize}
                          fontWeight="500"
                        >
                          {formatMergeDate(br.mergedDate)}
                        </text>
                      </g>
                    )}
                  </g>
                )}

                {/* NÓ DA VERSÃO (PONTO DO GALHO) */}
                <circle cx={br.endX} cy={br.endY} r="18" fill="transparent" />

                {isCurrent && (
                  <circle
                    cx={br.endX}
                    cy={br.endY}
                    r={scaleProps.nodeRadius + 5}
                    fill="none"
                    stroke={br.color}
                    strokeWidth="1.8"
                    opacity="0.65"
                  />
                )}

                <circle
                  cx={br.endX}
                  cy={br.endY}
                  r={
                    isSelected || isHovered
                      ? scaleProps.nodeRadius + 1
                      : scaleProps.nodeRadius
                  }
                  fill={br.color}
                  stroke="#ffffff"
                  strokeWidth={isSelected || isHovered ? "2.2" : "1.8"}
                  style={{ transition: "all 0.15s ease" }}
                />

                {/* ETIQUETA LATERAL COMPACTA DA VERSÃO (NUNCA CORTA LINHAS VERTICAIS) */}
                <g
                  transform={`translate(${labelX}, ${labelY})`}
                >
                  <rect
                    x="0"
                    y="0"
                    width={labelWidth}
                    height={scaleProps.labelHeight}
                    rx={scaleProps.labelHeight / 2}
                    fill={isSelected || isHovered ? br.color : "#ffffff"}
                    stroke={br.color}
                    strokeWidth="1.1"
                    style={{
                      filter:
                        isSelected || isHovered
                          ? "drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
                          : undefined,
                      transition: "all 0.15s ease",
                    }}
                  />
                  <text
                    x={labelWidth / 2}
                    y={scaleProps.labelHeight * 0.7}
                    textAnchor="middle"
                    fill={isSelected || isHovered ? "#ffffff" : "#1e293b"}
                    fontSize={scaleProps.fontSize}
                    fontWeight="600"
                  >
                    {br.node.name}
                  </text>
                </g>

                {/* Rótulo 'Ativa' acima da etiqueta quando for a versão corrente */}
                {isCurrent && (
                  <g
                    transform={`translate(${badgeX}, ${badgeY})`}
                  >
                    <rect
                      x="0"
                      y="0"
                      width="36"
                      height={scaleProps.labelHeight - 2}
                      rx={(scaleProps.labelHeight - 2) / 2}
                      fill="#2563eb"
                    />
                    <text
                      x="18"
                      y={(scaleProps.labelHeight - 2) * 0.72}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize={scaleProps.fontSize - 0.8}
                      fontWeight="700"
                    >
                      Ativa
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
export default VersionTreeCanvas;

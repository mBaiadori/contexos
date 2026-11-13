import type { GitGraphCommit, GitGraphCommitBranch } from "../../../types";

export interface GraphEdge {
  id: string;
  fromLane: number;
  fromRow: number;
  toLane: number;
  toRow: number;
  color: string;
  isMerge: boolean;
}

export interface GraphRow {
  commit: GitGraphCommit;
  row: number;
  lane: number;
  color: string;
  isHead: boolean;
  isMainTip: boolean;
  branches: GitGraphCommitBranch[];
}

export interface GraphLayout {
  rows: GraphRow[];
  edges: GraphEdge[];
  laneCount: number;
}

// Paleta harmoniosa e de alto contraste inspirada em design moderno
export const LANE_COLORS = [
  "#2563eb", // Azul royal (Lane 0 / Linha Principal)
  "#8b5cf6", // Violeta / Roxo
  "#059669", // Verde Esmeralda
  "#d97706", // Âmbar / Laranja
  "#0891b2", // Ciano escuro
  "#e11d48", // Rosa rubi
  "#4f46e5", // Índigo
  "#0d9488", // Teal
];

export function getLaneColor(laneIndex: number): string {
  return LANE_COLORS[laneIndex % LANE_COLORS.length];
}

/**
 * Atribui colunas (lanes) e calcula conexões (arestas) no DAG real de commits
 */
export function layoutGitGraph(commits: GitGraphCommit[]): GraphLayout {
  if (!commits || commits.length === 0) {
    return { rows: [], edges: [], laneCount: 1 };
  }

  // Mapa de hash para row index
  const commitRowMap = new Map<string, number>();
  commits.forEach((c, idx) => {
    commitRowMap.set(c.hash, idx);
  });

  // activeLanes[lane] = hash do commit que este lane está esperando
  const activeLanes: (string | null)[] = [];
  const rows: GraphRow[] = [];
  const edges: GraphEdge[] = [];

  for (let rowIndex = 0; rowIndex < commits.length; rowIndex++) {
    const commit = commits[rowIndex];
    const hash = commit.hash;

    // 1. Encontra qual lane estava esperando este commit
    let assignedLane = activeLanes.indexOf(hash);

    if (assignedLane === -1) {
      // Nenhum lane ativo estava esperando por ele: encontra o primeiro lane livre
      // Se for lineage da main e lane 0 estiver livre, ocupa lane 0
      if (commit.isMainLineage && activeLanes[0] === null) {
        assignedLane = 0;
      } else {
        assignedLane = activeLanes.indexOf(null);
        if (assignedLane === -1) {
          assignedLane = activeLanes.length;
          activeLanes.push(null);
        }
      }
    }

    // Libera a reserva no lane atual
    activeLanes[assignedLane] = null;

    const rowColor = getLaneColor(assignedLane);

    rows.push({
      commit,
      row: rowIndex,
      lane: assignedLane,
      color: rowColor,
      isHead: Boolean(commit.isHead),
      isMainTip: Boolean(commit.isMainTip),
      branches: commit.branches || [],
    });

    // 2. Conecta aos pais e reserva lanes para eles
    const parents = commit.parents || [];
    parents.forEach((parentHash, pIdx) => {
      const parentRow = commitRowMap.get(parentHash);
      if (parentRow === undefined) {
        // Pai está além do limite de histórico carregado
        return;
      }

      // Verifica se o pai já tem um lane atribuído
      let parentLane = activeLanes.indexOf(parentHash);
      const isParentMain = Boolean(commits[parentRow]?.isMainLineage);

      if (parentLane !== -1 && parentLane !== 0 && isParentMain && assignedLane === 0) {
        // Promove o commit ancestral da linha principal para o lane 0 contínuo
        activeLanes[parentLane] = null;
        parentLane = 0;
        activeLanes[0] = parentHash;
      } else if (parentLane === -1) {
        if (isParentMain && (activeLanes[0] === null || activeLanes[0] === parentHash)) {
          parentLane = 0;
          activeLanes[0] = parentHash;
        } else if (pIdx === 0 && activeLanes[assignedLane] === null) {
          // O primeiro pai continua no mesmo lane do commit atual
          parentLane = assignedLane;
          activeLanes[parentLane] = parentHash;
        } else {
          // Outros pais (ex: em merges) procuram o primeiro lane vago (evitando lane 0 se o pai não for da main)
          const startIndex = activeLanes[0] === null ? 1 : 0;
          let freeLane = -1;
          for (let l = startIndex; l < activeLanes.length; l++) {
            if (activeLanes[l] === null) {
              freeLane = l;
              break;
            }
          }
          if (freeLane === -1 && activeLanes[0] === null) {
            freeLane = 0;
          }
          if (freeLane === -1) {
            freeLane = activeLanes.length;
            activeLanes.push(null);
          }
          parentLane = freeLane;
          activeLanes[parentLane] = parentHash;
        }
      }

      // Aresta do commit atual até o pai
      const edgeColor = pIdx === 0 ? rowColor : getLaneColor(parentLane);
      edges.push({
        id: `${commit.hash}-${parentHash}-${assignedLane}-${parentLane}`,
        fromLane: assignedLane,
        fromRow: rowIndex,
        toLane: parentLane,
        toRow: parentRow,
        color: edgeColor,
        isMerge: pIdx > 0,
      });
    });
  }

  // Quantidade total de lanes utilizados
  const maxLaneUsed = Math.max(
    0,
    ...rows.map((r) => r.lane),
    ...edges.map((e) => Math.max(e.fromLane, e.toLane)),
  );

  return {
    rows,
    edges,
    laneCount: maxLaneUsed + 1,
  };
}

export interface BezierCoordinates {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Gera o path SVG cúbico suave entre duas coordenadas (linha reta se mesmo lane, curva Bézier se trocar de lane)
 */
export function getGraphEdgePath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): string {
  if (Math.abs(fromX - toX) < 1) {
    return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  }

  // Curva Bézier vertical suave
  const dy = toY - fromY;
  const cp1x = fromX;
  const cp1y = fromY + dy * 0.45;
  const cp2x = toX;
  const cp2y = toY - dy * 0.45;

  return `M ${fromX} ${fromY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${toX} ${toY}`;
}

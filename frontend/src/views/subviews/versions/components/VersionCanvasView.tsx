import React, {
  useState,
  useRef,
  useMemo,
  useEffect,
  useCallback,
} from "react";
import type { GitGraphCommit, VersionNode } from "../../../../types";
import { Button } from "../../../../components/ui";

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

interface CanvasBranchItem {
  node: VersionNode;
  side: -1 | 1;
  level: number;
  color: string;
  entryX: number;
  entryY: number;
  exitX: number;
  exitY: number;
  sourceX: number;
  sourceY: number;
  path: string;
  commits: {
    commit: GitGraphCommit;
    x: number;
    y: number;
    shortLabel: string;
    fullMessage: string;
  }[];
  isMerged: boolean;
  mergeCommitHash?: string;
  isCurrent: boolean;
  commitCount: number;
  hasChildren: boolean;
}

interface CanvasTrunkCommit {
  commit: GitGraphCommit;
  y: number;
  isTip: boolean;
  isMerge: boolean;
  mergedBranchName?: string;
  shortLabel: string;
  fullMessage: string;
  labelSide: -1 | 1;
}

// Conector horizontal suave estilo Sankey (Curva cúbica de Bézier entre colunas)
function getSankeyHorizontalPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): string {
  if (Math.abs(startX - endX) < 1) {
    return `M ${startX} ${startY} L ${endX} ${endY}`;
  }

  const dx = endX - startX;
  const cp1x = startX + dx * 0.45;
  const cp1y = startY;
  const cp2x = startX + dx * 0.55;
  const cp2y = endY;

  return `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
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
        /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?:\s*/i,
        "",
      )
      .trim() || text
  );
}

// Dimensões Padrão para o Layout Sankey com Altura Dinâmica e Espaçamento Normal
const TRUNK_X = 0;
const DEFAULT_NODE_SPACING = 16;
const BASE_LEAF_HEIGHT = 34;
const COMMIT_LABEL_HEIGHT = 20;
const COMMIT_LABEL_GAP = 6;
const BASE_OFFSET = 160;
const COL_STEP = 220;
const COMMIT_RADIUS = 4;

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
    if (!commits || commits.length === 0) {
      return {
        trunkCommits: [],
        branches: [],
        trunkTopY: 50,
        trunkBaseY: 300,
        allCommitsMap: new Map<string, { x: number; y: number }>(),
      };
    }

    const defaultNode = nodes.find((n) => n.isDefault) || nodes[0];
    const otherNodes = nodes.filter((n) => n.name !== defaultNode?.name);

    // 1. Commits da linha principal ordenados do mais antigo (base) ao mais recente (topo)
    const rawMainCommits = commits.filter((c) => c.isMainLineage);
    const mainCommits = (rawMainCommits.length > 0 ? rawMainCommits : commits)
      .slice(0, 40)
      .reverse();

    // 2. Mapeamento de parentesco das branches
    const parentMap = new Map<string, string>();
    otherNodes.forEach((n) => {
      let p = n.parentBranch;
      if (!p || p === n.name || !otherNodes.some((x) => x.name === p)) {
        p = defaultNode?.name || defaultBranch;
      }
      parentMap.set(n.name, p);
    });

    const childrenMap = new Map<string, string[]>();
    otherNodes.forEach((n) => {
      const p = parentMap.get(n.name) || defaultBranch;
      const list = childrenMap.get(p) || [];
      list.push(n.name);
      childrenMap.set(p, list);
    });

    const trunkHashes = new Set(mainCommits.map((c) => c.hash.toLowerCase()));

    // 3. Commits de cada branch (apenas commits únicos à branch, sem duplicar a main!)
    const branchCommitsMap = new Map<string, GitGraphCommit[]>();
    otherNodes.forEach((bNode) => {
      const bCommits: GitGraphCommit[] = [];
      if (bNode.commits && bNode.commits.length > 0) {
        bNode.commits.forEach((bc) => {
          if (!trunkHashes.has(bc.hash.toLowerCase())) {
            const full = commits.find((c) => c.hash === bc.hash);
            bCommits.push(full || (bc as GitGraphCommit));
          }
        });
      } else {
        const matching = commits.filter(
          (c) =>
            !c.isMainLineage &&
            !trunkHashes.has(c.hash.toLowerCase()) &&
            c.branches &&
            c.branches.some((b) => b.name === bNode.name),
        );
        bCommits.push(...matching);
      }
      branchCommitsMap.set(bNode.name, bCommits.slice(0, 8));
    });

    // 4. Altura necessária para cada sub-árvore de branch
    function getBranchSelfHeight(branchName: string): number {
      const isExpanded = expandedBranchNames.has(branchName);
      if (!isExpanded) return BASE_LEAF_HEIGHT;

      const bCommits = branchCommitsMap.get(branchName) || [];
      const count = bCommits.length;
      if (count === 0) return BASE_LEAF_HEIGHT;
      return 26 + count * (COMMIT_LABEL_HEIGHT + COMMIT_LABEL_GAP) + 6;
    }

    const subtreeHeightMap = new Map<string, number>();
    function getSubtreeHeight(
      name: string,
      visited = new Set<string>(),
    ): number {
      if (subtreeHeightMap.has(name)) return subtreeHeightMap.get(name)!;
      if (visited.has(name)) return BASE_LEAF_HEIGHT;
      visited.add(name);

      const selfHeight = getBranchSelfHeight(name);
      const children = childrenMap.get(name) || [];
      if (children.length === 0) {
        subtreeHeightMap.set(name, selfHeight);
        return selfHeight;
      }

      let sumKids = 0;
      children.forEach((cName) => {
        if (!visited.has(cName)) {
          sumKids += getSubtreeHeight(cName, visited);
        }
      });

      const total = Math.max(selfHeight, sumKids + 14);
      subtreeHeightMap.set(name, total);
      return total;
    }
    otherNodes.forEach((n) => getSubtreeHeight(n.name));

    // 5. Agrupamento de branches de Nível 1 pelo commit de origem no tronco
    const commitDirectBranchesMap = new Map<string, VersionNode[]>();
    const directBranches = otherNodes.filter(
      (n) => (parentMap.get(n.name) || defaultBranch) === defaultBranch,
    );

    directBranches.forEach((bNode) => {
      let anchorHash = "";
      if (bNode.baseHash) {
        const bh = bNode.baseHash.toLowerCase();
        const found = mainCommits.find((c) => {
          const ch = c.hash.toLowerCase();
          const cs = (c.shortHash || "").toLowerCase();
          return (
            ch === bh || cs === bh || ch.startsWith(bh) || bh.startsWith(ch)
          );
        });
        if (found) anchorHash = found.hash;
      }
      if (!anchorHash && bNode.baseDate) {
        const bTime = new Date(bNode.baseDate).getTime();
        if (!isNaN(bTime)) {
          let minDiff = Infinity;
          let closest = "";
          for (const c of mainCommits) {
            if (c.date) {
              const diff = Math.abs(new Date(c.date).getTime() - bTime);
              if (diff < minDiff) {
                minDiff = diff;
                closest = c.hash;
              }
            }
          }
          if (closest && minDiff < 300000) anchorHash = closest;
        }
      }
      if (!anchorHash && mainCommits.length > 0) {
        anchorHash = mainCommits[0].hash;
      }

      const list = commitDirectBranchesMap.get(anchorHash) || [];
      list.push(bNode);
      commitDirectBranchesMap.set(anchorHash, list);
    });

    // 6. Atribuição de Lado Balanceada (Esquerda e Direita) e Determinística:
    // Regra mandatória: os galhos devem SEMPRE nascer do lado oposto ao nome na principal.
    // Para manter a árvore equilibrada dos dois lados (sem ficar toda de um lado só),
    // alternamos os lados entre os diferentes commits que possuem galhos (-1, 1, -1, 1...).
    const branchSideMap = new Map<string, -1 | 1>();
    const commitAssignedBranchSideMap = new Map<string, -1 | 1>();

    let currentSide: -1 | 1 = -1; // Começa na esquerda (-1)
    for (const c of mainCommits) {
      const branchesAtCommit = (commitDirectBranchesMap.get(c.hash) || [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));

      if (branchesAtCommit.length > 0) {
        commitAssignedBranchSideMap.set(c.hash, currentSide);

        branchesAtCommit.forEach((bNode) => {
          branchSideMap.set(bNode.name, currentSide);

          function assignDescendantSide(parentName: string, s: -1 | 1) {
            const kids = childrenMap.get(parentName) || [];
            const stableKids = [...kids].sort((x, y) => x.localeCompare(y));
            stableKids.forEach((kName) => {
              branchSideMap.set(kName, s);
              assignDescendantSide(kName, s);
            });
          }
          assignDescendantSide(bNode.name, currentSide);
        });

        // Alterna o lado para o próximo commit com galhos (esquerda -> direita -> esquerda...)
        currentSide = currentSide === -1 ? 1 : -1;
      }
    }

    // 7. Cálculo DINÂMICO da altura do tronco para caber todas as branches com folga vertical
    const commitHeights: number[] = [];

    for (let i = 0; i < mainCommits.length; i++) {
      const c = mainCommits[i];
      const branchesAtCommit = commitDirectBranchesMap.get(c.hash) || [];
      let totalBranchHeight = 0;
      branchesAtCommit.forEach(
        (b) => (totalBranchHeight += getSubtreeHeight(b.name)),
      );

      // Garante distância vertical mínima e confortável para os galhos nunca se sobreporem
      const neededStep =
        totalBranchHeight > 0
          ? Math.max(nodeSpacing + 22, totalBranchHeight + 18)
          : nodeSpacing;

      commitHeights.push(neededStep);
    }

    const totalHeightSum = commitHeights.reduce((acc, h) => acc + h, 0);
    const trunkBaseY = totalHeightSum + 50;

    let currentCommitY = trunkBaseY;
    const trunkCommits: CanvasTrunkCommit[] = [];
    const allCommitsMap = new Map<string, { x: number; y: number }>();

    for (let i = 0; i < mainCommits.length; i++) {
      const c = mainCommits[i];
      const step = commitHeights[i] || nodeSpacing;
      currentCommitY -= step;

      const isTip = c.isMainTip || i === mainCommits.length - 1;
      const clean = cleanCommitTitle(c.message);
      const short = clean.length > 22 ? `${clean.slice(0, 21)}…` : clean;

      // Os galhos devem sempre nascer do lado oposto ao nome na principal:
      // Se este commit possui galhos no lado 'side', o nome da Principal fica OBRIGATORIAMENTE em '-side'.
      let labelSide: -1 | 1;
      if (commitAssignedBranchSideMap.has(c.hash)) {
        labelSide = commitAssignedBranchSideMap.get(c.hash) === 1 ? -1 : 1;
      } else {
        labelSide = i % 2 === 0 ? 1 : -1;
      }

      trunkCommits.push({
        commit: c,
        y: currentCommitY,
        isTip,
        isMerge: Boolean(c.parents && c.parents.length > 1),
        shortLabel: short,
        fullMessage: c.message,
        labelSide,
      });

      allCommitsMap.set(c.hash, { x: TRUNK_X, y: currentCommitY });
    }

    const trunkTopY = trunkCommits[trunkCommits.length - 1]?.y || 60;

    // 8. Posicionamento das Branches e de seus Commits
    const layoutBranches: CanvasBranchItem[] = [];

    function layoutSubtree(
      node: VersionNode,
      level: number,
      side: -1 | 1,
      slotStartY: number,
      _slotHeight: number,
      sourceX: number,
      sourceY: number,
      visited = new Set<string>(),
    ) {
      if (visited.has(node.name)) return;
      visited.add(node.name);

      let entryX = 0;
      let exitX = 0;

      if (side === 1) {
        entryX = TRUNK_X + BASE_OFFSET + (level - 1) * COL_STEP;
      } else {
        entryX = TRUNK_X - BASE_OFFSET - (level - 1) * COL_STEP;
      }

      // Alinha horizontalmente o nó da branch com o ponto de saída (slotStartY)
      const branchY = slotStartY;

      const path = getSankeyHorizontalPath(sourceX, sourceY, entryX, branchY);

      let color = node.isMerged ? "#059669" : "#7c3aed";
      if (node.type === "draft") color = "#d97706";

      const bCommits = branchCommitsMap.get(node.name) || [];
      const branchCommitsRender: CanvasBranchItem["commits"] = [];

      // Estimativa da largura visual do nome da branch e do badge de commits
      const rawName = node.displayName || node.name;
      const displayName =
        rawName.length > 20 ? `${rawName.slice(0, 19)}…` : rawName;
      const labelTextLen = displayName.length;
      const hasBadge = bCommits.length > 0;
      const badgeW = hasBadge ? (bCommits.length > 9 ? 22 : 18) : 0;
      const textWidth = Math.min(labelTextLen * 7.2, 130);

      const totalLabelWidth = Math.max(
        42,
        Math.min(
          (hasBadge ? 8 + badgeW + 6 : 10) +
            textWidth +
            (node.isMerged ? 16 : 0) +
            14,
          COL_STEP - 24,
        ),
      );

      // O ponto de saída para os filhos acompanha o final do nome e do badge
      if (side === 1) {
        exitX = entryX + totalLabelWidth;
      } else {
        exitX = entryX - totalLabelWidth;
      }

      let curCommitY = branchY + 26;

      bCommits.forEach((bc) => {
        const clean = cleanCommitTitle(bc.message);
        const short = clean.length > 26 ? `${clean.slice(0, 25)}…` : clean;

        branchCommitsRender.push({
          commit: bc,
          x: entryX,
          y: curCommitY,
          shortLabel: short,
          fullMessage: bc.message,
        });

        allCommitsMap.set(bc.hash, { x: entryX, y: curCommitY });
        curCommitY += COMMIT_LABEL_HEIGHT + COMMIT_LABEL_GAP;
      });

      // Filhas recursivas da branch
      const children = childrenMap.get(node.name) || [];
      const hasChildren = children.length > 0;

      layoutBranches.push({
        node,
        side,
        level,
        color,
        entryX,
        entryY: branchY,
        exitX,
        exitY: branchY,
        sourceX,
        sourceY,
        path,
        commits: branchCommitsRender,
        isMerged: Boolean(node.isMerged),
        mergeCommitHash: node.mergeCommitHash,
        isCurrent: !isDetached && currentBranch === node.name,
        commitCount: bCommits.length,
        hasChildren,
      });

      if (hasChildren) {
        let childSlotY = branchY;
        const stableKids = [...children].sort((a, b) => a.localeCompare(b));
        stableKids.forEach((cName) => {
          const cNode = otherNodes.find((x) => x.name === cName);
          if (cNode) {
            const cHeight = getSubtreeHeight(cName);
            layoutSubtree(
              cNode,
              level + 1,
              side,
              childSlotY,
              cHeight,
              exitX,
              branchY,
              visited,
            );
            childSlotY += Math.max(cHeight, 34) + 14;
          }
        });
      }
    }

    // Disparar layout a partir dos commits do tronco com ordenação estável
    trunkCommits.forEach((tc) => {
      const branchesAtCommit = (
        commitDirectBranchesMap.get(tc.commit.hash) || []
      )
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));

      const branchSide = commitAssignedBranchSideMap.get(tc.commit.hash) || -1;
      let curY = tc.y;
      branchesAtCommit.forEach((b) => {
        const bH = getSubtreeHeight(b.name);
        layoutSubtree(b, 1, branchSide, curY, bH, TRUNK_X, tc.y);
        curY += Math.max(bH, 34) + 14;
      });
    });

    return {
      trunkCommits,
      branches: layoutBranches,
      trunkTopY,
      trunkBaseY,
      allCommitsMap,
    };
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
                  activeMergedBranch.exitX,
                  activeMergedBranch.exitY,
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
                  fill="transparent"
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
                      width="80"
                      height="22"
                      rx="11"
                      fill={isWorkspaceActive ? "#2563eb" : "#1e40af"}
                      style={{
                        filter: "drop-shadow(0 2px 5px rgba(37,99,235,0.35))",
                      }}
                    />
                    <text
                      x="40"
                      y="11.5"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#ffffff"
                      fontSize="10"
                      fontWeight="700"
                      fontFamily="system-ui, -apple-system, sans-serif"
                    >
                      ★ Principal
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
                    onSelectCommit(getBranchCommit(br.node), br.node.name);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    const targetCommit = getBranchCommit(br.node);
                    onSwitchCommit(targetCommit, br.node.name);
                  }}
                  onMouseEnter={() => setHoveredNodeId(branchNodeId)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  style={{ cursor: "pointer" }}
                >
                  {/* Hitbox precisa clicável no nó e no texto */}
                  {(() => {
                    const hasBadge = br.commitCount > 0;
                    const badgeW = hasBadge ? (br.commitCount > 9 ? 22 : 18) : 0;
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
                        fill="transparent"
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
                    const badgeW = hasBadge ? (br.commitCount > 9 ? 22 : 18) : 0;
                    const textX =
                      br.side === 1
                        ? hasBadge
                          ? 8 + badgeW + 6
                          : 10
                        : hasBadge
                          ? -8 - badgeW - 6
                          : -10;

                    return (
                      <text
                        x={textX}
                        y="0"
                        textAnchor={br.side === 1 ? "start" : "end"}
                        dominantBaseline="central"
                        fill={br.color}
                        fontSize="11"
                        fontWeight={
                          isSelectedBranch || br.isCurrent ? "700" : "600"
                        }
                        fontFamily="system-ui, -apple-system, sans-serif"
                        style={{
                          letterSpacing: "-0.01em",
                          paintOrder: "stroke fill",
                          stroke: "var(--bg-surface, #ffffff)",
                          strokeWidth: "3.5px",
                          strokeLinejoin: "round",
                        }}
                      >
                        {displayName}
                        {br.isMerged ? " ✓" : ""}
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
                          fill="transparent"
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
      <div
        style={{
          position: "absolute",
          left: "20px",
          bottom: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
          padding: "8px 12px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
          fontSize: "11px",
          color: "var(--text-secondary)",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#2563eb",
              flexShrink: 0,
            }}
          />
          <span>Principal</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#7c3aed",
              flexShrink: 0,
            }}
          />
          <span>Versão</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#059669",
              flexShrink: 0,
            }}
          />
          <span>Mesclada</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#d97706",
              flexShrink: 0,
            }}
          />
          <span>Rascunho ou Proposta</span>
        </div>
      </div>

      {/* Barra de Controles de Zoom Compacta no Canto Inferior Direito */}
      <div
        style={{
          position: "absolute",
          right: "20px",
          bottom: "20px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
          padding: "4px",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
          zIndex: 10,
        }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setZoom((z) => Math.min(z * 1.15, 3.5))}
          title="Aumentar zoom (ou use Ctrl + Scroll)"
          style={{ width: "30px", height: "30px", padding: 0 }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "18px" }}
          >
            add
          </span>
        </Button>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--text-secondary)",
            minWidth: "36px",
            textAlign: "center",
          }}
        >
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setZoom((z) => Math.max(z * 0.85, 0.4))}
          title="Diminuir zoom (ou use Ctrl + Scroll)"
          style={{ width: "30px", height: "30px", padding: 0 }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "18px" }}
          >
            remove
          </span>
        </Button>

        <div
          style={{
            width: "1px",
            height: "18px",
            background: "var(--border-color)",
          }}
        />

        {/* Controle Dinâmico da Distância entre Nós */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            padding: "0 4px",
          }}
          title={`Distância vertical entre nós: ${nodeSpacing}px`}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "16px", color: "var(--text-secondary)" }}
          >
            format_line_spacing
          </span>

          <input
            type="range"
            min="10"
            max="280"
            step="2"
            value={nodeSpacing}
            onChange={(e) => setNodeSpacing(Number(e.target.value))}
            style={{
              width: "55px",
              height: "4px",
              cursor: "pointer",
              accentColor: "#2563eb",
            }}
          />
          <span
            style={{
              fontSize: "11px",
              color: "var(--text-secondary)",
              minWidth: "26px",
              fontWeight: 600,
            }}
          >
            {nodeSpacing}px
          </span>
        </div>

        <div
          style={{
            width: "1px",
            height: "18px",
            background: "var(--border-color)",
          }}
        />

        {/* Botão de Expandir / Recolher Todos os Commits das Branches */}
        <Button
          variant="ghost"
          size="sm"
          onClick={expandedBranchNames.size > 0 ? collapseAll : expandAll}
          title={
            expandedBranchNames.size > 0
              ? "Recolher commits de todas as branches"
              : "Mostrar commits de todas as branches"
          }
          style={{
            height: "30px",
            padding: "0 8px",
            fontSize: "11.5px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            color:
              expandedBranchNames.size > 0
                ? "#2563eb"
                : "var(--text-secondary)",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "16px" }}
          >
            {expandedBranchNames.size > 0 ? "unfold_less" : "unfold_more"}
          </span>
          <span>
            {expandedBranchNames.size > 0 ? "Esconder todos" : "Mostrar todos"}
          </span>
        </Button>

        <div
          style={{
            width: "1px",
            height: "18px",
            background: "var(--border-color)",
          }}
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={centerOnActive}
          title="Centralizar no commit ou branch ativo"
          style={{
            height: "30px",
            padding: "0 8px",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "16px" }}
          >
            center_focus_strong
          </span>
          <span>Focar</span>
        </Button>
      </div>
    </div>
  );
};

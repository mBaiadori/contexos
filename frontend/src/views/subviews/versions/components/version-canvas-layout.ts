import type { GitGraphCommit, VersionNode } from "../../../../types";

export interface CanvasBranchItem {
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

export interface CanvasTrunkCommit {
  commit: GitGraphCommit;
  y: number;
  isTip: boolean;
  isMerge: boolean;
  mergedBranchName?: string;
  shortLabel: string;
  fullMessage: string;
  labelSide: -1 | 1;
}

export interface CanvasLayoutResult {
  trunkCommits: CanvasTrunkCommit[];
  branches: CanvasBranchItem[];
  trunkTopY: number;
  trunkBaseY: number;
  allCommitsMap: Map<string, { x: number; y: number }>;
}

// Conector horizontal suave estilo Sankey (Curva cúbica de Bézier entre colunas)
export function getSankeyHorizontalPath(
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
export const TRUNK_X = 0;
export const DEFAULT_NODE_SPACING = 16;
export const BASE_LEAF_HEIGHT = 34;
export const COMMIT_LABEL_HEIGHT = 20;
export const COMMIT_LABEL_GAP = 6;
export const BASE_OFFSET = 160;
export const COL_STEP = 220;
export const COMMIT_RADIUS = 4;

export interface CalculateLayoutOptions {
  commits: GitGraphCommit[];
  nodes: VersionNode[];
  defaultBranch: string;
  currentBranch: string;
  isDetached: boolean;
  nodeSpacing: number;
  expandedBranchNames: Set<string>;
}

export function calculateCanvasLayout({
  commits,
  nodes = [],
  defaultBranch = "main",
  currentBranch = "main",
  isDetached = false,
  nodeSpacing,
  expandedBranchNames,
}: CalculateLayoutOptions): CanvasLayoutResult {
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

  const trunkHashes = new Set(mainCommits.map((c) => c.hash.toLowerCase()));

  // 2. Mapeamento de parentesco das branches
  const parentMap = new Map<string, string>();
  otherNodes.forEach((n) => {
    let p = n.parentBranch;
    const pNode = p ? otherNodes.find((x) => x.name === p) : undefined;
    const mergedDirectlyInTrunk = Boolean(
      n.mergeCommitHash && trunkHashes.has(n.mergeCommitHash.toLowerCase()),
    );
    if (
      !p ||
      p === n.name ||
      !pNode ||
      pNode.isMerged ||
      mergedDirectlyInTrunk
    ) {
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

  // 6. Atribuição de Lado Balanceada (Esquerda e Direita) e Determinística
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

      currentSide = currentSide === -1 ? 1 : -1;
    }
  }

  // 7. Cálculo DINÂMICO da altura do tronco
  const commitHeights: number[] = [];

  for (let i = 0; i < mainCommits.length; i++) {
    const c = mainCommits[i];
    const branchesAtCommit = commitDirectBranchesMap.get(c.hash) || [];
    let totalBranchHeight = 0;
    branchesAtCommit.forEach(
      (b) => (totalBranchHeight += getSubtreeHeight(b.name)),
    );

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

    const branchY = slotStartY;
    const path = getSankeyHorizontalPath(sourceX, sourceY, entryX, branchY);

    const isRejected =
      node.publicationStatus === "rejected" ||
      node.proposal?.status === "CLOSED" ||
      node.proposal?.status === "REJECTED";
    const isRemoteOrPublished =
      Boolean(node.hasRemote) ||
      node.type === "proposal" ||
      node.publicationStatus === "open" ||
      node.publicationStatus === "synced" ||
      node.publicationStatus === "remote_only";
    let color = isRemoteOrPublished ? "#7c3aed" : "#d97706";
    if (isRejected) color = "#dc2626";
    if (node.isMerged) color = "#059669";

    const bCommits = branchCommitsMap.get(node.name) || [];
    const branchCommitsRender: CanvasBranchItem["commits"] = [];

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
}

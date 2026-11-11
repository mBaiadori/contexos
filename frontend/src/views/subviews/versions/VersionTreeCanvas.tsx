import React, {
  useState,
  useRef,
  useMemo,
  useEffect,
  useCallback,
} from "react";
import type { VersionNode, GitCommitInfo } from "../../../types";

export interface VersionTreeCanvasProps {
  nodes: VersionNode[];
  mainCommits?: GitCommitInfo[];
  selectedNodeName: string | null;
  onSelectNode: (node: VersionNode) => void;
  onSwitchNode?: (node: VersionNode) => void;
  onSelectCommit?: (commit: GitCommitInfo) => void;
  onSwitchCommit?: (commit: GitCommitInfo) => void;
  isLoading?: boolean;
}

export interface BranchForkCommitItem {
  id: string;
  commit: GitCommitInfo;
  label: string;
  shortHash: string;
  author: string;
  x: number;
  y: number;
  width: number;
  height: number;
  exitX: number;
  exitY: number;
  childBranchNames: string[];
}

export interface SankeyBranchLayoutItem {
  node: VersionNode;
  level: number;
  side: -1 | 1; // -1 para Esquerda (Ímpar), 1 para Direita (Par)
  cardX: number;
  cardY: number;
  cardWidth: number;
  cardHeight: number;
  entryX: number;
  entryY: number;
  exitX: number;
  exitY: number;
  sourceX: number;
  sourceY: number;
  path: string;
  hasIntermediateCommitNode: boolean;
  intermediateCommitPos?: { x: number; y: number };
  forkCommitLabels?: BranchForkCommitItem[];
  color: string;
  isMerged: boolean;
  mergedDate?: string;
  mergeCommitHash?: string;
  commitCount: number;
}

export interface TrunkCommitItem extends GitCommitInfo {
  y: number;
  isMergeCommit: boolean;
  mergedBranchName?: string;
  branchesSide?: -1 | 1 | "none" | "both";
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
        /^(merge pull request #\d+ from [^\n]+|merge branch [^\n]+|publicação da versão:\s*)/i,
        "Publicação da versão: ",
      )
      .replace(
        /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?:\s*/i,
        "",
      )
      .trim() || text
  );
}

// Dimensões Padrão Unificadas (Design Moderno & Compacto com Altura Dinâmica de Níveis)
const CARD_WIDTH = 176;
const CARD_HEIGHT = 28;
const BASE_LEAF_HEIGHT = 46; // Altura base para nós folha (card 28px + respiro)
const COMMIT_LABEL_WIDTH = 144; // Largura do card/label de commit
const COMMIT_LABEL_HEIGHT = 22; // Altura do label de commit
const COMMIT_LABEL_GAP = 6; // Espaço vertical entre múltiplos labels de commit
const COL_STEP = CARD_WIDTH + 44; // Distância horizontal ampla entre colunas de níveis
const BASE_OFFSET = 36; // Distância do tronco até a coluna de Nível 1
const COMMIT_STEP_EMPTY = 26; // Espaço vertical mínimo entre commits do tronco
const COMMIT_RADIUS = 3.5;
const NODE_RADIUS = 5.5;

export const VersionTreeCanvas: React.FC<VersionTreeCanvasProps> = ({
  nodes,
  mainCommits = [],
  selectedNodeName,
  onSelectNode,
  onSwitchNode,
  onSelectCommit,
  onSwitchCommit,
  isLoading = false,
}) => {
  // Zoom e pan do canvas
  const [zoom, setZoom] = useState(1.15);
  const [pan, setPan] = useState({ x: 420, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredNodeName, setHoveredNodeName] = useState<string | null>(null);
  const [hoveredCommitHash, setHoveredCommitHash] = useState<string | null>(
    null,
  );
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(
    null,
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasInitialCenteredRef = useRef(false);

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

  // Listener nativo com { passive: false } para permitir preventDefault() e impedir zoom no navegador
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      // Impede o zoom do navegador (Cmd/Ctrl + Scroll) e o scroll padrão da página
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Zoom no canvas (scroll up/pinch out = zoom in, scroll down/pinch in = zoom out)
        const factor = e.deltaY < 0 ? 1.06 : 0.94;
        setZoom((prev) => Math.min(Math.max(prev * factor, 0.4), 4.0));
      } else if (e.shiftKey) {
        // Scroll horizontal
        setPan((prev) => ({
          ...prev,
          x: prev.x - (e.deltaY || e.deltaX),
        }));
      } else {
        // Pan livre (suporta tanto trackpad com deltaX/deltaY quanto mouse wheel)
        setPan((prev) => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }));
      }
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", onWheel);
    };
  }, []);

  // Layout Estruturado em Colunas de Nível com Altura Dinâmica de Sub-árvore
  const layout = useMemo(() => {
    if (!nodes || nodes.length === 0) {
      return {
        trunkX: 0,
        trunkBaseY: 300,
        trunkTopY: 50,
        totalHeight: 350,
        defaultNode: null,
        branches: [],
        trunkCommits: [],
      };
    }

    const defaultNode = nodes.find((n) => n.isDefault) || nodes[0];
    const otherNodes = nodes.filter((n) => n.name !== defaultNode.name);

    // 1. Mapeamento de hierarquia e níveis com sanitização estrita de aciclicidade (DAG)
    const rawParentMap = new Map<string, string>();
    nodes.forEach((n) => {
      if (n.name === defaultNode.name) {
        rawParentMap.set(n.name, "");
        return;
      }
      const rawParent = n.parentBranch;
      const validParent =
        rawParent &&
        rawParent !== n.name &&
        nodes.some((x) => x.name === rawParent)
          ? rawParent
          : defaultNode.name;
      rawParentMap.set(n.name, validParent);
    });

    // Sanitiza parentMap garantindo que todo caminho convirja para defaultNode sem ciclos
    const parentMap = new Map<string, string>();
    parentMap.set(defaultNode.name, "");

    nodes.forEach((n) => {
      if (n.name === defaultNode.name) return;
      const visited = new Set<string>([n.name]);
      let curr = rawParentMap.get(n.name) || defaultNode.name;
      let safeParent = curr;

      while (curr && curr !== defaultNode.name) {
        if (visited.has(curr)) {
          safeParent = defaultNode.name;
          break;
        }
        visited.add(curr);
        curr = rawParentMap.get(curr) || defaultNode.name;
      }
      parentMap.set(n.name, safeParent);
    });

    // Constrói childrenMap a partir do parentMap garantidamente acíclico
    const childrenMap = new Map<string, string[]>();
    nodes.forEach((n) => {
      if (n.name === defaultNode.name) return;
      const p = parentMap.get(n.name) || defaultNode.name;
      const curList = childrenMap.get(p) || [];
      curList.push(n.name);
      childrenMap.set(p, curList);
    });

    // Cálculo iterativo de níveis de nós com memoização e proteção contra estouro de pilha
    const nodeLevelMap = new Map<string, number>();
    nodeLevelMap.set(defaultNode.name, 0);

    function getNodeLevel(name: string): number {
      if (nodeLevelMap.has(name)) return nodeLevelMap.get(name)!;

      const visited = new Set<string>([name]);
      const path: string[] = [name];
      let curr = parentMap.get(name);

      while (curr && curr !== defaultNode.name && !nodeLevelMap.has(curr)) {
        if (visited.has(curr)) {
          curr = defaultNode.name;
          break;
        }
        visited.add(curr);
        path.push(curr);
        curr = parentMap.get(curr);
      }

      let baseLevel =
        curr && nodeLevelMap.has(curr) ? nodeLevelMap.get(curr)! : 0;

      for (let i = path.length - 1; i >= 0; i--) {
        baseLevel += 1;
        nodeLevelMap.set(path[i], baseLevel);
      }

      return nodeLevelMap.get(name) || 1;
    }
    nodes.forEach((n) => getNodeLevel(n.name));

    // 2. Mapeamento dos Commits de Origem/Bifurcação e Cálculo da Altura Dinâmica de Níveis
    function getForkCommitsForNode(node: VersionNode): BranchForkCommitItem[] {
      const childrenNames = childrenMap.get(node.name) || [];
      if (childrenNames.length === 0) return [];

      const childrenNodes = childrenNames
        .map((cn) => nodes.find((n) => n.name === cn))
        .filter((n): n is VersionNode => Boolean(n));

      const candidateCommits: GitCommitInfo[] = [];
      if (node.commits && node.commits.length > 0) {
        candidateCommits.push(...node.commits);
      } else if (node.lastCommit) {
        candidateCommits.push(node.lastCommit);
      }

      if (candidateCommits.length === 0) {
        candidateCommits.push({
          hash: node.baseHash || node.name,
          shortHash: (node.baseHash || node.name).slice(0, 7),
          author: "Git",
          date: node.baseDate || "",
          message: `Origem de ${node.displayName || node.name}`,
        });
      }

      // Mapeamento commit -> filhas que nasceram dele
      const mapping = new Map<
        string,
        { commit: GitCommitInfo; children: string[] }
      >();

      childrenNodes.forEach((child, idx) => {
        let matched: GitCommitInfo | undefined = undefined;

        // 1. Tenta por baseHash exato ou prefixo
        if (child.baseHash) {
          const bh = child.baseHash.toLowerCase();
          matched = candidateCommits.find((c) => {
            const ch = c.hash.toLowerCase();
            const cs = (c.shortHash || "").toLowerCase();
            return (
              ch === bh || cs === bh || ch.startsWith(bh) || bh.startsWith(ch)
            );
          });
        }

        // 2. Tenta por baseDate aproximada
        if (!matched && child.baseDate) {
          const bTime = new Date(child.baseDate).getTime();
          if (!isNaN(bTime)) {
            let minDiff = Infinity;
            for (const c of candidateCommits) {
              if (c.date) {
                const diff = Math.abs(new Date(c.date).getTime() - bTime);
                if (diff < minDiff) {
                  minDiff = diff;
                  matched = c;
                }
              }
            }
          }
        }

        // 3. Fallback: se houver múltiplos commits e múltiplas filhas, distribui
        if (!matched) {
          const commitIdx = Math.min(idx, candidateCommits.length - 1);
          matched = candidateCommits[commitIdx];
        }

        const commitKey = matched.hash || matched.shortHash || `commit-${idx}`;
        const existing = mapping.get(commitKey) || {
          commit: matched,
          children: [],
        };
        existing.children.push(child.name);
        mapping.set(commitKey, existing);
      });

      const result: BranchForkCommitItem[] = [];
      mapping.forEach((val) => {
        result.push({
          id: val.commit.hash || val.commit.shortHash,
          commit: val.commit,
          label: cleanCommitTitle(val.commit.message),
          shortHash:
            val.commit.shortHash ||
            (val.commit.hash ? val.commit.hash.slice(0, 7) : ""),
          author: val.commit.author || "",
          x: 0,
          y: 0,
          width: COMMIT_LABEL_WIDTH,
          height: COMMIT_LABEL_HEIGHT,
          exitX: 0,
          exitY: 0,
          childBranchNames: val.children,
        });
      });

      return result;
    }

    function getNodeSelfHeight(node: VersionNode): number {
      const forkCount = getForkCommitsForNode(node).length;
      if (forkCount === 0) {
        return BASE_LEAF_HEIGHT;
      }
      return (
        CARD_HEIGHT +
        8 +
        forkCount * (COMMIT_LABEL_HEIGHT + COMMIT_LABEL_GAP) +
        12
      );
    }

    const subtreeHeightMap = new Map<string, number>();

    function computeSubtreeHeight(
      name: string,
      visited = new Set<string>(),
    ): number {
      if (subtreeHeightMap.has(name)) return subtreeHeightMap.get(name)!;
      if (visited.has(name)) return BASE_LEAF_HEIGHT;
      visited.add(name);

      const node = nodes.find((n) => n.name === name);
      const selfHeight = node ? getNodeSelfHeight(node) : BASE_LEAF_HEIGHT;

      const children = childrenMap.get(name) || [];
      if (children.length === 0) {
        subtreeHeightMap.set(name, selfHeight);
        return selfHeight;
      }

      let sumChildren = 0;
      for (const childName of children) {
        if (!visited.has(childName)) {
          sumChildren += computeSubtreeHeight(childName, visited);
        }
      }

      // Expande a altura dos outros níveis proporcionalmente para caberem com folga
      const height = Math.max(selfHeight, sumChildren + 12);
      subtreeHeightMap.set(name, height);
      return height;
    }
    nodes.forEach((n) => computeSubtreeHeight(n.name));

    // 3. Commits da linha Principal e Ancoragem das Branches de Nível 1
    const TRUNK_X = 0;
    const validMainCommits = (mainCommits || []).slice(0, 30);

    // Mapeamento de commits de merge
    const mergeCommitMap = new Map<string, string>(); // commitHash -> branchName
    otherNodes.forEach((bNode) => {
      if (bNode.isMerged) {
        if (bNode.mergeCommitHash) {
          mergeCommitMap.set(bNode.mergeCommitHash.toLowerCase(), bNode.name);
        }
      }
    });

    // Agrupar branches de Nível 1 pelo commit base de origem no tronco
    const directBranches = otherNodes.filter((n) => getNodeLevel(n.name) === 1);
    const commitDirectBranchesMap = new Map<string, VersionNode[]>();

    directBranches.forEach((bNode) => {
      let targetHash = "";
      if (bNode.baseHash) {
        const bh = bNode.baseHash.toLowerCase();
        const found = validMainCommits.find((c) => {
          const ch = c.hash.toLowerCase();
          const cs = (c.shortHash || "").toLowerCase();
          return (
            ch === bh || cs === bh || ch.startsWith(bh) || bh.startsWith(ch)
          );
        });
        if (found) targetHash = found.hash;
      }
      if (!targetHash && bNode.baseDate) {
        const bTime = new Date(bNode.baseDate).getTime();
        if (!isNaN(bTime)) {
          let minDiff = Infinity;
          let closest = "";
          for (const c of validMainCommits) {
            if (c.date) {
              const diff = Math.abs(new Date(c.date).getTime() - bTime);
              if (diff < minDiff) {
                minDiff = diff;
                closest = c.hash;
              }
            }
          }
          if (closest && minDiff < 300000) targetHash = closest;
        }
      }
      // Se não achou commit exato, ancora no commit mais antigo disponível
      if (!targetHash && validMainCommits.length > 0) {
        targetHash = validMainCommits[validMainCommits.length - 1].hash;
      }
      const list = commitDirectBranchesMap.get(targetHash) || [];
      list.push(bNode);
      commitDirectBranchesMap.set(targetHash, list);
    });

    // 4. Atribuição de Lado Par / Ímpar para os grupos de Nível 1
    const branchSideMap = new Map<string, -1 | 1>();
    let anchorIndex = 0;

    commitDirectBranchesMap.forEach((branchesGroup) => {
      // Ímpar: -1 (Esquerda), Par: 1 (Direita)
      const side: -1 | 1 = anchorIndex % 2 === 0 ? 1 : -1;
      anchorIndex++;
      branchesGroup.forEach((b) => {
        branchSideMap.set(b.name, side);
        function assignDescendantSide(parentName: string, s: -1 | 1) {
          const ch = childrenMap.get(parentName) || [];
          ch.forEach((cName) => {
            branchSideMap.set(cName, s);
            assignDescendantSide(cName, s);
          });
        }
        assignDescendantSide(b.name, side);
      });
    });

    // 5. Cálculo Dinâmico Compacto das Posições Verticais dos Commits no Tronco
    // Evita espaço sobrando desnecessário entre commits
    const commitHeights: number[] = [];
    let prevBranchesHalfHeight = 0;

    for (let i = validMainCommits.length - 1; i >= 0; i--) {
      const c = validMainCommits[i];
      const branchesAtCommit = commitDirectBranchesMap.get(c.hash) || [];
      const leftBranches = branchesAtCommit.filter(
        (b) => branchSideMap.get(b.name) === -1,
      );
      const rightBranches = branchesAtCommit.filter(
        (b) => branchSideMap.get(b.name) === 1,
      );

      let hLeft = 0;
      leftBranches.forEach((b) => (hLeft += computeSubtreeHeight(b.name)));
      let hRight = 0;
      rightBranches.forEach((b) => (hRight += computeSubtreeHeight(b.name)));

      const curBranchesHeight = Math.max(hLeft, hRight);
      const curHalf = curBranchesHeight / 2;

      // Distância justa entre o commit anterior e este
      const neededStep =
        curBranchesHeight > 0 || prevBranchesHalfHeight > 0
          ? Math.max(COMMIT_STEP_EMPTY, prevBranchesHalfHeight + curHalf + 10)
          : COMMIT_STEP_EMPTY;

      commitHeights.push(neededStep);
      prevBranchesHalfHeight = curHalf;
    }

    const totalHeightSum = commitHeights.reduce((acc, h) => acc + h, 0);
    const PADDING_TOP = 50;
    const PADDING_BOTTOM = 50;
    const trunkBaseY = totalHeightSum + PADDING_TOP;

    let currentCommitY = trunkBaseY - 14;
    const trunkCommits: TrunkCommitItem[] = [];

    for (let i = validMainCommits.length - 1; i >= 0; i--) {
      const c = validMainCommits[i];
      const stepIndex = validMainCommits.length - 1 - i;
      const step = commitHeights[stepIndex] || COMMIT_STEP_EMPTY;
      currentCommitY -= step;

      const isMerge =
        mergeCommitMap.has(c.hash.toLowerCase()) ||
        c.message.toLowerCase().startsWith("merge ");

      const branchesAtCommit = commitDirectBranchesMap.get(c.hash) || [];
      const hasLeft = branchesAtCommit.some(
        (b) => branchSideMap.get(b.name) === -1,
      );
      const hasRight = branchesAtCommit.some(
        (b) => branchSideMap.get(b.name) === 1,
      );
      let branchesSide: -1 | 1 | "none" | "both" = "none";
      if (hasLeft && hasRight) branchesSide = "both";
      else if (hasRight) branchesSide = 1;
      else if (hasLeft) branchesSide = -1;

      trunkCommits.push({
        ...c,
        y: currentCommitY,
        isMergeCommit: isMerge,
        mergedBranchName: mergeCommitMap.get(c.hash.toLowerCase()),
        branchesSide,
      });
    }

    // Espaçamento amplo e confortável entre o último commit e o nó Fim
    const TRUNK_END_GAP = 75;

    // 6. Colunas Horizontais por Nível
    function getLevelColumnX(
      level: number,
      side: -1 | 1,
    ): { cardX: number; entryX: number; exitX: number } {
      if (side === 1) {
        // Lado Direito: entra pela esquerda, sai pela direita
        const entryX = TRUNK_X + BASE_OFFSET + (level - 1) * COL_STEP;
        const cardX = entryX;
        const exitX = cardX + CARD_WIDTH;
        return { cardX, entryX, exitX };
      } else {
        // Lado Esquerdo: entra pela direita, sai pela esquerda
        const entryX = TRUNK_X - BASE_OFFSET - (level - 1) * COL_STEP;
        const cardX = entryX - CARD_WIDTH;
        const exitX = cardX;
        return { cardX, entryX, exitX };
      }
    }

    // 7. Posicionamento Recursivo das Branches e Labels de Commit
    const branches: SankeyBranchLayoutItem[] = [];

    function layoutSubtree(
      node: VersionNode,
      level: number,
      side: -1 | 1,
      slotStartY: number,
      slotHeight: number,
      sourceX: number,
      sourceY: number,
      visited = new Set<string>(),
    ) {
      if (visited.has(node.name)) return;
      visited.add(node.name);

      const { cardX, entryX, exitX } = getLevelColumnX(level, side);

      const forkLabels = getForkCommitsForNode(node);
      const selfHeight = getNodeSelfHeight(node);

      // Centraliza o bloco (card + labels de commit) verticalmente no slot reservado
      const cardY = slotStartY + Math.max(0, (slotHeight - selfHeight) / 2);
      const cardCenterY = cardY + CARD_HEIGHT / 2;

      const path = getSankeyHorizontalPath(
        sourceX,
        sourceY,
        entryX,
        cardCenterY,
      );

      let color = "#3b82f6";
      if (node.isMerged) {
        color = "#10b981"; // Verde esmeralda para branches mergeadas
      } else if (node.type === "proposal") {
        color = "#8b5cf6"; // Roxo elegante para propostas
      } else if (node.type === "draft") {
        color = "#f59e0b"; // Âmbar para rascunhos
      }

      const commitCount = node.commits?.length || node.ahead || 0;

      // Posiciona cada label de commit de onde nasceram novas branches
      let curLabelY = cardY + CARD_HEIGHT + 8;
      const labelW = COMMIT_LABEL_WIDTH;
      const labelH = COMMIT_LABEL_HEIGHT;
      const labelX = side === 1 ? cardX + 4 : cardX + CARD_WIDTH - labelW - 4;

      forkLabels.forEach((fl) => {
        fl.x = labelX;
        fl.y = curLabelY;
        fl.width = labelW;
        fl.height = labelH;
        fl.exitX = side === 1 ? labelX + labelW : labelX;
        fl.exitY = curLabelY + labelH / 2;
        curLabelY += labelH + COMMIT_LABEL_GAP;
      });

      branches.push({
        node,
        level,
        side,
        cardX,
        cardY,
        cardWidth: CARD_WIDTH,
        cardHeight: CARD_HEIGHT,
        entryX,
        entryY: cardCenterY,
        exitX,
        exitY: cardCenterY,
        sourceX,
        sourceY,
        path,
        hasIntermediateCommitNode: forkLabels.length > 0,
        forkCommitLabels: forkLabels,
        color,
        isMerged: Boolean(node.isMerged),
        mergedDate: node.mergedDate,
        mergeCommitHash: node.mergeCommitHash,
        commitCount,
      });

      // Posiciona as filhas dentro do slot
      const children = (childrenMap.get(node.name) || [])
        .map((cName) => nodes.find((n) => n.name === cName)!)
        .filter(Boolean);

      if (children.length > 0) {
        let totalChildrenHeight = 0;
        children.forEach((child) => {
          totalChildrenHeight += computeSubtreeHeight(child.name);
        });

        // Centraliza os slots das filhas em relação ao slot pai
        let currentChildSlotY =
          slotStartY + Math.max(0, (slotHeight - totalChildrenHeight) / 2);

        children.forEach((child) => {
          if (!visited.has(child.name)) {
            const childHeight = computeSubtreeHeight(child.name);

            // Identifica o commit label exato de onde nasceu esta filha
            const matchingLabel = forkLabels.find((lbl) =>
              lbl.childBranchNames.includes(child.name),
            );
            const childSourceX = matchingLabel ? matchingLabel.exitX : exitX;
            const childSourceY = matchingLabel
              ? matchingLabel.exitY
              : cardCenterY;

            layoutSubtree(
              child,
              level + 1,
              side,
              currentChildSlotY,
              childHeight,
              childSourceX,
              childSourceY,
              visited,
            );
            currentChildSlotY += childHeight;
          }
        });
      }
    }

    // Disparar layout a partir dos commits do tronco
    trunkCommits.forEach((commit) => {
      const branchesAtCommit = commitDirectBranchesMap.get(commit.hash) || [];
      const leftBranches = branchesAtCommit.filter(
        (b) => branchSideMap.get(b.name) === -1,
      );
      const rightBranches = branchesAtCommit.filter(
        (b) => branchSideMap.get(b.name) === 1,
      );

      // Lado Esquerdo
      if (leftBranches.length > 0) {
        let totalLeftHeight = 0;
        leftBranches.forEach(
          (b) => (totalLeftHeight += computeSubtreeHeight(b.name)),
        );
        let startSlotY = commit.y - totalLeftHeight / 2;
        leftBranches.forEach((b) => {
          const bHeight = computeSubtreeHeight(b.name);
          layoutSubtree(b, 1, -1, startSlotY, bHeight, TRUNK_X, commit.y);
          startSlotY += bHeight;
        });
      }

      // Lado Direito
      if (rightBranches.length > 0) {
        let totalRightHeight = 0;
        rightBranches.forEach(
          (b) => (totalRightHeight += computeSubtreeHeight(b.name)),
        );
        let startSlotY = commit.y - totalRightHeight / 2;
        rightBranches.forEach((b) => {
          const bHeight = computeSubtreeHeight(b.name);
          layoutSubtree(b, 1, 1, startSlotY, bHeight, TRUNK_X, commit.y);
          startSlotY += bHeight;
        });
      }
    });

    // 8. Ajuste Seguro do Topo e Cálculo da Altura Total
    const allY: number[] = [
      ...branches.map((b) => b.cardY),
      ...trunkCommits.map((c) => c.y),
    ];
    branches.forEach((b) => {
      if (b.forkCommitLabels) {
        b.forkCommitLabels.forEach((fl) => allY.push(fl.y));
      }
    });

    const minCalculatedY =
      allY.length > 0 ? Math.min(...allY) : trunkBaseY - 100;
    const SAFE_TOP = 40;

    let effectiveTrunkBaseY = trunkBaseY;
    if (minCalculatedY < SAFE_TOP) {
      const deltaY = SAFE_TOP - minCalculatedY;
      effectiveTrunkBaseY += deltaY;
      trunkCommits.forEach((c) => (c.y += deltaY));
      branches.forEach((b) => {
        b.cardY += deltaY;
        b.entryY += deltaY;
        b.exitY += deltaY;
        b.sourceY += deltaY;
        if (b.forkCommitLabels) {
          b.forkCommitLabels.forEach((fl) => {
            fl.y += deltaY;
            fl.exitY += deltaY;
          });
        }
        b.path = getSankeyHorizontalPath(
          b.sourceX,
          b.sourceY,
          b.entryX,
          b.entryY,
        );
      });
    }

    // Garante que effectiveTrunkBaseY fique sempre abaixo de todos os commits do tronco com folga
    if (trunkCommits.length > 0) {
      const oldestCommitY = trunkCommits[0].y;
      if (effectiveTrunkBaseY <= oldestCommitY + 35) {
        effectiveTrunkBaseY = oldestCommitY + 50;
      }
    }

    // Calcula a altura total efetiva com base em todos os cards e labels de commit
    let maxY = effectiveTrunkBaseY;
    branches.forEach((b) => {
      let bBottom = b.cardY + b.cardHeight;
      if (b.forkCommitLabels && b.forkCommitLabels.length > 0) {
        const lastLbl = b.forkCommitLabels[b.forkCommitLabels.length - 1];
        bBottom = Math.max(bBottom, lastLbl.y + lastLbl.height);
      }
      if (bBottom > maxY) maxY = bBottom;
    });

    const effectiveTotalHeight = maxY + PADDING_BOTTOM;
    const effectiveTrunkTopY = Math.max(
      trunkCommits.length > 0
        ? trunkCommits[trunkCommits.length - 1].y - TRUNK_END_GAP
        : 50,
      45,
    );

    return {
      trunkX: TRUNK_X,
      trunkBaseY: effectiveTrunkBaseY,
      trunkTopY: effectiveTrunkTopY,
      totalHeight: effectiveTotalHeight,
      defaultNode,
      branches,
      trunkCommits,
    };
  }, [nodes, mainCommits]);

  // Centralização e Zoom Automático no Nó / Commit "Ativo"
  const centerOnActive = useCallback(() => {
    if (!layout || nodes.length === 0) return;
    const container = containerRef.current;
    const containerW = container?.clientWidth || 900;
    const containerH = container?.clientHeight || 600;

    let targetX = layout.trunkX;
    let targetY = layout.trunkTopY;

    const defaultNode = layout.defaultNode;
    const isDefaultCurrent = defaultNode?.isCurrent;

    if (isDefaultCurrent && layout.trunkCommits.length > 0) {
      // Se estiver na branch principal (default), focar no último commit do tronco como ATIVO
      const lastCommit = layout.trunkCommits[layout.trunkCommits.length - 1];
      targetX = layout.trunkX;
      targetY = lastCommit.y;
    } else {
      // Se estiver em outra branch, focar no card da branch ativa
      const activeBranch = layout.branches.find((b) => b.node.isCurrent);
      if (activeBranch) {
        targetX = activeBranch.cardX + activeBranch.cardWidth / 2;
        targetY = activeBranch.cardY + activeBranch.cardHeight / 2;
      } else if (layout.trunkCommits.length > 0) {
        targetX = layout.trunkX;
        targetY = layout.trunkCommits[layout.trunkCommits.length - 1].y;
      }
    }

    const targetZoom = 1.2;
    setZoom(targetZoom);
    setPan({
      x: containerW / 2 - targetX * targetZoom,
      y: containerH / 2 - targetY * targetZoom,
    });
  }, [layout, nodes]);

  useEffect(() => {
    if (
      !hasInitialCenteredRef.current &&
      nodes.length > 0 &&
      (layout.trunkCommits.length > 0 || layout.branches.length > 0)
    ) {
      hasInitialCenteredRef.current = true;
      const timer = setTimeout(() => {
        centerOnActive();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [layout, nodes, centerOnActive]);

  // Identifica a branch mergeada sob hover ou selecionada para acendimento sincronizado ("Apenas acende merge")
  const activeMergedBranch = useMemo(() => {
    const activeName = hoveredNodeName || selectedNodeName;
    if (!activeName) return null;
    const br = layout.branches.find((b) => b.node.name === activeName);
    return br && br.isMerged ? br : null;
  }, [hoveredNodeName, selectedNodeName, layout.branches]);

  // Localiza com precisão cirúrgica o commit de merge único no tronco correspondente à branch
  const mergeTrunkCommit = useMemo(() => {
    if (!activeMergedBranch) return null;

    const mHash = (activeMergedBranch.node.mergeCommitHash || "")
      .trim()
      .toLowerCase();
    // 1. Prioridade absoluta: bater por hash exato ou prefixo curto (mínimo 6 chars)
    if (mHash && mHash.length >= 6) {
      const match = layout.trunkCommits.find((c) => {
        const cHash = c.hash.toLowerCase();
        return (
          cHash === mHash || cHash.startsWith(mHash) || mHash.startsWith(cHash)
        );
      });
      if (match) return match;
    }

    // 2. Se não achou por hash, verificar mensagem de merge citando a branch
    const branchName = activeMergedBranch.node.name.toLowerCase();
    const matchByMsg = layout.trunkCommits.find((c) => {
      const msg = c.message.toLowerCase();
      return (
        msg.includes(`merge branch '${branchName}'`) ||
        msg.includes(`merge branch "${branchName}"`) ||
        msg.includes(`merge branch ${branchName}`) ||
        (msg.includes("merge pull request") && msg.includes(branchName))
      );
    });
    if (matchByMsg) return matchByMsg;

    // 3. Fallback pontual: se houver data de merge, pega O MAIS PRÓXIMO em <= 60s
    const mDate = activeMergedBranch.node.mergedDate;
    if (mDate) {
      const targetTime = new Date(mDate).getTime();
      if (!isNaN(targetTime)) {
        let closest: TrunkCommitItem | null = null;
        let minDiff = Infinity;
        for (const c of layout.trunkCommits) {
          if (c.date) {
            const t = new Date(c.date).getTime();
            if (!isNaN(t)) {
              const diff = Math.abs(t - targetTime);
              if (diff < minDiff) {
                minDiff = diff;
                closest = c;
              }
            }
          }
        }
        if (closest && minDiff <= 60000) {
          return closest;
        }
      }
    }

    return null;
  }, [activeMergedBranch, layout.trunkCommits]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#f8fafc",
        userSelect: "none",
        cursor: isDragging ? "grabbing" : "grab",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* LOADING INICIAL COMPLETO (enquanto o grafo inicial é gerado) */}
      {isLoading && (!nodes || nodes.length === 0) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#f8fafc",
            zIndex: 40,
            gap: "18px",
          }}
        >
          {/* Animação Circular Material 3 */}
          <div
            style={{
              position: "relative",
              width: "56px",
              height: "56px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="56" height="56" viewBox="0 0 56 56">
              <circle
                cx="28"
                cy="28"
                r="23"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="4"
              />
              <circle
                cx="28"
                cy="28"
                r="23"
                fill="none"
                stroke="#2563eb"
                strokeWidth="4"
                strokeDasharray="90 145"
                strokeLinecap="round"
              >
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0 28 28"
                  to="360 28 28"
                  dur="1s"
                  repeatCount="indefinite"
                />
              </circle>
            </svg>
            <span
              className="material-symbols-outlined"
              style={{
                position: "absolute",
                fontSize: "24px",
                color: "#2563eb",
              }}
            >
              account_tree
            </span>
          </div>

          <div
            style={{
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <span
              style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b" }}
            >
              Mapeando Grafo de Versões...
            </span>
            <span
              style={{
                fontSize: "12px",
                color: "#64748b",
                maxWidth: "340px",
                lineHeight: "1.4",
              }}
            >
              Calculando ramificações, bifurcações e histórico do repositório
            </span>
          </div>
        </div>
      )}

      {/* BANNER FLUTUANTE DE ATUALIZAÇÃO (quando o grafo já está renderizado) */}
      {isLoading && nodes && nodes.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "16px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "8px 18px",
            borderRadius: "9999px",
            background: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(8px)",
            border: "1px solid #cbd5e1",
            boxShadow: "0 6px 20px rgba(0, 0, 0, 0.08)",
            zIndex: 35,
            pointerEvents: "none",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <circle
              cx="12"
              cy="12"
              r="9"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="3"
            />
            <circle
              cx="12"
              cy="12"
              r="9"
              fill="none"
              stroke="#2563eb"
              strokeWidth="3"
              strokeDasharray="26 50"
              strokeLinecap="round"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 12 12"
                to="360 12 12"
                dur="0.8s"
                repeatCount="indefinite"
              />
            </circle>
          </svg>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#1e293b",
                lineHeight: 1.2,
              }}
            >
              Atualizando grafo...
            </span>
            <span
              style={{ fontSize: "10px", color: "#64748b", lineHeight: 1.2 }}
            >
              Mapeando alterações recentes
            </span>
          </div>
        </div>
      )}
      {/* Barra Flutuante de Controles: Zoom e Navegação (sem seletor de escala) */}
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
            onClick={() => setZoom((z) => Math.min(z * 1.15, 4.0))}
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
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "19px" }}
            >
              zoom_in
            </span>
          </button>

          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#64748b",
              minWidth: "36px",
              textAlign: "center",
            }}
          >
            {Math.round(zoom * 100)}%
          </span>

          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(z * 0.85, 0.4))}
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
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "19px" }}
            >
              zoom_out
            </span>
          </button>

          <div
            style={{
              width: "1px",
              height: "18px",
              background: "#e2e8f0",
              margin: "0 2px",
            }}
          />

          <button
            type="button"
            onClick={() => {
              setPan((p) => ({ ...p, y: 100 - layout.trunkTopY * zoom }));
            }}
            title="Navegar para a Linha Principal (Topo)"
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
          >
            Principal ↑
          </button>

          <button
            type="button"
            onClick={() => {
              setPan((p) => ({ ...p, y: 400 - layout.trunkBaseY * zoom }));
            }}
            title="Navegar para a Origem do Repositório (Base)"
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
          >
            Origem ↓
          </button>

          <button
            type="button"
            onClick={centerOnActive}
            title="Focar e centralizar no nó ou commit ativo"
            style={{
              border: "none",
              background: "rgba(37, 99, 235, 0.12)",
              color: "#2563eb",
              padding: "3px 8px",
              fontSize: "11px",
              cursor: "pointer",
              fontWeight: 700,
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "16px" }}
            >
              my_location
            </span>
            Ativo
          </button>

          <button
            type="button"
            onClick={() => {
              setZoom(1.15);
              centerOnActive();
            }}
            title="Restaurar zoom e centralizar no ativo"
            style={{
              border: "none",
              background: "transparent",
              color: "#64748b",
              padding: "3px 6px",
              fontSize: "11px",
              cursor: "pointer",
              borderRadius: "4px",
            }}
          >
            Reset
          </button>
        </div>

        {layout.defaultNode && !layout.defaultNode.isCurrent && (
          <button
            type="button"
            onClick={() => onSwitchNode?.(layout.defaultNode!)}
            title={`Alternar para a Linha Principal (${layout.defaultNode.name})`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              background: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "5px 12px",
              fontSize: "11px",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(37,99,235,0.3)",
              transition: "transform 0.1s ease",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "15px" }}
            >
              arrow_back
            </span>
            Principal
          </button>
        )}
      </div>

      <svg
        width="100%"
        height="100%"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <defs>
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
          {/* TRONCO PRINCIPAL VERTICAL (AZUL CONTÍNUO) */}
          <line
            x1={layout.trunkX}
            y1={layout.trunkTopY}
            x2={layout.trunkX}
            y2={layout.trunkBaseY}
            stroke="#2563eb"
            strokeWidth="3.2"
            strokeLinecap="round"
          />

          {/* COMMITS DO TRONCO PRINCIPAL */}
          {layout.trunkCommits.map((c, idx) => {
            const isHovered = hoveredCommitHash === c.hash;
            const isSelected = selectedCommitHash === c.hash;
            // ACENDE EXCLUSIVAMENTE O COMMIT ALVO DO MERGE (corrige acender todos)
            const isMergeTarget = Boolean(
              mergeTrunkCommit && mergeTrunkCommit.hash === c.hash,
            );
            const isLatestTrunkCommit = idx === layout.trunkCommits.length - 1;
            const isCommitActive = Boolean(
              layout.defaultNode?.isCurrent && isLatestTrunkCommit,
            );

            const cleanMsg = cleanCommitTitle(c.message);

            return (
              <g
                key={c.hash}
                transform={`translate(${layout.trunkX}, ${c.y})`}
                onClick={() => {
                  setSelectedCommitHash(c.hash);
                  onSelectCommit?.(c);
                }}
                onDoubleClick={() => onSwitchCommit?.(c)}
                onMouseEnter={() => setHoveredCommitHash(c.hash)}
                onMouseLeave={() => setHoveredCommitHash(null)}
                style={{ cursor: "pointer" }}
              >
                {/* Hitbox ampla para clique fácil */}
                <circle cx="0" cy="0" r="16" fill="transparent" />

                {/* Badge permanente no último commit da Linha Principal */}
                {isLatestTrunkCommit && (() => {
                  const isMainActive = Boolean(layout.defaultNode?.isCurrent);
                  const badgeSide: -1 | 1 = c.branchesSide === 1 ? -1 : 1;
                  const badgeW = 76;
                  const badgeX = badgeSide === -1 ? -badgeW - 14 : 14;

                  return (
                    <g
                      onClick={(e) => {
                        e.stopPropagation();
                        if (layout.defaultNode) {
                          onSelectNode(layout.defaultNode);
                        } else {
                          onSelectCommit?.(c);
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      {/* Pulso e destaque se a branch principal estiver ativa */}
                      {isMainActive && (
                        <circle
                          cx="0"
                          cy="0"
                          r={COMMIT_RADIUS + 7}
                          fill="none"
                          stroke="#2563eb"
                          strokeWidth="2.5"
                          opacity="0.85"
                        >
                          <animate
                            attributeName="r"
                            values={`${COMMIT_RADIUS + 5};${COMMIT_RADIUS + 13};${COMMIT_RADIUS + 5}`}
                            dur="2.2s"
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="opacity"
                            values="0.9;0.15;0.9"
                            dur="2.2s"
                            repeatCount="indefinite"
                          />
                        </circle>
                      )}

                      {/* Badge destacada Principal - posicionada sem sobreposição */}
                      <g transform={`translate(${badgeX}, -11)`}>
                        <rect
                          x="0"
                          y="0"
                          width={badgeW}
                          height="22"
                          rx="11"
                          fill={isMainActive ? "#2563eb" : "#1e40af"}
                          style={{
                            filter: "drop-shadow(0 2px 6px rgba(37,99,235,0.45))",
                          }}
                        />
                        <circle cx={badgeSide === -1 ? 12 : 11} cy="11" r="3" fill="#ffffff" />
                        <text
                          x={badgeSide === -1 ? 22 : 21}
                          y="11.5"
                          dominantBaseline="central"
                          fill="#ffffff"
                          fontSize="10"
                          fontWeight="700"
                          fontFamily="system-ui, -apple-system, sans-serif"
                        >
                          Principal
                        </text>
                      </g>
                    </g>
                  );
                })()}

                {/* Highlight ao passar mouse, selecionar ou ser o destino do merge */}
                {(isHovered || isSelected || isMergeTarget) &&
                  !isCommitActive && (
                    <circle
                      cx="0"
                      cy="0"
                      r={COMMIT_RADIUS + 5.5}
                      fill="none"
                      stroke={isMergeTarget ? "#10b981" : "#2563eb"}
                      strokeWidth={isMergeTarget ? "2.5" : "2"}
                      opacity={isMergeTarget ? 0.95 : 0.65}
                    />
                  )}

                {/* Bolinha do commit no tronco */}
                <circle
                  cx="0"
                  cy="0"
                  r={
                    isCommitActive
                      ? COMMIT_RADIUS + 2.5
                      : isHovered || isSelected || isMergeTarget
                        ? COMMIT_RADIUS + 1.8
                        : COMMIT_RADIUS
                  }
                  fill={
                    isCommitActive
                      ? "#2563eb"
                      : isMergeTarget
                        ? "#10b981"
                        : isHovered || isSelected
                          ? "#3b82f6"
                          : "#2563eb"
                  }
                  stroke="#ffffff"
                  strokeWidth={isCommitActive ? "2" : "1.6"}
                />

                <title>{`${cleanMsg} (${c.author})`}</title>
              </g>
            );
          })}

          {/* NÓ INÍCIO / ORIGEM HISTÓRICA (BASE NO SUL) */}
          {layout.defaultNode && (
            <g
              transform={`translate(${layout.trunkX}, ${layout.trunkBaseY})`}
              onClick={() => onSelectNode(layout.defaultNode!)}
              onDoubleClick={() => onSwitchNode?.(layout.defaultNode!)}
              onMouseEnter={() => setHoveredNodeName(layout.defaultNode!.name)}
              onMouseLeave={() => setHoveredNodeName(null)}
              style={{ cursor: "pointer" }}
            >
              <title>Origem do repositório / Primeiro marco histórico</title>
              <circle cx="0" cy="0" r="20" fill="transparent" />
              <circle
                cx="0"
                cy="0"
                r={NODE_RADIUS}
                fill="#475569"
                stroke="#ffffff"
                strokeWidth="2.2"
              />
              <rect
                x="-28"
                y="8"
                width="56"
                height="20"
                rx="10"
                fill="#475569"
                style={{
                  filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.18))",
                }}
              />
              <text
                x="0"
                y="18"
                textAnchor="middle"
                dominantBaseline="central"
                fill="#ffffff"
                fontSize="10"
                fontWeight="700"
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                Origem
              </text>
            </g>
          )}

          {/* NÓ TERMINAL DO TOPO DO TRONCO (Fim) */}
          <g transform={`translate(${layout.trunkX}, ${layout.trunkTopY})`}>
            {/* Ponto terminal do topo */}
            <circle
              cx="0"
              cy="0"
              r="4"
              fill="#1e293b"
              stroke="#ffffff"
              strokeWidth="2"
            />
            {/* Badge de Fim do tronco */}
            <g transform="translate(-24, -30)">
              <rect
                x="0"
                y="0"
                width="48"
                height="22"
                rx="11"
                fill="#1e293b"
                style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.15))" }}
              />
              <text
                x="24"
                y="14"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="11"
                fontWeight="700"
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                Fim
              </text>
            </g>
          </g>

          {/* CONECTORES HORIZONTAIS SANKEY ENTRE NÍVEIS */}
          {layout.branches.map((br) => {
            const isSelected = selectedNodeName === br.node.name;
            const isHovered = hoveredNodeName === br.node.name;

            return (
              <g key={`path-${br.node.name}`}>
                {/* Linha Bézier fluida contínua e sólida */}
                <path
                  d={br.path}
                  fill="none"
                  stroke={br.color}
                  strokeWidth={isSelected || isHovered ? "2.6" : "1.8"}
                  opacity={isSelected || isHovered ? 1 : 0.85}
                  style={{
                    transition: "stroke-width 0.15s ease, opacity 0.15s ease",
                  }}
                />
              </g>
            );
          })}

          {/* DESTAQUE INTERATIVO DE MERGE ("Apenas acende merge") */}
          {activeMergedBranch && mergeTrunkCommit && (
            <g style={{ pointerEvents: "none" }}>
              {/* Feixe suave conectando a versão ao commit alvo de merge no tronco */}
              <path
                d={getSankeyHorizontalPath(
                  activeMergedBranch.exitX,
                  activeMergedBranch.entryY,
                  layout.trunkX,
                  mergeTrunkCommit.y,
                )}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.4"
                opacity="0.95"
              />

              {/* Anel luminoso exclusivo no commit de merge */}
              <g
                transform={`translate(${layout.trunkX}, ${mergeTrunkCommit.y})`}
              >
                <circle
                  cx="0"
                  cy="0"
                  r={COMMIT_RADIUS + 7}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  opacity="0.95"
                />
                <circle cx="0" cy="0" r={COMMIT_RADIUS + 2} fill="#10b981" />

                {/* Etiqueta elegante no ponto de merge */}
                <g
                  transform={`translate(${activeMergedBranch.side === 1 ? -10 : 10}, -10)`}
                >
                  <rect
                    x={activeMergedBranch.side === 1 ? -130 : 0}
                    y="0"
                    width="130"
                    height="20"
                    rx="4"
                    fill="#065f46"
                    stroke="#10b981"
                    strokeWidth="1"
                    opacity="0.95"
                  />
                  <text
                    x={activeMergedBranch.side === 1 ? -65 : 65}
                    y="10"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#ecfdf5"
                    fontSize="9"
                    fontWeight="700"
                    fontFamily="system-ui, -apple-system, sans-serif"
                  >
                    {(() => {
                      const mTitle =
                        activeMergedBranch.node.displayName ||
                        activeMergedBranch.node.name;
                      return `✓ ${mTitle.length > 15 ? `${mTitle.slice(0, 15)}...` : mTitle}`;
                    })()}
                  </text>
                </g>
              </g>
            </g>
          )}

          {/* CARDS / PÍLULAS HORIZONTAIS DE CADA VERSÃO (COM DESIGN APERFEIÇOADO) */}
          {layout.branches.map((br) => {
            const isSelected = selectedNodeName === br.node.name;
            const isHovered = hoveredNodeName === br.node.name;
            const isCurrent = br.node.isCurrent;

            // Paleta de Cores do Card
            let cardBg = "#ffffff";
            let cardBorder = br.color;
            let textColor = "#1e293b";

            if (br.isMerged) {
              cardBg = isSelected || isHovered ? "#dcfce7" : "#f0fdf4";
              cardBorder = "#10b981";
              textColor = "#065f46";
            } else if (isSelected || isHovered) {
              cardBg = "#ffffff";
              cardBorder = br.color;
            }

            // Largura do badge de commits
            const hasCommits = br.commitCount > 0;
            const badgeW = br.commitCount >= 10 ? 25 : 20;
            const badgeH = 18;
            const badgeX = br.cardX + br.cardWidth - badgeW - 6;
            const badgeY = br.cardY + (br.cardHeight - badgeH) / 2;

            // Espaço reservado para o texto da versão
            const textStartX = isCurrent ? br.cardX + 22 : br.cardX + 12;
            const maxChars = hasCommits ? 18 : 22;
            const rawLabel =
              br.node.displayName ||
              cleanCommitTitle(br.node.proposal?.title) ||
              br.node.name;
            const displayName =
              rawLabel.length > maxChars
                ? `${rawLabel.slice(0, maxChars - 1)}…`
                : rawLabel;

            return (
              <g
                key={br.node.name}
                onClick={() => onSelectNode(br.node)}
                onDoubleClick={() => onSwitchNode?.(br.node)}
                onMouseEnter={() => setHoveredNodeName(br.node.name)}
                onMouseLeave={() => setHoveredNodeName(null)}
                style={{ cursor: "pointer" }}
              >
                {/* LABELS DE COMMITS DE BIFURCAÇÃO (Substitui a simples bolinha por labels com descrição completa) */}
                {br.forkCommitLabels && br.forkCommitLabels.length > 0 && (
                  <g>
                    {/* Haste vertical guia com a cor da branch descendo do card até o último commit */}
                    <line
                      x1={
                        br.side === 1
                          ? br.cardX + 16
                          : br.cardX + br.cardWidth - 16
                      }
                      y1={br.cardY + br.cardHeight}
                      x2={
                        br.side === 1
                          ? br.cardX + 16
                          : br.cardX + br.cardWidth - 16
                      }
                      y2={
                        br.forkCommitLabels[br.forkCommitLabels.length - 1].y +
                        br.forkCommitLabels[br.forkCommitLabels.length - 1]
                          .height /
                          2
                      }
                      stroke={br.color}
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      opacity="0.45"
                    />

                    {br.forkCommitLabels.map((lbl) => {
                      const isSelectedCommit =
                        selectedCommitHash === lbl.commit.hash;
                      const isHoveredCommit =
                        hoveredCommitHash === lbl.commit.hash;

                      return (
                        <g
                          key={`fork-label-${lbl.id}-${lbl.y}`}
                          transform={`translate(${lbl.x}, ${lbl.y})`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCommitHash(lbl.commit.hash);
                            onSelectCommit?.(lbl.commit);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            onSwitchCommit?.(lbl.commit);
                          }}
                          onMouseEnter={() =>
                            setHoveredCommitHash(lbl.commit.hash)
                          }
                          onMouseLeave={() => setHoveredCommitHash(null)}
                          style={{ cursor: "pointer" }}
                        >
                          {/* Card do Label de Commit */}
                          <rect
                            x="0"
                            y="0"
                            width={lbl.width}
                            height={lbl.height}
                            rx="5"
                            fill={
                              isSelectedCommit || isHoveredCommit
                                ? "#ffffff"
                                : "#f8fafc"
                            }
                            stroke={
                              isSelectedCommit || isHoveredCommit
                                ? br.color
                                : "#cbd5e1"
                            }
                            strokeWidth={
                              isSelectedCommit || isHoveredCommit ? "1.6" : "1"
                            }
                            style={{
                              filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.05))",
                              transition: "all 0.15s ease",
                            }}
                          />

                          {/* Nome / Descrição do Commit na Branch (sem bolinhas, apenas o nome limpo) */}
                          <text
                            x="10"
                            y={lbl.height / 2}
                            dominantBaseline="central"
                            fill="#1e293b"
                            fontSize="9.5"
                            fontWeight="500"
                            fontFamily="system-ui, -apple-system, sans-serif"
                          >
                            {(() => {
                              const title = lbl.label || lbl.commit.message || lbl.shortHash;
                              return title.length > 21 ? `${title.slice(0, 21)}…` : title;
                            })()}
                          </text>

                          <title>{`${lbl.commit.message} (${lbl.author || "Git"} - ${lbl.shortHash})`}</title>
                        </g>
                      );
                    })}
                  </g>
                )}

                {/* Pulso e destaque da versão ATIVA */}
                {isCurrent && (
                  <rect
                    x={br.cardX - 4}
                    y={br.cardY - 4}
                    width={br.cardWidth + 8}
                    height={br.cardHeight + 8}
                    rx={(br.cardHeight + 8) / 2}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2.5"
                    opacity="0.8"
                    style={{ pointerEvents: "none" }}
                  >
                    <animate
                      attributeName="stroke-width"
                      values="2;4.5;2"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.85;0.25;0.85"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </rect>
                )}

                {/* Sombra / Highlight ao passar mouse ou selecionar */}
                {(isSelected || isHovered) && !isCurrent && (
                  <rect
                    x={br.cardX - 2.5}
                    y={br.cardY - 2.5}
                    width={br.cardWidth + 5}
                    height={br.cardHeight + 5}
                    rx={(br.cardHeight + 5) / 2}
                    fill="none"
                    stroke={cardBorder}
                    strokeWidth="2.2"
                    opacity="0.35"
                  />
                )}

                {/* Pílula do Card */}
                <rect
                  x={br.cardX}
                  y={br.cardY}
                  width={br.cardWidth}
                  height={br.cardHeight}
                  rx={br.cardHeight / 2}
                  fill={cardBg}
                  stroke={isCurrent ? "#2563eb" : cardBorder}
                  strokeWidth={
                    isCurrent ? "2.2" : isSelected || isHovered ? "2" : "1.4"
                  }
                  style={{
                    filter: isCurrent
                      ? "drop-shadow(0 2px 8px rgba(37,99,235,0.35))"
                      : "drop-shadow(0 1px 3px rgba(0,0,0,0.06))",
                    transition: "all 0.15s ease",
                  }}
                />

                {/* Indicador de Versão Ativa (Dot pulsante) */}
                {isCurrent && (
                  <g
                    transform={`translate(${br.cardX + 12}, ${br.cardY + br.cardHeight / 2})`}
                  >
                    <circle cx="0" cy="0" r="3.5" fill="#2563eb">
                      <animate
                        attributeName="r"
                        values="3;4.2;3"
                        dur="1.8s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle
                      cx="0"
                      cy="0"
                      r="7"
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="1.5"
                      opacity="0.5"
                    />
                  </g>
                )}

                {/* Nome da Versão - Centralizado verticalmente com tipografia aprimorada */}
                <text
                  x={textStartX}
                  y={br.cardY + br.cardHeight / 2}
                  dominantBaseline="central"
                  fill={textColor}
                  fontSize="11"
                  fontWeight={isSelected || isHovered ? "700" : "600"}
                  letterSpacing="-0.01em"
                  fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                >
                  {displayName}
                </text>

                {/* Contador de Commits [N] perfeitamente centralizado e integrado */}
                {hasCommits && (
                  <g transform={`translate(${badgeX}, ${badgeY})`}>
                    <rect
                      x="0"
                      y="0"
                      width={badgeW}
                      height={badgeH}
                      rx={badgeH / 2}
                      fill={br.isMerged ? "#dcfce7" : br.color}
                      opacity={
                        br.isMerged ? 1 : isSelected || isHovered ? 1 : 0.88
                      }
                    />
                    <text
                      x={badgeW / 2}
                      y={badgeH / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={br.isMerged ? "#065f46" : "#ffffff"}
                      fontSize="9.5"
                      fontWeight="700"
                      fontFamily="system-ui, -apple-system, sans-serif"
                    >
                      {br.commitCount}
                    </text>
                  </g>
                )}

                <title>{`${br.node.displayName || br.node.proposal?.title || br.node.name} • ${br.commitCount} alteração(ões)`}</title>
              </g>
            );
          })}

          {/* OVERLAY DO TOOLTIP DE COMMIT (renderizado no topo absoluto do SVG, acima de todos os cards e nós) */}
          {(() => {
            if (!hoveredCommitHash) return null;
            const hoveredCommit = layout.trunkCommits.find(
              (c) => c.hash === hoveredCommitHash,
            );
            if (!hoveredCommit) return null;

            const cleanMsg = cleanCommitTitle(hoveredCommit.message);
            const tooltipW = Math.min(cleanMsg.length * 6.5 + 24, 340);
            const tooltipH = 26;
            // Se as branches abrem à direita (1), o tooltip abre à esquerda
            const isRightSide = hoveredCommit.branchesSide === -1;
            const tooltipX = isRightSide ? 14 : -tooltipW - 14;

            return (
              <g
                transform={`translate(${layout.trunkX + tooltipX}, ${hoveredCommit.y - tooltipH / 2})`}
                style={{ pointerEvents: "none" }}
              >
                <rect
                  x="0"
                  y="0"
                  width={tooltipW}
                  height={tooltipH}
                  rx="5"
                  fill="#0f172a"
                  style={{
                    filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.45))",
                  }}
                />
                <text
                  x="12"
                  y={tooltipH / 2 + 0.5}
                  dominantBaseline="central"
                  fill="#ffffff"
                  fontSize="10.5"
                  fontWeight="600"
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {cleanMsg.length > 42 ? `${cleanMsg.slice(0, 42)}…` : cleanMsg}
                </text>
              </g>
            );
          })()}
        </g>
      </svg>
    </div>
  );
};

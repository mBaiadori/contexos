import React, { useMemo, useState, useEffect, useRef } from "react";
import type { TreeNode } from "../../types";
import type { InlineCreatingState } from "./types";
import { flattenTree, type FlatTreeItem } from "./utils/flatTreeUtils";
import { FileTreeNode } from "./FileTreeNode";
import { InlineCreateRow } from "./InlineCreateRow";

const ITEM_HEIGHT = 30;
const OVERSCAN = 12;
const VIRTUALIZATION_THRESHOLD = 80;

interface FlatTreeListProps {
  nodes: TreeNode[];
  repoName: string;
  expandedFolders: Record<string, boolean>;
  inlineCreating: InlineCreatingState | null;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  treeNodeProps: Omit<React.ComponentProps<typeof FileTreeNode>, "node" | "depth">;
}

export const FlatTreeList: React.FC<FlatTreeListProps> = ({
  nodes,
  repoName,
  expandedFolders,
  inlineCreating,
  scrollContainerRef,
  treeNodeProps,
}) => {
  const listRef = useRef<HTMLDivElement | null>(null);

  // 1. Gera a lista linear de nós visíveis em tempo recorde O(N visíveis)
  const flatItems: FlatTreeItem[] = useMemo(() => {
    return flattenTree(nodes, expandedFolders, inlineCreating);
  }, [nodes, expandedFolders, inlineCreating]);

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);

  // 2. Observer de scroll e resize da viewport quando a lista supera o threshold
  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container || flatItems.length <= VIRTUALIZATION_THRESHOLD) return;

    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setScrollTop(container.scrollTop);
          ticking = false;
        });
        ticking = true;
      }
    };

    const updateHeight = () => {
      setViewportHeight(container.clientHeight || 800);
    };

    updateHeight();
    setScrollTop(container.scrollTop);

    container.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", updateHeight);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", updateHeight);
    };
  }, [scrollContainerRef, flatItems.length]);

  // Se a lista for pequena, renderiza diretamente com 0 overhead
  if (flatItems.length <= VIRTUALIZATION_THRESHOLD) {
    return (
      <div ref={listRef} className="tree-flat-list">
        {flatItems.map((item) => {
          if (item.type === "inline-create") {
            return (
              <div
                key={item.id}
                style={{ paddingLeft: `${item.depth * 14 + 8}px` }}
              >
                <InlineCreateRow
                  inlineCreating={treeNodeProps.inlineCreating}
                  inlineValue={treeNodeProps.inlineValue}
                  setInlineValue={treeNodeProps.setInlineValue}
                  selectedTemplate={treeNodeProps.selectedTemplate}
                  setSelectedTemplate={treeNodeProps.setSelectedTemplate}
                  templatePickerOpen={treeNodeProps.templatePickerOpen}
                  setTemplatePickerOpen={treeNodeProps.setTemplatePickerOpen}
                  onConfirm={treeNodeProps.onConfirmInlineCreate}
                  onCancel={treeNodeProps.onCancelInlineCreate}
                  isSubmittingRef={treeNodeProps.isSubmittingInlineRef}
                />
              </div>
            );
          }

          if (item.type === "empty-folder") {
            return (
              <div
                key={item.id}
                style={{
                  padding: `4px 12px 4px ${item.depth * 14 + 28}px`,
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                }}
              >
                (pasta vazia)
              </div>
            );
          }

          return (
            <FileTreeNode
              key={item.id}
              {...treeNodeProps}
              node={item.node}
              repoNameForNode={repoName}
              depth={item.depth}
              isFlatItem={true}
            />
          );
        })}
      </div>
    );
  }

  // 3. Cálculo da Janela Virtualizada (Windowing) para listas grandes (6.000+ arquivos)
  const container = scrollContainerRef?.current;
  const listEl = listRef.current;
  let contentOffsetTop = 0;
  if (container && listEl) {
    const containerRect = container.getBoundingClientRect();
    const listRect = listEl.getBoundingClientRect();
    contentOffsetTop = Math.max(0, listRect.top - containerRect.top + container.scrollTop);
  }

  const relativeScroll = Math.max(0, scrollTop - contentOffsetTop);
  const startIndex = Math.max(0, Math.floor(relativeScroll / ITEM_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    flatItems.length,
    Math.ceil((relativeScroll + viewportHeight) / ITEM_HEIGHT) + OVERSCAN,
  );

  const visibleItems = flatItems.slice(startIndex, endIndex);
  const topSpacerHeight = startIndex * ITEM_HEIGHT;
  const bottomSpacerHeight = (flatItems.length - endIndex) * ITEM_HEIGHT;

  return (
    <div ref={listRef} className="tree-flat-list-virtualized" style={{ width: "100%" }}>
      {topSpacerHeight > 0 && (
        <div
          aria-hidden="true"
          style={{ height: `${topSpacerHeight}px`, width: "100%", pointerEvents: "none" }}
        />
      )}

      {visibleItems.map((item) => {
        if (item.type === "inline-create") {
          return (
            <div
              key={item.id}
              style={{
                minHeight: `${ITEM_HEIGHT}px`,
                paddingLeft: `${item.depth * 14 + 8}px`,
              }}
            >
              <InlineCreateRow
                inlineCreating={treeNodeProps.inlineCreating}
                inlineValue={treeNodeProps.inlineValue}
                setInlineValue={treeNodeProps.setInlineValue}
                selectedTemplate={treeNodeProps.selectedTemplate}
                setSelectedTemplate={treeNodeProps.setSelectedTemplate}
                templatePickerOpen={treeNodeProps.templatePickerOpen}
                setTemplatePickerOpen={treeNodeProps.setTemplatePickerOpen}
                onConfirm={treeNodeProps.onConfirmInlineCreate}
                onCancel={treeNodeProps.onCancelInlineCreate}
                isSubmittingRef={treeNodeProps.isSubmittingInlineRef}
              />
            </div>
          );
        }

        if (item.type === "empty-folder") {
          return (
            <div
              key={item.id}
              style={{
                height: `${ITEM_HEIGHT}px`,
                display: "flex",
                alignItems: "center",
                paddingLeft: `${item.depth * 14 + 28}px`,
                fontSize: "11px",
                color: "var(--text-muted)",
                fontStyle: "italic",
              }}
            >
              (pasta vazia)
            </div>
          );
        }

        return (
          <FileTreeNode
            key={item.id}
            {...treeNodeProps}
            node={item.node}
            repoNameForNode={repoName}
            depth={item.depth}
            isFlatItem={true}
          />
        );
      })}

      {bottomSpacerHeight > 0 && (
        <div
          aria-hidden="true"
          style={{ height: `${bottomSpacerHeight}px`, width: "100%", pointerEvents: "none" }}
        />
      )}
    </div>
  );
};

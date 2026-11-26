import React, { memo, useMemo } from "react";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  FilePlus,
  FolderPlus,
  Trash2,
  Edit3,
  FileText,
  FileCode,
  FileSpreadsheet,
  Image as ImageIcon,
  Upload,
  Laptop,
  Copy,
  Lock,
} from "lucide-react";
import type { TreeNode, StatusItem, BadgeOption, CategoryOption, TagOption, TemplateItem } from "../../types";
import type { InlineCreatingState, InlineRenamingState, DraggedItem } from "./types";
import { InlineCreateRow } from "./InlineCreateRow";
import { useWorkspace } from "../../context/WorkspaceContext";

interface FileTreeNodeProps {
  node: TreeNode;
  repoNameForNode?: string;
  activeFile: string;
  expandedFolders: Record<string, boolean>;
  selectedFolder: string;
  searchTerm: string;
  draggedItem: DraggedItem | null;
  dragOverTarget: string | null;
  inlineRenaming: InlineRenamingState | null;
  inlineRenameValue: string;
  setInlineRenameValue: (val: string) => void;
  inlineRenameInputRef: React.RefObject<HTMLInputElement | null>;
  onConfirmInlineRename: () => void;
  onCancelInlineRename: () => void;
  inlineCreating: InlineCreatingState | null;
  inlineValue: string;
  setInlineValue: (val: string) => void;
  selectedTemplate: TemplateItem | null;
  setSelectedTemplate: (tpl: TemplateItem | null) => void;
  templatePickerOpen: boolean;
  setTemplatePickerOpen: (open: boolean) => void;
  onConfirmInlineCreate: () => void;
  onCancelInlineCreate: () => void;
  isSubmittingInlineRef: React.MutableRefObject<boolean>;
  gitStatusMap: Map<string, unknown>;
  pendingChangesMap: Map<string, unknown>;
  departmentsMap: Map<string, { id?: string; name?: string; color?: string; [key: string]: unknown }>;
  canAccessDoc: (doc: TreeNode) => boolean;
  onToggleFolder: (path: string, e: React.MouseEvent) => void;
  onFileClick: (path: string, name: string, repoName?: string) => void;
  onStartInlineCreate: (parentPath: string, isFolder: boolean, e?: React.MouseEvent) => void;
  onStartInlineRename: (path: string, originalName: string, isFolder: boolean, e?: React.MouseEvent) => void;
  onPromptDeleteItem: (
    path: string,
    name: string,
    isFolder: boolean,
    repoName?: string,
    e?: React.MouseEvent,
  ) => void;
  onDuplicateFile: (path: string, repoName?: string, e?: React.MouseEvent) => void;
  onOpenInOS: (path: string, e?: React.MouseEvent, repoName?: string) => void;
  onOpenImport: (targetFolder: string, repoName?: string) => void;
  onDragStart: (e: React.DragEvent, node: TreeNode, isFolder: boolean, repoName?: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOverFolder: (e: React.DragEvent, folderPath: string) => void;
  onDragLeaveFolder: (e: React.DragEvent, folderPath: string) => void;
  onDropOnFolder: (e: React.DragEvent, targetFolderPath: string, targetRepoName?: string) => void;
  onDragOverFile: (e: React.DragEvent, filePath: string) => void;
  onDragLeaveFile: (e: React.DragEvent, filePath: string) => void;
  onDropOnFile: (e: React.DragEvent, targetFilePath: string, targetRepoName?: string) => void;
  depth?: number;
  isFlatItem?: boolean;
}

export const FileTreeNode: React.FC<FileTreeNodeProps> = memo((props) => {
  const {
    node,
    repoNameForNode,
    activeFile,
    expandedFolders,
    selectedFolder,
    searchTerm,
    draggedItem,
    dragOverTarget,
    inlineRenaming,
    inlineRenameValue,
    setInlineRenameValue,
    inlineRenameInputRef,
    onConfirmInlineRename,
    onCancelInlineRename,
    inlineCreating,
    inlineValue,
    setInlineValue,
    selectedTemplate,
    setSelectedTemplate,
    templatePickerOpen,
    setTemplatePickerOpen,
    onConfirmInlineCreate,
    onCancelInlineCreate,
    isSubmittingInlineRef,
    gitStatusMap,
    pendingChangesMap,
    departmentsMap,
    canAccessDoc,
    onToggleFolder,
    onFileClick,
    onStartInlineCreate,
    onStartInlineRename,
    onPromptDeleteItem,
    onDuplicateFile,
    onOpenInOS,
    onOpenImport,
    onDragStart,
    onDragEnd,
    onDragOverFolder,
    onDragLeaveFolder,
    onDropOnFolder,
    onDragOverFile,
    onDragLeaveFile,
    onDropOnFile,
    depth,
    isFlatItem,
  } = props;

  const { projectMetaOptions, projectConfig } = useWorkspace();

  const dynamicTaxonomyColor = useMemo(() => {
    if (node.status) {
      const statuses: StatusItem[] =
        projectMetaOptions?.statuses || projectConfig?.statuses || [];
      const match = statuses.find(
        (s: StatusItem) =>
          s.key?.toLowerCase() === node.status?.toLowerCase() ||
          s.name?.toLowerCase() === node.status?.toLowerCase() ||
          s.label?.toLowerCase() === node.status?.toLowerCase(),
      );
      if (match?.color) return match.color;
    }

    if (node.badge) {
      const badges: (BadgeOption | string)[] =
        projectMetaOptions?.badges || projectConfig?.badges || [];
      const match = badges.find(
        (b: BadgeOption | string) =>
          typeof b !== "string" && b.name?.toLowerCase() === node.badge?.toLowerCase(),
      );
      if (typeof match !== "string" && match?.color) return match.color;
    }

    const lowerPath = (node.path || "").toLowerCase();
    const lowerName = (node.name || "").toLowerCase();

    const categories: CategoryOption[] =
      projectMetaOptions?.categories || projectConfig?.categories || [];
    for (const cat of categories) {
      if (typeof cat !== "string" && cat.color && cat.name) {
        const catLower = cat.name.toLowerCase();
        if (lowerPath.includes(catLower) || lowerName.includes(catLower)) {
          return cat.color;
        }
      }
    }

    const tags: TagOption[] =
      projectMetaOptions?.tags || projectConfig?.tags || [];
    for (const tag of tags) {
      if (typeof tag !== "string" && tag.color && tag.name) {
        const tagLower = tag.name.toLowerCase();
        if (lowerPath.includes(tagLower) || lowerName.includes(tagLower)) {
          return tag.color;
        }
      }
    }

    return null;
  }, [node.status, node.badge, node.path, node.name, projectMetaOptions, projectConfig]);

  const isDir =
    node.type === "dir" || node.type === "directory" || node.is_directory;
  const isFolderExpanded = Boolean(
    expandedFolders[node.path] || (searchTerm && searchTerm.trim()),
  );
  const isFolderSelected = selectedFolder === node.path;
  const isDraggingThis = draggedItem?.path === node.path;
  const isDragOverThis = dragOverTarget === node.path;
  const isRenamingThis = Boolean(inlineRenaming && inlineRenaming.path === node.path);

  if (isDir) {
    return (
      <div
        key={node.path}
        className={`tree-node ${isDraggingThis ? "is-dragging" : ""}`}
      >
        <div
          className={`tree-folder ${isFolderSelected ? "selected" : ""} ${isDraggingThis ? "is-dragging" : ""} ${isDragOverThis ? "drag-over" : ""}`}
          style={depth !== undefined ? { paddingLeft: `${depth * 14 + 8}px` } : undefined}
          data-tree-path={node.path}
          draggable={!isRenamingThis}
          onDragStart={(e) => {
            if (isRenamingThis) {
              e.preventDefault();
              return;
            }
            onDragStart(e, node, true, repoNameForNode);
          }}
          onDragEnd={onDragEnd}
          onDragOver={(e) => onDragOverFolder(e, node.path)}
          onDragLeave={(e) => onDragLeaveFolder(e, node.path)}
          onDrop={(e) => onDropOnFolder(e, node.path, repoNameForNode)}
          onClick={(e) => onToggleFolder(node.path, e)}
        >
          <div className="tree-folder-left">
            <span
              className={`tree-caret ${isFolderExpanded ? "expanded" : ""}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                transform: isFolderExpanded ? "rotate(90deg)" : "none",
                transition: "transform 0.15s ease",
              }}
            >
              <ChevronRight size={12} />
            </span>
            {!isFolderExpanded ? (
              <Folder size={14} color="#64748b" style={{ flexShrink: 0 }} />
            ) : (
              <FolderOpen size={14} color="#2563eb" style={{ flexShrink: 0 }} />
            )}
            {isRenamingThis ? (
              <input
                ref={inlineRenameInputRef}
                type="text"
                className="tree-inline-input"
                value={inlineRenameValue}
                onChange={(e) => setInlineRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    onConfirmInlineRename();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    onCancelInlineRename();
                  }
                }}
                onBlur={onConfirmInlineRename}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onDragStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
            ) : (
              <span className="tree-folder-name">{node.name}</span>
            )}
          </div>
          <div
            className="tree-folder-actions"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="btn-tree-action"
              title="Novo Arquivo nesta pasta"
              onClick={(e) => onStartInlineCreate(node.path, false, e)}
            >
              <FilePlus size={12} />
            </button>
            <button
              className="btn-tree-action"
              title="Nova Pasta nesta pasta"
              onClick={(e) => onStartInlineCreate(node.path, true, e)}
            >
              <FolderPlus size={12} />
            </button>
            <button
              className="btn-tree-action"
              title={`Importar arquivos para ${node.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenImport(node.path, repoNameForNode);
              }}
            >
              <Upload size={12} />
            </button>
            <button
              className="btn-tree-action"
              title={`Abrir pasta "${node.name}" no gerenciador de arquivos do PC`}
              onClick={(e) => onOpenInOS(node.path, e, repoNameForNode)}
            >
              <Laptop size={12} />
            </button>
            <button
              className="btn-tree-action"
              title="Renomear pasta"
              onClick={(e) =>
                onStartInlineRename(node.path, node.name, true, e)
              }
            >
              <Edit3 size={11} />
            </button>
            <button
              className="btn-tree-action delete"
              title="Excluir pasta"
              onClick={(e) =>
                onPromptDeleteItem(
                  node.path,
                  node.name,
                  true,
                  repoNameForNode,
                  e,
                )
              }
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {isFolderExpanded && !isFlatItem && (
          <div className="tree-children">
            {/* Linha inline para criação nesta pasta */}
            {inlineCreating?.parentPath === node.path && (
              <InlineCreateRow
                inlineCreating={inlineCreating}
                inlineValue={inlineValue}
                setInlineValue={setInlineValue}
                selectedTemplate={selectedTemplate}
                setSelectedTemplate={setSelectedTemplate}
                templatePickerOpen={templatePickerOpen}
                setTemplatePickerOpen={setTemplatePickerOpen}
                onConfirm={onConfirmInlineCreate}
                onCancel={onCancelInlineCreate}
                isSubmittingRef={isSubmittingInlineRef}
              />
            )}

            {node.children && node.children.length > 0 ? (
              node.children.map((child) => (
                <FileTreeNode
                  key={child.path}
                  {...props}
                  node={child}
                />
              ))
            ) : inlineCreating?.parentPath !== node.path ? (
              <div
                style={{
                  padding: "4px 12px 4px 28px",
                  fontSize: "11px",
                  color: "var(--color-outline, #a6adc8)",
                  fontStyle: "italic",
                  opacity: 0.6,
                  userSelect: "none",
                }}
              >
                Pasta vazia
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  // File Node
  const isMarkdown =
    node.name.endsWith(".md") ||
    node.name.endsWith(".markdown") ||
    node.path.endsWith(".md") ||
    node.path.endsWith(".markdown");
  const isFileActive = activeFile === node.path;
  const fileExt = node.name.includes(".")
    ? (node.name.split(".").pop() || "").toLowerCase()
    : "";

  const cleanNodePath = node.path ? node.path.replace(/^\/+/, "") : "";
  const gitFile = (
    gitStatusMap.get(cleanNodePath) || gitStatusMap.get(node.path)
  ) as { status?: string } | undefined;
  const pendingChange = (
    pendingChangesMap.get(cleanNodePath) || pendingChangesMap.get(node.path)
  ) as { type?: string } | undefined;
  const gitStatusCode = gitFile
    ? gitFile.status === "??"
      ? "U"
      : gitFile.status
    : pendingChange
      ? pendingChange.type === "ADDED"
        ? "A"
        : "M"
      : null;

  const deptObj = node.department
    ? departmentsMap.get(String(node.department).toLowerCase())
    : undefined;
  const isAllowed = canAccessDoc(node);
  const isLocked = !isAllowed;
  const hasSecProtection = isLocked || deptObj !== undefined;

  return (
    <div
      key={node.path}
      className={`tree-node ${isDraggingThis ? "is-dragging" : ""}`}
    >
      <div
        className={`tree-file-item ${isFileActive ? "active" : ""} ${!isMarkdown ? "non-markdown" : ""} ${isDraggingThis ? "is-dragging" : ""} ${isDragOverThis ? "drag-over" : ""}`}
        style={depth !== undefined ? { paddingLeft: `${depth * 14 + 8}px` } : undefined}
        data-tree-path={node.path}
        draggable={!isRenamingThis}
        onDragStart={(e) => {
          if (isRenamingThis) {
            e.preventDefault();
            return;
          }
          onDragStart(e, node, false, repoNameForNode);
        }}
        onDragEnd={onDragEnd}
        onDragOver={(e) => onDragOverFile(e, node.path)}
        onDragLeave={(e) => onDragLeaveFile(e, node.path)}
        onDrop={(e) => onDropOnFile(e, node.path, repoNameForNode)}
        onClick={() => onFileClick(node.path, node.name, repoNameForNode)}
        title={`Abrir ${node.name}`}
      >
        <div className="tree-file-left">
          {isMarkdown ? (
            <span
              className={`tree-dot ${dynamicTaxonomyColor ? "" : "dot-default"}`}
              style={
                dynamicTaxonomyColor
                  ? {
                      backgroundColor: dynamicTaxonomyColor,
                      boxShadow: `0 0 6px ${dynamicTaxonomyColor}66`,
                    }
                  : undefined
              }
            />
          ) : ["csv", "tsv", "xlsx", "xls"].includes(fileExt) ? (
            <FileSpreadsheet
              size={13}
              color="#a6e3a1"
              style={{ flexShrink: 0 }}
            />
          ) : ["pdf"].includes(fileExt) ? (
            <FileText size={13} color="#f38ba8" style={{ flexShrink: 0 }} />
          ) : ["docx", "doc"].includes(fileExt) ? (
            <FileText size={13} color="#89b4fa" style={{ flexShrink: 0 }} />
          ) : ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(fileExt) ? (
            <ImageIcon size={13} color="#fab387" style={{ flexShrink: 0 }} />
          ) : (
            <FileCode size={13} color="#89b4fa" style={{ flexShrink: 0 }} />
          )}

          {isRenamingThis ? (
            <input
              ref={inlineRenameInputRef}
              type="text"
              className="tree-inline-input"
              value={inlineRenameValue}
              onChange={(e) => setInlineRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  onConfirmInlineRename();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  onCancelInlineRename();
                }
              }}
              onBlur={onConfirmInlineRename}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onDragStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
          ) : (
            <span className="tree-file-name">{node.name}</span>
          )}

          {gitStatusCode && (
            <span
              className="tree-git-status-badge"
              title={
                gitStatusCode === "M"
                  ? "Documento Alterado (Rascunho)"
                  : gitStatusCode === "A"
                    ? "Documento Adicionado"
                    : gitStatusCode === "U"
                      ? "Novo Documento"
                      : "Alterado"
              }
              style={{
                fontSize: "9.5px",
                fontWeight: 800,
                padding: "1px 4px",
                borderRadius: "3px",
                fontFamily: "var(--font-mono)",
                background:
                  gitStatusCode === "M"
                    ? "rgba(234, 179, 8, 0.2)"
                    : gitStatusCode === "A" || gitStatusCode === "U"
                      ? "rgba(34, 197, 94, 0.2)"
                      : "rgba(239, 68, 68, 0.2)",
                color:
                  gitStatusCode === "M"
                    ? "#d97706"
                    : gitStatusCode === "A" || gitStatusCode === "U"
                      ? "#16a34a"
                      : "#dc2626",
                marginLeft: "4px",
                lineHeight: "1.2",
              }}
            >
              {gitStatusCode}
            </span>
          )}
        </div>

        <div className="tree-file-right">
          {hasSecProtection && deptObj && (
            <span
              className="tree-badge-security"
              title={`Cofre: ${deptObj.name} - ${isLocked ? "Bloqueado por Chave de Cofre" : "Acesso Autorizado"}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                padding: "1px 5px",
                borderRadius: "4px",
                fontSize: "10px",
                fontWeight: 600,
                marginRight: "4px",
                backgroundColor: isLocked
                  ? "rgba(239, 68, 68, 0.14)"
                  : "rgba(16, 185, 129, 0.14)",
                color: isLocked ? "#ef4444" : "#10b981",
                border: `1px solid ${isLocked ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
              }}
            >
              {isLocked ? <Lock size={10} /> : <span style={{ fontSize: "10px" }}>🛡️</span>}
              <span>{(deptObj.name || "").slice(0, 10)}</span>
            </span>
          )}

          <div
            className="tree-file-actions"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="btn-tree-action"
              title="Renomear documento"
              onClick={(e) =>
                onStartInlineRename(node.path, node.name, false, e)
              }
            >
              <Edit3 size={11} />
            </button>
            <button
              className="btn-tree-action"
              title="Duplicar documento"
              onClick={(e) => onDuplicateFile(node.path, repoNameForNode, e)}
            >
              <Copy size={11} />
            </button>
            <button
              className="btn-tree-action delete"
              title="Excluir documento"
              onClick={(e) =>
                onPromptDeleteItem(
                  node.path,
                  node.name,
                  false,
                  repoNameForNode,
                  e,
                )
              }
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

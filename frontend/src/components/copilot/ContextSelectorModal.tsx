import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { TreeNode } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useCopilotStore } from '../../stores/copilotStore';
import { useBackdropClose } from '../ui';

interface ContextSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Utility: Recursively find all files inside a directory node
function getFilesUnderNode(node: TreeNode): string[] {
  const isDir = node.type === 'dir' || node.type === 'directory' || Boolean(node.is_directory);
  if (!isDir) {
    return [node.path];
  }
  let files: string[] = [];
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      files = files.concat(getFilesUnderNode(child));
    }
  }
  return files;
}

// Utility: Find node by path in tree
function findNodeByPath(nodes: TreeNode[], targetPath: string): TreeNode | null {
  for (const n of nodes) {
    if (n.path === targetPath) return n;
    if (n.children && n.children.length > 0) {
      const found = findNodeByPath(n.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

// Utility: Expand a list of referencedDocs (which may contain folder paths or file paths) into a Set of file paths
function expandReferencesToFiles(referencedPaths: string[], tree: TreeNode[]): Set<string> {
  const fileSet = new Set<string>();
  for (const p of referencedPaths) {
    const node = findNodeByPath(tree, p);
    if (node) {
      const files = getFilesUnderNode(node);
      for (const f of files) fileSet.add(f);
    } else {
      fileSet.add(p);
    }
  }
  return fileSet;
}

// Utility: Collapse selected files into folder references when 100% of files in a folder are selected.
// If any file was removed from a folder, only the remaining individual files are retained.
function collapseFilesToReferences(selectedFiles: Set<string>, tree: TreeNode[]): string[] {
  const remainingFiles = new Set(selectedFiles);
  const collapsedReferences: string[] = [];

  function processNode(node: TreeNode): boolean {
    const isDir = node.type === 'dir' || node.type === 'directory' || Boolean(node.is_directory);
    if (!isDir) {
      return remainingFiles.has(node.path);
    }

    const filesUnder = getFilesUnderNode(node);
    if (filesUnder.length === 0) return false;

    // Check if ALL files in this folder are in selectedFiles
    const allSelected = filesUnder.every((f) => selectedFiles.has(f));

    if (allSelected) {
      // 100% of files selected -> Represent as the full folder!
      collapsedReferences.push(node.path);
      for (const f of filesUnder) {
        remainingFiles.delete(f);
      }
      return true;
    }

    // Otherwise, process children recursively to see if sub-folders can collapse
    if (node.children) {
      for (const child of node.children) {
        processNode(child);
      }
    }
    return false;
  }

  // Process root nodes
  for (const rootNode of tree) {
    processNode(rootNode);
  }

  // Any leftover files that belong to partially selected folders are added individually
  for (const f of remainingFiles) {
    collapsedReferences.push(f);
  }

  return collapsedReferences;
}

// Checkbox helper with indeterminate support
const IndeterminateCheckbox: React.FC<{
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}> = ({ checked, indeterminate, onChange }) => {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      style={{ cursor: 'pointer', margin: 0 }}
      onClick={(e) => e.stopPropagation()}
    />
  );
};

export const ContextSelectorModal: React.FC<ContextSelectorModalProps> = ({ isOpen, onClose }) => {
  const backdropHandlers = useBackdropClose(onClose);
  const { tree, activeFile } = useWorkspace();
  const { referencedDocs, setReferencedDocs, setIsGlobalScope } = useCopilotStore();

  const [selectedFilePaths, setSelectedFilePaths] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // Initialize selected files from current referencedDocs
  useEffect(() => {
    if (isOpen) {
      const initialFiles = expandReferencesToFiles(referencedDocs, tree);
      setSelectedFilePaths(initialFiles);
      setSearchQuery('');

      // Auto-expand folders that contain selected files
      const newExpanded: Record<string, boolean> = {};
      const autoExpand = (nodes: TreeNode[]) => {
        for (const n of nodes) {
          const isDir = n.type === 'dir' || n.type === 'directory' || Boolean(n.is_directory);
          if (isDir) {
            const files = getFilesUnderNode(n);
            if (files.some((f) => initialFiles.has(f))) {
              newExpanded[n.path] = true;
            }
            if (n.children) autoExpand(n.children);
          }
        }
      };
      autoExpand(tree);
      setExpandedFolders((prev) => ({ ...prev, ...newExpanded }));
    }
  }, [isOpen, referencedDocs, tree]);

  // Toggle single file
  const handleToggleFile = (filePath: string) => {
    setSelectedFilePaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  // Toggle directory (select all files under it or deselect all if already fully selected)
  const handleToggleDirectory = (dirNode: TreeNode) => {
    const filesUnder = getFilesUnderNode(dirNode);
    if (filesUnder.length === 0) return;

    const allSelected = filesUnder.every((f) => selectedFilePaths.has(f));

    setSelectedFilePaths((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        // Deselect all files in this directory
        for (const f of filesUnder) next.delete(f);
      } else {
        // Select all files in this directory
        for (const f of filesUnder) next.add(f);
      }
      return next;
    });

    // Automatically expand the folder so the user sees the checked items
    setExpandedFolders((prev) => ({ ...prev, [dirNode.path]: true }));
  };

  // Toggle folder accordion expand/collapse
  const handleToggleFolderExpand = (folderPath: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }));
  };

  // Quick select active file
  const handleAddActiveFile = () => {
    if (activeFile) {
      setSelectedFilePaths((prev) => {
        const next = new Set(prev);
        next.add(activeFile);
        return next;
      });
    }
  };

  // Select all files in workspace
  const handleSelectAll = () => {
    const allFiles = new Set<string>();
    const collect = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.type === 'file') allFiles.add(n.path);
        if (n.children) collect(n.children);
      }
    };
    collect(tree);
    setSelectedFilePaths(allFiles);
  };

  // Clear all selection
  const handleClearAll = () => {
    setSelectedFilePaths(new Set());
  };

  // Expand / Collapse all folders
  const handleExpandAll = () => {
    const allDirs: Record<string, boolean> = {};
    const collect = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        const isDir = n.type === 'dir' || n.type === 'directory' || Boolean(n.is_directory);
        if (isDir) {
          allDirs[n.path] = true;
          if (n.children) collect(n.children);
        }
      }
    };
    collect(tree);
    setExpandedFolders(allDirs);
  };

  // Compute final collapsed references (folders if 100% selected, individual files otherwise)
  const collapsedReferences = useMemo(() => {
    return collapseFilesToReferences(selectedFilePaths, tree);
  }, [selectedFilePaths, tree]);

  // Apply selection to Copilot Store and close modal
  const handleApply = () => {
    setReferencedDocs(collapsedReferences);
    if (collapsedReferences.length === 0) {
      setIsGlobalScope(true);
    }
    onClose();
  };

  if (!isOpen) return null;

  // Render Tree Node recursively
  const renderTreeNode = (node: TreeNode, depth = 0) => {
    const isDir = node.type === 'dir' || node.type === 'directory' || Boolean(node.is_directory);
    const filesUnder = isDir ? getFilesUnderNode(node) : [];

    let isChecked = false;
    let isIndeterminate = false;

    if (isDir) {
      const selectedCount = filesUnder.filter((f) => selectedFilePaths.has(f)).length;
      if (selectedCount === filesUnder.length && filesUnder.length > 0) {
        isChecked = true;
      } else if (selectedCount > 0) {
        isIndeterminate = true;
      }
    } else {
      isChecked = selectedFilePaths.has(node.path);
    }

    const isExpanded = Boolean(expandedFolders[node.path]);

    // Search filter matching
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesSelf = node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q);
      const matchesChild = isDir && filesUnder.some((f) => f.toLowerCase().includes(q));
      if (!matchesSelf && !matchesChild) return null;
    }

    return (
      <div key={node.path} style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 8px',
            paddingLeft: `${depth * 18 + 8}px`,
            borderRadius: '6px',
            background: isChecked
              ? 'var(--color-primary-container, #eff6ff)'
              : isIndeterminate
              ? 'rgba(59, 130, 246, 0.06)'
              : 'transparent',
            border: isChecked
              ? '1px solid var(--color-primary, #3b82f6)'
              : isIndeterminate
              ? '1px dashed #93c5fd'
              : '1px solid transparent',
            marginBottom: '2px',
            cursor: 'pointer',
            transition: 'background 0.12s ease',
          }}
          onClick={() => {
            if (isDir) {
              handleToggleDirectory(node);
            } else {
              handleToggleFile(node.path);
            }
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', flex: 1 }}>
            {/* Folder expansion toggle */}
            {isDir ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleFolderExpand(node.path);
                }}
                style={{
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--text-muted, #64748b)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                  {isExpanded ? 'expand_more' : 'chevron_right'}
                </span>
              </button>
            ) : (
              <span style={{ width: '15px' }} />
            )}

            {/* Checkbox */}
            <IndeterminateCheckbox
              checked={isChecked}
              indeterminate={isIndeterminate}
              onChange={() => {
                if (isDir) {
                  handleToggleDirectory(node);
                } else {
                  handleToggleFile(node.path);
                }
              }}
            />

            {/* Icon */}
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: '15px',
                color: isDir
                  ? isChecked
                    ? 'var(--color-primary, #2563eb)'
                    : '#3b82f6'
                  : '#64748b',
                flexShrink: 0,
              }}
            >
              {isDir ? (isExpanded ? 'folder_open' : 'folder') : 'description'}
            </span>

            {/* Label */}
            <span
              style={{
                fontSize: '12px',
                fontWeight: isChecked || isIndeterminate ? 600 : isDir ? 500 : 400,
                color: isChecked
                  ? 'var(--color-primary, #1d4ed8)'
                  : isIndeterminate
                  ? '#1e40af'
                  : 'var(--color-on-surface, #1e293b)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {node.name}{isDir ? '/' : ''}
            </span>
          </div>

          {/* Directory selected count badge */}
          {isDir && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: '10px',
                background: isChecked
                  ? 'var(--color-primary, #2563eb)'
                  : isIndeterminate
                  ? '#dbeafe'
                  : 'var(--color-surface-container-high, #e2e8f0)',
                color: isChecked
                  ? '#ffffff'
                  : isIndeterminate
                  ? '#1e40af'
                  : 'var(--color-on-surface-variant, #475569)',
                flexShrink: 0,
              }}
              title={`${filesUnder.filter((f) => selectedFilePaths.has(f)).length} de ${filesUnder.length} arquivos selecionados`}
            >
              {filesUnder.filter((f) => selectedFilePaths.has(f)).length}/{filesUnder.length} docs
            </span>
          )}
        </div>

        {/* Children if expanded */}
        {isDir && (isExpanded || Boolean(searchQuery.trim())) && node.children && (
          <div>
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out',
      }}
      {...backdropHandlers}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '85vh',
          background: 'var(--color-surface, #ffffff)',
          borderRadius: '14px',
          border: '1px solid var(--color-outline-variant, #cbd5e1)',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideUp 0.18s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-outline-variant, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--color-surface-container-low, #f8fafc)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '20px', color: 'var(--color-primary, #2563eb)' }}
            >
              account_tree
            </span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-on-surface, #0f172a)' }}>
                Seletor de Contexto do Workspace
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>
                Marque diretórios inteiros ou arquivos avulsos para compor o contexto do Copilot
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted, #64748b)',
              padding: '4px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              close
            </span>
          </button>
        </div>

        {/* Search & Quick Actions Bar */}
        <div
          style={{
            padding: '10px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            borderBottom: '1px solid var(--color-outline-variant, #f1f5f9)',
          }}
        >
          {/* Search Input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--color-surface-container-high, #f1f5f9)',
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid var(--color-outline-variant, #cbd5e1)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--text-muted, #94a3b8)' }}>
              search
            </span>
            <input
              type="text"
              placeholder="Buscar arquivos ou pastas por nome ou caminho..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: '12px',
                color: 'var(--color-on-surface, #1e293b)',
              }}
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: 0 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                  cancel
                </span>
              </button>
            )}
          </div>

          {/* Quick Shortcuts */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {activeFile && (
              <button
                type="button"
                onClick={handleAddActiveFile}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: selectedFilePaths.has(activeFile) ? '#eff6ff' : '#ffffff',
                  border: selectedFilePaths.has(activeFile) ? '1px solid #3b82f6' : '1px solid #cbd5e1',
                  color: selectedFilePaths.has(activeFile) ? '#1d4ed8' : '#475569',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                  edit_document
                </span>
                + Doc Ativo ({activeFile.split('/').pop()})
              </button>
            )}

            <button
              type="button"
              onClick={handleSelectAll}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '6px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#475569',
                fontSize: '11px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                select_all
              </span>
              Selecionar Tudo
            </button>

            <button
              type="button"
              onClick={handleExpandAll}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '6px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#475569',
                fontSize: '11px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                unfold_more
              </span>
              Expandir Pastas
            </button>

            {selectedFilePaths.size > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginLeft: 'auto',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                  clear_all
                </span>
                Limpar ({selectedFilePaths.size})
              </button>
            )}
          </div>
        </div>

        {/* Tree Container */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 16px',
            minHeight: '260px',
            maxHeight: '380px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {tree.length > 0 ? (
            tree.map((node) => renderTreeNode(node, 0))
          ) : (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '32px', fontSize: '12px' }}>
              Nenhum arquivo encontrado no repositório.
            </div>
          )}
        </div>

        {/* Selected Items Summary Strip */}
        <div
          style={{
            padding: '8px 16px',
            background: 'var(--color-surface-container-high, #f1f5f9)',
            borderTop: '1px solid var(--color-outline-variant, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflowX: 'auto',
            minHeight: '38px',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', flexShrink: 0 }}>
            Contexto Ativo ({collapsedReferences.length}):
          </span>

          {collapsedReferences.length === 0 ? (
            <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
              Nenhum item selecionado (Modo Global ativo).
            </span>
          ) : (
            collapsedReferences.map((p) => {
              const node = findNodeByPath(tree, p);
              const isDir = Boolean(node && (node.type === 'dir' || node.type === 'directory' || node.is_directory));
              const filesUnder = node && isDir ? getFilesUnderNode(node) : [];
              const label = p.split('/').pop() || p;

              return (
                <div
                  key={p}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    background: isDir ? 'var(--color-tertiary-container, #f3e8ff)' : 'var(--color-primary-container, #dbeafe)',
                    border: isDir ? '1px solid var(--color-tertiary, #c084fc)' : '1px solid var(--color-primary, #93c5fd)',
                    fontSize: '10.5px',
                    color: isDir ? '#6b21a8' : '#1e40af',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                  title={isDir ? `Diretório completo: ${p} (${filesUnder.length} arquivos)` : `Arquivo: ${p}`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                    {isDir ? 'folder' : 'description'}
                  </span>
                  <span>{label}{isDir ? '/' : ''}</span>
                  {isDir && (
                    <span style={{ fontSize: '9.5px', opacity: 0.85 }}>({filesUnder.length})</span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isDir && node) {
                        handleToggleDirectory(node);
                      } else {
                        handleToggleFile(p);
                      }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      color: isDir ? '#6b21a8' : '#1e40af',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title="Remover do contexto"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                      close
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--color-outline-variant, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--color-surface, #ffffff)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--color-outline-variant, #cbd5e1)',
              background: '#ffffff',
              color: '#475569',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleApply}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 16px',
              borderRadius: '6px',
              background: 'var(--color-primary, #2563eb)',
              color: '#ffffff',
              border: 'none',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
              check
            </span>
            {collapsedReferences.length === 0
              ? 'Usar Modo Global'
              : `Aplicar Contexto (${collapsedReferences.length} ${collapsedReferences.length === 1 ? 'item' : 'itens'})`}
          </button>
        </div>
      </div>
    </div>
  );
};

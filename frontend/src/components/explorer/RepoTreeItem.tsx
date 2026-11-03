import React, { memo } from "react";
import {
  ChevronRight,
  FolderGit2,
  Cloud,
  Shield,
  RefreshCw,
  Laptop,
  Upload,
  FilePlus,
  FolderPlus,
  Trash2,
  Lock,
  Mail,
} from "lucide-react";
import type { Repo, TreeNode } from "../../types";
import { InlineCreateRow } from "./InlineCreateRow";
import { FlatTreeList } from "./FlatTreeList";

interface RepoTreeItemProps {
  repo: Repo;
  isActive: boolean;
  isCollapsed: boolean;
  repoDisplayNodes: TreeNode[];
  isRepoLoading: boolean;
  canAdminRepo: boolean;
  dragOverTarget: string | null;
  repoProgress?: Record<string, { stage: string; percent: number; message?: string }>;
  loadingRepos: Record<string, boolean>;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  onSelectRepo: (r: Repo, e?: React.MouseEvent) => void;
  onToggleCollapse: (r: Repo, e?: React.MouseEvent) => void;
  onOpenGovernance: (r: Repo) => void;
  onSyncRepo: (r: Repo, e: React.MouseEvent) => void;
  onOpenInOS: (path: string, e?: React.MouseEvent, repoName?: string) => void;
  onOpenImport: (targetFolder: string, repoName?: string) => void;
  onStartInlineCreate: (parentPath: string, isFolder: boolean, e?: React.MouseEvent) => void;
  onDeleteRepoPrompt: (r: Repo) => void;
  onCloneRepo: (r: Repo, e: React.MouseEvent) => void;
  onOpenLockedRepo: (r: Repo) => void;
  onDragOverRepo: (e: React.DragEvent, targetRepoName: string) => void;
  onDragLeaveRepo: (e: React.DragEvent, targetRepoName: string) => void;
  onDropOnRepo: (e: React.DragEvent, targetRepoName: string) => void;
  // FileTreeNode props
  treeNodeProps: any;
}

export const RepoTreeItem: React.FC<RepoTreeItemProps> = memo((props) => {
  const {
    repo: r,
    isActive,
    isCollapsed,
    repoDisplayNodes,
    isRepoLoading,
    canAdminRepo,
    dragOverTarget,
    loadingRepos,
    onSelectRepo,
    onToggleCollapse,
    onOpenGovernance,
    onSyncRepo,
    onOpenInOS,
    onOpenImport,
    onStartInlineCreate,
    onDeleteRepoPrompt,
    onCloneRepo,
    onOpenLockedRepo,
    onDragOverRepo,
    onDragLeaveRepo,
    onDropOnRepo,
    treeNodeProps,
  } = props;

  if (r.is_pending_invitation) {
    return (
      <div
        key={`org-repo-invitation-${r.name}`}
        onClick={(e) => onSelectRepo(r, e)}
        className="tree-repo-header"
        style={{
          backgroundColor: "rgba(245, 158, 11, 0.08)",
          border: "1px dashed rgba(245, 158, 11, 0.35)",
          cursor: "pointer",
        }}
        title={`Convite pendente de @${r.inviter || "Admin"} para ${r.name}. Clique para aceitar e sincronizar.`}
      >
        <div className="tree-repo-left">
          <Mail size={13} color="#f59e0b" style={{ flexShrink: 0 }} />
          <span
            className="tree-repo-name"
            style={{ color: "var(--text-heading)", fontWeight: 600 }}
          >
            {r.name}
          </span>
        </div>
        <span
          className="tree-repo-badge"
          style={{
            backgroundColor: "rgba(245, 158, 11, 0.15)",
            color: "#d97706",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            fontSize: "10px",
            padding: "2px 7px",
            borderRadius: "9999px",
            fontWeight: 600,
          }}
        >
          Aceitar Convite
        </span>
      </div>
    );
  }

  const isLocked =
    Boolean(r.is_locked) ||
    (r.permissions && !r.permissions.pull && !r.permissions.admin);

  if (isLocked) {
    return (
      <div
        key={`org-repo-locked-${r.name}`}
        onClick={() => onOpenLockedRepo(r)}
        className="tree-repo-header"
        style={{ opacity: 0.75 }}
        title={`Repositório restrito: ${r.name}. Clique para detalhes.`}
      >
        <div className="tree-repo-left">
          <Lock size={13} color="#ef4444" style={{ flexShrink: 0 }} />
          <span
            className="tree-repo-name"
            style={{ color: "var(--text-heading)" }}
          >
            {r.name}
          </span>
        </div>
        <span className="tree-repo-badge locked">Sem Acesso</span>
      </div>
    );
  }

  const isUncloned = !r.is_cloned_locally;

  return (
    <div key={`org-repo-node-${r.name}`} className="tree-repo-root-item">
      {/* Linha da Pasta Raiz (Repositório) */}
      <div
        className={`tree-repo-header ${isActive ? "is-active" : ""} ${isUncloned ? "is-uncloned" : ""} ${dragOverTarget === `__repo__:${r.name}` ? "drag-over" : ""}`}
        onClick={(e) => onSelectRepo(r, e)}
        onDragOver={(e) => onDragOverRepo(e, r.name)}
        onDragLeave={(e) => onDragLeaveRepo(e, r.name)}
        onDrop={(e) => onDropOnRepo(e, r.name)}
        title={
          isUncloned
            ? `Repositório remoto: ${r.name} (não clonado). O primeiro acesso iniciará a sincronização local.`
            : `Repositório: ${r.name}`
        }
      >
        <div className="tree-repo-left">
          <span
            className="tree-caret"
            style={{
              transform: !isCollapsed ? "rotate(90deg)" : "none",
            }}
            onClick={(e) => onToggleCollapse(r, e)}
          >
            <ChevronRight size={12} />
          </span>

          <FolderGit2
            size={14}
            color={
              isActive
                ? "var(--primary, #2563eb)"
                : isUncloned
                  ? "var(--md-sys-color-outline, #94a3b8)"
                  : "#64748b"
            }
            style={{ flexShrink: 0 }}
          />

          <span
            className="tree-repo-name"
            style={{
              color:
                isUncloned && !isActive
                  ? "var(--md-sys-color-outline, #94a3b8)"
                  : undefined,
            }}
          >
            {r.name}
          </span>

          {isUncloned && (
            <span
              className="tree-repo-uncloned-tag"
              title="Repositório remoto (na nuvem). Ao selecionar, será sincronizado localmente."
              style={{
                display: "inline-flex",
                alignItems: "center",
                color: "var(--md-sys-color-outline, #94a3b8)",
                opacity: 0.85,
                marginLeft: "6px",
              }}
            >
              <Cloud size={12} />
            </span>
          )}

          {dragOverTarget === `__repo__:${r.name}` && (
            <span
              className="tree-repo-drop-hint"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                fontSize: "10px",
                fontWeight: 700,
                color: "var(--primary, #2563eb)",
                backgroundColor: "rgba(37, 99, 235, 0.14)",
                padding: "1px 6px",
                borderRadius: "4px",
                marginLeft: "6px",
              }}
            >
              Soltar na raiz
            </span>
          )}

          {isActive && (
            <span
              className="tree-repo-active-dot"
              title="Repositório ativo"
            />
          )}
        </div>

        {/* Ações de Contexto no Nível Raiz do Repositório */}
        <div
          className="tree-repo-actions"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 1. Governança & Acessos */}
          <button
            type="button"
            className="btn-tree-action"
            title="Governança & Acessos do Repositório"
            onClick={() => onOpenGovernance(r)}
          >
            <Shield size={12} />
          </button>

          {/* 2. Sincronizar Git */}
          <button
            type="button"
            className={`btn-tree-action ${loadingRepos[r.name] ? "is-loading" : ""}`}
            title={
              loadingRepos[r.name]
                ? "Sincronizando..."
                : "Sincronizar Repositório"
            }
            disabled={loadingRepos[r.name]}
            onClick={(e) => onSyncRepo(r, e)}
          >
            <RefreshCw
              size={12}
              className={loadingRepos[r.name] ? "spinning" : ""}
            />
          </button>

          {/* 3. Abrir Repositório no Gerenciador de Arquivos do PC */}
          <button
            type="button"
            className="btn-tree-action"
            title={`Abrir repositório "${r.name}" no gerenciador de arquivos do PC`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenInOS("", e, r.name);
            }}
          >
            <Laptop size={12} />
          </button>

          {/* 4. Importar Arquivos na Raiz deste Repositório */}
          <button
            type="button"
            className="btn-tree-action"
            title={`Importar arquivos na raiz de "${r.name}"`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenImport("", r.name);
            }}
          >
            <Upload size={12} />
          </button>

          {/* 5. Novo Arquivo na Raiz deste Repo */}
          <button
            type="button"
            className="btn-tree-action"
            title="Novo Arquivo neste repositório"
            onClick={async (e) => {
              e.stopPropagation();
              if (!isActive) await onSelectRepo(r);
              onStartInlineCreate("", false);
            }}
          >
            <FilePlus size={12} />
          </button>

          {/* 6. Nova Pasta na Raiz deste Repo */}
          <button
            type="button"
            className="btn-tree-action"
            title="Nova Pasta neste repositório"
            onClick={async (e) => {
              e.stopPropagation();
              if (!isActive) await onSelectRepo(r);
              onStartInlineCreate("", true);
            }}
          >
            <FolderPlus size={12} />
          </button>

          {/* 7. Excluir / Desvincular Repositório */}
          <button
            type="button"
            className="btn-tree-action delete"
            title={
              canAdminRepo
                ? "Excluir Repositório"
                : r.is_cloned_locally
                  ? "Desvincular Repositório Local"
                  : "Opções do Repositório"
            }
            onClick={(e) => {
              e.stopPropagation();
              onDeleteRepoPrompt(r);
            }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Conteúdo Expandido do Repositório */}
      {!isCollapsed && (
        <div
          className={`tree-repo-children-container ${dragOverTarget === `__repo__:${r.name}` ? "drag-over-repo-container" : ""}`}
          onDragOver={(e) => onDragOverRepo(e, r.name)}
          onDragLeave={(e) => onDragLeaveRepo(e, r.name)}
          onDrop={(e) => onDropOnRepo(e, r.name)}
        >


          {repoDisplayNodes.length > 0 ? (
            <FlatTreeList
              nodes={repoDisplayNodes}
              repoName={r.name}
              expandedFolders={treeNodeProps.expandedFolders}
              inlineCreating={isActive ? treeNodeProps.inlineCreating : null}
              scrollContainerRef={props.scrollContainerRef}
              treeNodeProps={treeNodeProps}
            />
          ) : isActive && treeNodeProps.inlineCreating?.parentPath === "" ? (
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
          ) : null}

          {repoDisplayNodes.length === 0 && (
            isRepoLoading ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 12px",
                  fontSize: "11.5px",
                  color: "var(--md-sys-color-on-surface-variant, #5f6368)",
                }}
              >
                <span
                  className="material-symbols-outlined spinning"
                  style={{ fontSize: "14px" }}
                >
                  progress_activity
                </span>
                <span>Carregando arquivos...</span>
              </div>
            ) : !r.is_cloned_locally ? (
              <div
                className="tree-repo-empty-hint"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  padding: "16px 12px",
                  textAlign: "center",
                  backgroundColor:
                    "var(--md-sys-color-surface-container-low, #f8f9fa)",
                  borderRadius: "8px",
                  margin: "4px 8px 8px 8px",
                  border:
                    "1px dashed var(--md-sys-color-outline-variant, #dadce0)",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--md-sys-color-on-surface, #202124)",
                  }}
                >
                  Repositório Remoto (GitHub)
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--md-sys-color-on-surface-variant, #5f6368)",
                    lineHeight: 1.3,
                  }}
                >
                  Clone os arquivos para editar e propor alterações.
                </span>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{
                    fontSize: "11.5px",
                    fontWeight: 600,
                    padding: "5px 10px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    borderRadius: "6px",
                    marginTop: "2px",
                  }}
                  disabled={loadingRepos[r.name]}
                  onClick={(e) => onCloneRepo(r, e)}
                >
                  {loadingRepos[r.name] ? (
                    <span
                      className="material-symbols-outlined spinning"
                      style={{ fontSize: "14px" }}
                    >
                      progress_activity
                    </span>
                  ) : (
                    <Upload size={12} />
                  )}
                  <span>Trabalhar localmente</span>
                </button>
              </div>
            ) : !treeNodeProps.inlineCreating ? (
              <div
                className="tree-repo-empty-hint"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  padding: "16px 12px",
                  textAlign: "center",
                  border:
                    dragOverTarget === `__repo__:${r.name}`
                      ? "1.5px dashed var(--primary, #2563eb)"
                      : undefined,
                  backgroundColor:
                    dragOverTarget === `__repo__:${r.name}`
                      ? "rgba(37, 99, 235, 0.05)"
                      : undefined,
                  borderRadius: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                  }}
                >
                  Nenhum arquivo encontrado neste repositório.
                </span>
                <div
                  style={{
                    display: "flex",
                    gap: "6px",
                    width: "100%",
                    maxWidth: "220px",
                  }}
                >
                  <button
                    className="btn btn-primary btn-sm"
                    style={{
                      flex: 1,
                      fontSize: "11px",
                      padding: "4px 6px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "4px",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isActive) onSelectRepo(r);
                      onStartInlineCreate("", false);
                    }}
                  >
                    <FilePlus size={12} />
                    <span>Novo Arquivo</span>
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{
                      flex: 1,
                      fontSize: "11px",
                      padding: "4px 6px",
                      border: "1px solid var(--border)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "4px",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isActive) onSelectRepo(r);
                      onStartInlineCreate("", true);
                    }}
                  >
                    <FolderPlus size={12} />
                    <span>Nova Pasta</span>
                  </button>
                </div>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
});

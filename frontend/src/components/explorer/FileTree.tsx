import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Building2, FolderPlus, Upload, AlertCircle } from "lucide-react";
import type { TreeNode, TemplateItem, Repo } from "../../types";
import type {
  FileTreeProps,
  InlineCreatingState,
  InlineRenamingState,
  DeleteItemTarget,
  FileTreeToast,
} from "./types";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useSecurity } from "../../context/SecurityContext";
import { useAuth } from "../../context/AuthContext";
import { API } from "../../services/api";
import { useFileTreeState } from "./hooks/useFileTreeState";
import { useFileTreeDnD } from "./hooks/useFileTreeDnD";
import { FileTreeToolbar } from "./FileTreeToolbar";
import { RepoTreeItem } from "./RepoTreeItem";
import { FileTreeModals } from "./FileTreeModals";
import { filesToScannedList } from "./utils/fileTreeUtils";

export const FileTree: React.FC<FileTreeProps> = ({
  onOpenFile,
  isCollapsed,
  onToggleCollapse,
  width,
}) => {
  const {
    tree,
    treesByRepo,
    activeFile,
    activeRepo,
    repos,
    selectRepo,
    loadRepos,
    activeOrg,
    loadTree,
    gitStatus,
    pendingChanges,
    refreshPendingChanges,
    refreshGitStatus,
    isLoadingWorkspace,
    isLoadingTree,
    moveFileOrFolder,
    duplicateFile,
    cloneLocalRepo,
    pullLocalRepo,
    resetActiveRepo,
    repoProgress,
  } = useWorkspace();

  const { user } = useAuth();
  const { canAccessDoc, departments } = useSecurity();
  const navigate = useNavigate();
  const { org, subview } = useParams<{ org?: string; subview?: string }>();

  const repoName = activeRepo?.name || "default";
  const isTreeLoading = Boolean(isLoadingWorkspace || isLoadingTree);

  // Modais State
  const [lockedRepoTarget, setLockedRepoTarget] = useState<Repo | null>(null);
  const [createRepoModalOpen, setCreateRepoModalOpen] = useState(false);
  const [deleteRepoTarget, setDeleteRepoTarget] = useState<Repo | null>(null);
  const [deleteItemTarget, setDeleteItemTarget] = useState<DeleteItemTarget | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);
  const [governanceRepoTarget, setGovernanceRepoTarget] = useState<Repo | null>(null);

  // Repositórios colapsados e loadings
  const [collapsedRepos, setCollapsedRepos] = useState<Record<string, boolean>>({});
  const [loadingRepos, setLoadingRepos] = useState<Record<string, boolean>>({});

  // Inline Creation State
  const [inlineCreating, setInlineCreating] = useState<InlineCreatingState | null>(null);
  const [inlineValue, setInlineValue] = useState("");
  const isSubmittingInlineRef = useRef(false);

  // Template Picker State
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  // Inline Renaming State
  const [inlineRenaming, setInlineRenaming] = useState<InlineRenamingState | null>(null);
  const [inlineRenameValue, setInlineRenameValue] = useState("");
  const inlineRenameInputRef = useRef<HTMLInputElement>(null);
  const isSubmittingRenameRef = useRef(false);

  // Toast Notification
  const [toast, setToast] = useState<FileTreeToast | null>(null);
  const toastTimerRef = useRef<any>(null);

  const showToast = useCallback((message: string, type: "info" | "warning" = "info") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 3500);
  }, []);

  // Hook de navegação, expansão e scroll
  const {
    searchTerm,
    setSearchTerm,
    expandedFolders,
    setExpandedFolders,
    selectedFolder,
    setSelectedFolder,
    treeScrollRef,
    handleTreeScroll,
    restoreScrollPosition,
    toggleFolder,
    handleCollapseAllFolders,
    handleExpandAllFolders,
  } = useFileTreeState({
    repoName,
    activeFile,
    isCollapsed,
    onToggleCollapse,
    showToast,
  });

  // Hook de Drag & Drop e Importação de Arquivos
  const {
    draggedItem,
    dragOverTarget,
    isDragOverRoot,
    isExternalDragActive,
    isImporting,
    importProgressMessage,
    targetUploadFolder,
    setTargetUploadFolder,
    targetUploadRepo,
    setTargetUploadRepo,
    fileInputRef,
    folderInputRef,
    handlePaneDragEnter,
    handlePaneDragLeave,
    handleImportFiles,
    handleDragStart,
    handleDragEnd,
    handleDragOverFolder,
    handleDragLeaveFolder,
    handleDropOnFolder,
    handleDragOverFile,
    handleDragLeaveFile,
    handleDropOnFile,
    handleDragOverRoot,
    handleDragLeaveRoot,
    handleDropOnRoot,
    handleDragOverRepo,
    handleDragLeaveRepo,
    handleDropOnRepo,
  } = useFileTreeDnD({
    activeRepo,
    loadTree,
    refreshPendingChanges,
    refreshGitStatus,
    moveFileOrFolder,
    onOpenFile,
    showToast,
    expandedFolders,
    setExpandedFolders,
    collapsedRepos,
    setCollapsedRepos,
    selectedFolder,
  });

  const canCreateRootRepo = useMemo(() => {
    if (!activeOrg) return true;
    if (activeOrg.role === "admin" || activeOrg.is_owner) return true;
    if (
      user?.login &&
      activeOrg.login.toLowerCase() === user.login.toLowerCase()
    )
      return true;
    // Membros de organização também têm permissão para criar repositórios (o GitHub permite caso a org habilite)
    if (activeOrg.role === "member") return true;
    // Se está em qualquer organização ativa válida onde o usuário tem acesso
    if (activeOrg.login && activeOrg.login !== "local") return true;
    return false;
  }, [activeOrg, user]);

  // Manipulação de seleção e colapso de repositórios
  const toggleRepoCollapse = useCallback(
    async (r: Repo, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      const isCurrentlyActive =
        r.name.toLowerCase() === activeRepo?.name.toLowerCase();
      const isCurrentlyCollapsed = collapsedRepos[r.name] ?? !isCurrentlyActive;
      const willBeExpanded = isCurrentlyCollapsed;
      setCollapsedRepos((prev) => ({ ...prev, [r.name]: !willBeExpanded }));

      if (
        willBeExpanded &&
        (!treesByRepo[r.name] || treesByRepo[r.name].length === 0)
      ) {
        if (!r.is_cloned_locally) {
          await handleSelectRepo(r, e);
        } else {
          setLoadingRepos((prev) => ({ ...prev, [r.name]: true }));
          try {
            await loadTree(r.name);
          } finally {
            setLoadingRepos((prev) => ({ ...prev, [r.name]: false }));
          }
        }
      }
    },
    [activeRepo?.name, collapsedRepos, treesByRepo, loadTree],
  );

  const handleSelectRepo = useCallback(
    async (r: Repo, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      const isCurrentlyActive =
        r.name.toLowerCase() === activeRepo?.name.toLowerCase();

      if (isCurrentlyActive) {
        await toggleRepoCollapse(r, e);
        return;
      }

      setCollapsedRepos((prev) => ({ ...prev, [r.name]: false }));
      setLoadingRepos((prev) => ({ ...prev, [r.name]: true }));
      const owner = r.owner || (r.full_name ? r.full_name.split("/")[0] : "");
      const isOrg =
        owner &&
        owner !== "local" &&
        !r.is_local &&
        owner.toLowerCase() !== (user?.login || "").toLowerCase();
      const repoPath = isOrg
        ? `/org/${encodeURIComponent(owner)}/repo/${encodeURIComponent(r.name)}/${subview || "editor"}`
        : `/repo/${encodeURIComponent(r.name)}/${subview || "editor"}`;
      navigate(repoPath);
      try {
        await selectRepo(r);
      } finally {
        setLoadingRepos((prev) => ({ ...prev, [r.name]: false }));
      }
    },
    [activeRepo?.name, user?.login, subview, navigate, selectRepo, toggleRepoCollapse],
  );

  const handleCloneRepo = useCallback(
    async (r: Repo, e: React.MouseEvent) => {
      e.stopPropagation();
      setCollapsedRepos((prev) => ({ ...prev, [r.name]: false }));
      setLoadingRepos((prev) => ({ ...prev, [r.name]: true }));
      try {
        const res = await cloneLocalRepo(r);
        if (!res.success) {
          showToast(res.error || "Falha ao baixar repositório", "warning");
        } else {
          showToast(`Repositório ${r.name} baixado com sucesso!`, "info");
        }
      } catch (err) {
        showToast((err as Error)?.message || "Erro ao clonar repositório", "warning");
      } finally {
        setLoadingRepos((prev) => ({ ...prev, [r.name]: false }));
      }
    },
    [cloneLocalRepo, showToast],
  );

  const handleSyncRepo = useCallback(
    async (r: Repo, e: React.MouseEvent) => {
      e.stopPropagation();
      setLoadingRepos((prev) => ({ ...prev, [r.name]: true }));
      try {
        if (r.is_cloned_locally) {
          await pullLocalRepo(r);
        }
        if (r.name.toLowerCase() === activeRepo?.name.toLowerCase()) {
          await refreshGitStatus();
        }
        await loadTree(r.name);
      } finally {
        setLoadingRepos((prev) => ({ ...prev, [r.name]: false }));
      }
    },
    [activeRepo?.name, pullLocalRepo, refreshGitStatus, loadTree],
  );

  // Abertura no SO
  const handleOpenInOS = useCallback(
    async (path: string, e?: React.MouseEvent, targetRepoName?: string) => {
      e?.stopPropagation();
      try {
        const repo = targetRepoName || activeRepo?.name;
        const res = await API.openInOS(path, repo);
        if (res.ok) {
          showToast("Aberto no gerenciador de arquivos do PC.", "info");
        } else {
          showToast(
            res.data?.error || "Erro ao abrir no sistema operacional.",
            "warning",
          );
        }
      } catch {
        showToast("Erro ao conectar com o servidor.", "warning");
      }
    },
    [activeRepo?.name, showToast],
  );

  // Criação Inline de Arquivos / Pastas (Estilo VS Code)
  const startInlineCreate = useCallback(
    (parentPath: string = "", isFolder: boolean = false, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      isSubmittingInlineRef.current = false;

      if (parentPath) {
        setExpandedFolders((prev) => ({
          ...prev,
          [parentPath]: true,
        }));
      }

      setSelectedTemplate(null);
      setInlineCreating({ parentPath, isFolder });
      setInlineValue("");
    },
    [setExpandedFolders],
  );

  const handleCancelInlineCreate = useCallback(() => {
    setInlineCreating(null);
    setInlineValue("");
    setSelectedTemplate(null);
  }, []);

  const handleConfirmInlineCreate = useCallback(async () => {
    if (!inlineCreating || isSubmittingInlineRef.current) return;
    const rawName = inlineValue.trim();
    if (!rawName) {
      setInlineCreating(null);
      return;
    }

    isSubmittingInlineRef.current = true;
    const { parentPath, isFolder } = inlineCreating;
    let fileName = rawName;
    if (!isFolder) {
      const parts = fileName.split("/");
      const last = parts[parts.length - 1];
      if (!last.includes(".")) {
        fileName = `${fileName}.md`;
      } else if (last.endsWith(".")) {
        fileName = `${fileName.slice(0, -1)}.md`;
      }
    }

    const isMarkdown =
      !isFolder &&
      (fileName.toLowerCase().endsWith(".md") ||
        fileName.toLowerCase().endsWith(".markdown"));

    const targetPath = parentPath ? `${parentPath}/${fileName}` : fileName;
    const baseDocName = fileName.split("/").pop() || fileName;
    const docTitle = baseDocName.replace(/\.[^/.]+$/, "");
    const templateId = selectedTemplate?.id || "";

    try {
      const res = await API.createProjectFile({
        path: targetPath,
        is_folder: isFolder,
        content: "",
        templateId: templateId || undefined,
        repo: activeRepo?.name,
        meta: !isFolder
          ? {
              title: docTitle,
              status: "",
              categories: "",
              tags: [],
              approvers: [],
              links: [],
              templateId,
            }
          : undefined,
      });

      if (res.ok) {
        const createdPath = res.data?.path || targetPath;
        setInlineCreating(null);
        setInlineValue("");
        setSelectedTemplate(null);
        isSubmittingInlineRef.current = false;

        if (isFolder) {
          showToast(`Pasta "${rawName}" criada com sucesso.`, "info");
          setSelectedFolder(targetPath);
        } else {
          onOpenFile(createdPath);
          if (isMarkdown) {
            const systemPrompt =
              res.data?.systemPrompt || selectedTemplate?.systemPrompt || "";
            if (systemPrompt) {
              window.dispatchEvent(
                new CustomEvent("template:applied", {
                  detail: { templateId, systemPrompt, filePath: createdPath },
                }),
              );
            }
            showToast(
              templateId
                ? `Documento criado com template "${selectedTemplate?.title || templateId}".`
                : "Documento criado e aberto no editor.",
              "info",
            );
          } else {
            showToast(`Arquivo "${rawName}" criado e aberto.`, "info");
          }
        }

        loadTree(activeRepo?.name).catch(() => {});
        Promise.all([refreshPendingChanges(), refreshGitStatus()]).catch(() => {});
      } else {
        alert(res.data?.error || "Erro ao criar item na árvore.");
      }
    } catch {
      alert("Erro ao conectar com o servidor para criar item.");
    } finally {
      isSubmittingInlineRef.current = false;
    }
  }, [
    inlineCreating,
    inlineValue,
    selectedTemplate,
    activeRepo?.name,
    showToast,
    setSelectedFolder,
    onOpenFile,
    loadTree,
    refreshPendingChanges,
    refreshGitStatus,
  ]);

  // Renomeação Inline de Itens
  const startInlineRename = useCallback(
    (
      itemPath: string,
      currentName: string,
      isFolder: boolean,
      e?: React.MouseEvent,
    ) => {
      if (e) e.stopPropagation();
      setInlineCreating(null);
      setInlineRenaming({ path: itemPath, originalName: currentName, isFolder });
      setInlineRenameValue(currentName);
    },
    [],
  );

  const handleCancelInlineRename = useCallback(() => {
    setInlineRenaming(null);
    setInlineRenameValue("");
    isSubmittingRenameRef.current = false;
  }, []);

  const handleConfirmInlineRename = useCallback(async () => {
    if (!inlineRenaming || isSubmittingRenameRef.current) return;
    const new_name = inlineRenameValue.trim();
    const old_path = inlineRenaming.path;
    const old_name = inlineRenaming.originalName;

    if (!new_name || new_name === old_name) {
      handleCancelInlineRename();
      return;
    }

    isSubmittingRenameRef.current = true;
    const cleanOld = old_path.replace(/^\/+/, "").replace(/\/+$/, "");
    const parts = cleanOld.split("/");
    parts.pop();
    const parentDir = parts.join("/");
    const new_path = parentDir ? `${parentDir}/${new_name}` : new_name;

    try {
      const res = await API.renameProjectFile({
        old_path: cleanOld,
        new_path,
        repo: activeRepo?.name,
      });
      if (res.ok && res.data?.success) {
        handleCancelInlineRename();
        await loadTree();
        await Promise.all([refreshPendingChanges(), refreshGitStatus()]);
        if (activeFile === cleanOld) {
          const isMd =
            new_path.endsWith(".md") || new_path.endsWith(".markdown");
          if (isMd) {
            onOpenFile(new_path);
          } else {
            onOpenFile("");
          }
        }
        showToast("Item renomeado com sucesso.", "info");
      } else {
        showToast(
          `Erro ao renomear: ${res.data?.error || "Falha na operação"}`,
          "warning",
        );
        handleCancelInlineRename();
      }
    } catch {
      showToast("Erro ao conectar com o servidor para renomear.", "warning");
      handleCancelInlineRename();
    } finally {
      isSubmittingRenameRef.current = false;
    }
  }, [
    inlineRenaming,
    inlineRenameValue,
    activeRepo?.name,
    handleCancelInlineRename,
    loadTree,
    refreshPendingChanges,
    refreshGitStatus,
    activeFile,
    onOpenFile,
    showToast,
  ]);

  // Exclusão de Itens
  const promptDeleteItem = useCallback(
    (
      path: string,
      name: string,
      isFolder: boolean,
      repoName?: string,
      e?: React.MouseEvent,
    ) => {
      if (e) e.stopPropagation();
      setDeleteItemTarget({ path, name, isFolder, repoName });
    },
    [],
  );

  const handleConfirmDeleteItem = useCallback(async () => {
    if (!deleteItemTarget) return;
    setIsDeletingItem(true);
    const { path, isFolder, repoName: targetRepo } = deleteItemTarget;
    const repoToUse = targetRepo || activeRepo?.name;
    try {
      const res = await API.deleteProjectFile(path, repoToUse);
      if (res.ok && res.data?.success) {
        setDeleteItemTarget(null);
        await loadTree(repoToUse);
        if (repoToUse === activeRepo?.name) {
          await Promise.allSettled([
            refreshPendingChanges(),
            refreshGitStatus(),
          ]);
          if (activeFile === path || activeFile.startsWith(`${path}/`)) {
            onOpenFile("");
          }
        }
        showToast(
          `${isFolder ? "Pasta" : "Arquivo"} excluído com sucesso.`,
          "info",
        );
      } else {
        showToast(
          res.data?.error || "Erro ao excluir item do repositório.",
          "warning",
        );
      }
    } catch {
      showToast("Erro ao conectar com o servidor para excluir.", "warning");
    } finally {
      setIsDeletingItem(false);
    }
  }, [
    deleteItemTarget,
    activeRepo?.name,
    loadTree,
    refreshPendingChanges,
    refreshGitStatus,
    activeFile,
    onOpenFile,
    showToast,
  ]);

  // Duplicar Arquivo
  const handleDuplicateFile = useCallback(
    async (filePath: string, repoNameForNode?: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      const targetRepo = repoNameForNode || activeRepo?.name || "default";
      try {
        const res = await duplicateFile(filePath, targetRepo);
        if (res.success && res.newPath) {
          const fileName = res.newPath.split("/").pop() || res.newPath;
          showToast(`"${fileName}" duplicado com sucesso!`, "info");
        } else {
          showToast(res.error || "Falha ao duplicar arquivo.", "warning");
        }
      } catch (err: any) {
        console.error("[FileTree] Erro ao duplicar arquivo:", err);
        showToast(
          err.message || "Erro inesperado ao duplicar arquivo.",
          "warning",
        );
      }
    },
    [activeRepo?.name, duplicateFile, showToast],
  );

  // Clique no Arquivo
  const handleFileClick = useCallback(
    async (path: string, _name: string, repoForNode?: string) => {
      if (
        repoForNode &&
        activeRepo &&
        repoForNode.toLowerCase() !== activeRepo.name.toLowerCase()
      ) {
        const targetRepoObj = repos.find(
          (r) => r.name.toLowerCase() === repoForNode.toLowerCase(),
        );
        if (!targetRepoObj) {
          onOpenFile(path);
          return;
        }

        const targetOwner =
          targetRepoObj.owner ||
          (targetRepoObj.full_name ? targetRepoObj.full_name.split("/")[0] : "");
        const isOrg =
          targetOwner &&
          targetOwner !== "local" &&
          !targetRepoObj.is_local &&
          targetOwner.toLowerCase() !== (user?.login || "").toLowerCase();
        const targetUrl = isOrg
          ? `/org/${encodeURIComponent(targetOwner)}/repo/${encodeURIComponent(repoForNode)}/editor?file=${encodeURIComponent(path)}`
          : `/repo/${encodeURIComponent(repoForNode)}/editor?file=${encodeURIComponent(path)}`;
        navigate(targetUrl);
        await selectRepo(targetRepoObj, path);
      } else {
        onOpenFile(path);
      }
    },
    [activeRepo, repos, user?.login, navigate, selectRepo, onOpenFile],
  );

  // Focus inline rename input
  useEffect(() => {
    if (inlineRenaming && inlineRenameInputRef.current) {
      inlineRenameInputRef.current.focus();
      const name = inlineRenaming.originalName;
      const dotIndex = name.lastIndexOf(".");
      if (!inlineRenaming.isFolder && dotIndex > 0) {
        inlineRenameInputRef.current.setSelectionRange(0, dotIndex);
      } else {
        inlineRenameInputRef.current.select();
      }
    }
  }, [inlineRenaming]);

  // Indexed Maps para consultas O(1) de status e governança
  const gitStatusMap = useMemo(() => {
    const map = new Map<string, any>();
    if (gitStatus?.files && Array.isArray(gitStatus.files)) {
      for (let i = 0; i < gitStatus.files.length; i++) {
        const f = gitStatus.files[i];
        if (f?.path) {
          const clean = f.path.replace(/^\/+/, "");
          map.set(clean, f);
          map.set(`/${clean}`, f);
        }
      }
    }
    return map;
  }, [gitStatus]);

  const pendingChangesMap = useMemo(() => {
    const map = new Map<string, any>();
    if (pendingChanges && Array.isArray(pendingChanges)) {
      for (let i = 0; i < pendingChanges.length; i++) {
        const c = pendingChanges[i];
        if (c?.path) {
          const clean = c.path.replace(/^\/+/, "");
          map.set(clean, c);
          map.set(`/${clean}`, c);
        }
      }
    }
    return map;
  }, [pendingChanges]);

  const departmentsMap = useMemo(() => {
    const map = new Map<string, any>();
    if (departments && Array.isArray(departments)) {
      for (let i = 0; i < departments.length; i++) {
        const d = departments[i];
        if (d?.id) map.set(String(d.id).toLowerCase(), d);
        if (d?.folder) map.set(String(d.folder).toLowerCase(), d);
      }
    }
    return map;
  }, [departments]);

  const currentOrgLogin = useMemo(() => {
    if (org && org.trim()) return org.toLowerCase().trim();
    if (activeOrg?.login && activeOrg.login !== "local")
      return activeOrg.login.toLowerCase().trim();
    if (activeRepo && !activeRepo.is_local) {
      const owner = (
        activeRepo.owner ||
        (activeRepo.full_name ? activeRepo.full_name.split("/")[0] : "")
      )
        .toLowerCase()
        .trim();
      if (
        owner &&
        owner !== "local" &&
        owner !== (user?.login || "").toLowerCase()
      ) {
        return owner;
      }
    }
    return "";
  }, [org, activeOrg?.login, activeRepo, user?.login]);

  const orgRepos = useMemo(() => {
    if (!repos || repos.length === 0) {
      if (activeRepo) return [activeRepo];
      return [];
    }

    if (currentOrgLogin) {
      const isPersonalScope = Boolean(
        user?.login && currentOrgLogin === user.login.toLowerCase()
      );

      const filtered = repos.filter((r) => {
        const owner = (
          r.owner || (r.full_name ? r.full_name.split("/")[0] : "")
        )
          .toLowerCase()
          .trim();
        if (isPersonalScope) {
          return (
            owner === currentOrgLogin ||
            owner === "local" ||
            !owner ||
            r.is_local ||
            r.is_owner
          );
        }
        return owner === currentOrgLogin;
      });

      if (activeRepo) {
        const activeOwner = (
          activeRepo.owner ||
          (activeRepo.full_name ? activeRepo.full_name.split("/")[0] : "")
        )
          .toLowerCase()
          .trim();
        if (
          !filtered.some(
            (r) => r.name.toLowerCase() === activeRepo.name.toLowerCase(),
          )
        ) {
          if (
            activeOwner === currentOrgLogin ||
            !activeOwner ||
            activeOwner === "local" ||
            filtered.length === 0
          ) {
            filtered.push(activeRepo);
          }
        }
      }

      const orgList =
        filtered.length > 0 ? filtered : activeRepo ? [activeRepo] : [];
      return [...orgList].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          sensitivity: "base",
          numeric: true,
        }),
      );
    }

    const localOrPersonalRepos = repos.filter((r) => {
      const owner = (r.owner || (r.full_name ? r.full_name.split("/")[0] : ""))
        .toLowerCase()
        .trim();
      return (
        r.is_local ||
        owner === "local" ||
        owner === (user?.login || "").toLowerCase() ||
        !owner
      );
    });

    if (
      activeRepo &&
      !localOrPersonalRepos.some(
        (r) => r.name.toLowerCase() === activeRepo.name.toLowerCase(),
      )
    ) {
      localOrPersonalRepos.push(activeRepo);
    }

    const baseList =
      localOrPersonalRepos.length > 0
        ? localOrPersonalRepos
        : activeRepo
          ? [activeRepo]
          : repos;

    return [...baseList].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        sensitivity: "base",
        numeric: true,
      }),
    );
  }, [repos, activeRepo, currentOrgLogin, user?.login]);

  // Busca e filtragem recursiva de nós por repositório
  const getDisplayNodesForRepo = useCallback(
    (rName: string) => {
      const matchedKey = Object.keys(treesByRepo).find(
        (k) => k.toLowerCase() === rName.toLowerCase(),
      );
      const nodes =
        (matchedKey ? treesByRepo[matchedKey] : undefined) ||
        (rName.toLowerCase() === activeRepo?.name.toLowerCase() ? tree : []);
      if (!nodes || nodes.length === 0) return [];
      if (!searchTerm.trim()) return nodes;

      const q = searchTerm.trim().toLowerCase();
      const matchNode = (node: TreeNode): TreeNode | null => {
        const nameMatch = Boolean(
          (node.name && node.name.toLowerCase().includes(q)) ||
          (node.title && node.title.toLowerCase().includes(q)),
        );
        const isDir =
          node.type === "dir" ||
          node.type === "directory" ||
          (node as any).is_directory;

        if (!isDir) {
          return nameMatch ? node : null;
        }

        const filteredChildren = (node.children || [])
          .map(matchNode)
          .filter((c): c is TreeNode => c !== null);

        if (nameMatch || filteredChildren.length > 0) {
          return {
            ...node,
            children: filteredChildren,
          };
        }
        return null;
      };

      return nodes.map(matchNode).filter((n): n is TreeNode => n !== null);
    },
    [treesByRepo, tree, activeRepo, searchTerm],
  );

  const displayNodes = useMemo(() => {
    return getDisplayNodesForRepo(activeRepo?.name || repoName);
  }, [getDisplayNodesForRepo, activeRepo?.name, repoName]);

  // Restaura posição do scroll após montar nós
  useEffect(() => {
    if (!isTreeLoading && displayNodes.length > 0) {
      restoreScrollPosition();
    }
  }, [isTreeLoading, displayNodes.length, restoreScrollPosition]);

  const handleRefreshAll = useCallback(async () => {
    showToast("Atualizando arquivos...", "info");
    await Promise.all([
      refreshGitStatus(),
      refreshPendingChanges(),
      loadTree(activeRepo?.name),
    ]);
    const openRepos = orgRepos.filter(
      (r) =>
        !collapsedRepos[r.name] &&
        r.name.toLowerCase() !== activeRepo?.name.toLowerCase(),
    );
    if (openRepos.length > 0) {
      await Promise.allSettled(openRepos.map((r) => loadTree(r.name)));
    }
    showToast("Árvore de arquivos atualizada com sucesso.", "info");
  }, [
    showToast,
    refreshGitStatus,
    refreshPendingChanges,
    loadTree,
    activeRepo?.name,
    orgRepos,
    collapsedRepos,
  ]);

  if (isCollapsed) {
    return (
      <button
        id="btn-expand-tree-pane"
        className="btn-expand-sidebar"
        title="Expandir Árvore"
        onClick={onToggleCollapse}
      >
        <span>›</span>
      </button>
    );
  }

  // Props compartilhadas por todos os nós de arquivos e pastas
  const treeNodeProps = {
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
    onConfirmInlineRename: handleConfirmInlineRename,
    onCancelInlineRename: handleCancelInlineRename,
    inlineCreating,
    inlineValue,
    setInlineValue,
    selectedTemplate,
    setSelectedTemplate,
    templatePickerOpen,
    setTemplatePickerOpen,
    onConfirmInlineCreate: handleConfirmInlineCreate,
    onCancelInlineCreate: handleCancelInlineCreate,
    isSubmittingInlineRef,
    gitStatusMap,
    pendingChangesMap,
    departmentsMap,
    canAccessDoc,
    onToggleFolder: toggleFolder,
    onFileClick: handleFileClick,
    onStartInlineCreate: startInlineCreate,
    onStartInlineRename: startInlineRename,
    onPromptDeleteItem: promptDeleteItem,
    onDuplicateFile: handleDuplicateFile,
    onOpenInOS: handleOpenInOS,
    onOpenImport: (targetFolder: string, repoTarget?: string) => {
      setTargetUploadFolder(targetFolder);
      setTargetUploadRepo(repoTarget || activeRepo?.name || "");
      fileInputRef.current?.click();
    },
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragOverFolder: handleDragOverFolder,
    onDragLeaveFolder: handleDragLeaveFolder,
    onDropOnFolder: handleDropOnFolder,
    onDragOverFile: handleDragOverFile,
    onDragLeaveFile: handleDragLeaveFile,
    onDropOnFile: handleDropOnFile,
  };

  return (
    <>
      <aside
        className={`workbench-tree-pane ${isExternalDragActive ? "is-drag-active" : ""}`}
        id="workbench-tree-pane"
        style={{ width: width ? `${width}px` : undefined }}
        onClick={() => setSelectedFolder("")}
        onDragEnter={handlePaneDragEnter}
        onDragLeave={handlePaneDragLeave}
      >
        {/* Barra Superior: Busca + Toolbar */}
        <FileTreeToolbar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          selectedFolder={selectedFolder}
          activeRepo={activeRepo}
          isTreeLoading={isTreeLoading}
          onCreateRootRepo={() => {
            if (canCreateRootRepo) {
              setCreateRepoModalOpen(true);
            } else {
              showToast(
                "Apenas administradores ou proprietários da organização podem criar repositórios raiz.",
                "warning",
              );
            }
          }}
          onNewFile={() => startInlineCreate(selectedFolder, false)}
          onNewFolder={() => startInlineCreate(selectedFolder, true)}
          onImportFile={() => {
            setTargetUploadFolder(selectedFolder || "");
            setTargetUploadRepo(activeRepo?.name || "");
            fileInputRef.current?.click();
          }}
          onOpenInOS={(e) => handleOpenInOS(selectedFolder || "", e, activeRepo?.name)}
          onExpandAll={() => handleExpandAllFolders(tree, treesByRepo, setCollapsedRepos)}
          onCollapseAll={handleCollapseAllFolders}
          onRefreshAll={handleRefreshAll}
          onToggleCollapse={onToggleCollapse}
        />

        {/* Tree Hierarchy Scroll Container */}
        <div
          ref={treeScrollRef}
          className="tree-scroll-container"
          onScroll={handleTreeScroll}
          onDragOver={handleDragOverRoot}
          onDragLeave={handleDragLeaveRoot}
          onDrop={handleDropOnRoot}
        >
          <div
            id="tree-nodes-container"
            className={`agent-tree-root ${isDragOverRoot ? "drag-over-root" : ""}`}
          >
            {isTreeLoading &&
            displayNodes.length === 0 &&
            orgRepos.length === 0 ? (
              <div
                className="tree-skeleton-container"
                aria-label="Carregando estrutura de arquivos"
              >
                <div className="tree-loading-pill">
                  <span
                    className="material-symbols-outlined spinning"
                    style={{ fontSize: "14px" }}
                  >
                    progress_activity
                  </span>
                  <span>Carregando repositórios...</span>
                </div>
                <div className="tree-skeleton-list">
                  <div className="tree-skeleton-row indent-0">
                    <div className="skeleton-icon" />
                    <div className="skeleton-line" style={{ width: "65%" }} />
                  </div>
                  <div className="tree-skeleton-row indent-1">
                    <div className="skeleton-icon" />
                    <div className="skeleton-line" style={{ width: "45%" }} />
                  </div>
                  <div className="tree-skeleton-row indent-1">
                    <div className="skeleton-icon" />
                    <div className="skeleton-line" style={{ width: "70%" }} />
                  </div>
                  <div className="tree-skeleton-row indent-0">
                    <div className="skeleton-icon" />
                    <div className="skeleton-line" style={{ width: "55%" }} />
                  </div>
                </div>
              </div>
            ) : orgRepos.length === 0 && !inlineCreating ? (
              <div
                className="tree-empty-state"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  padding: "28px 14px",
                  gap: "8px",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              >
                <div style={{ marginBottom: "4px" }}>
                  <Building2 size={24} color="#94a3b8" />
                </div>
                <strong
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--text-normal)",
                    margin: 0,
                  }}
                >
                  Nenhum repositório na organização
                </strong>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    margin: 0,
                    lineHeight: 1.4,
                  }}
                >
                  {canCreateRootRepo
                    ? "Crie o primeiro repositório da organização para começar a documentar."
                    : "Você não possui repositórios visíveis nesta organização."}
                </p>
                {canCreateRootRepo && (
                  <button
                    className="btn btn-primary btn-sm"
                    style={{
                      marginTop: "6px",
                      fontSize: "11px",
                      padding: "6px 12px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    onClick={() => setCreateRepoModalOpen(true)}
                  >
                    <FolderPlus size={13} />
                    <span>Novo Repositório</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="tree-repos-container">
                {orgRepos.map((r) => {
                  const isActive =
                    r.name.toLowerCase() === activeRepo?.name.toLowerCase();
                  const isRepoCollapsed = collapsedRepos[r.name] ?? !isActive;
                  const repoDisplayNodes = !isRepoCollapsed
                    ? getDisplayNodesForRepo(r.name)
                    : [];
                  const isRepoLoading = Boolean(
                    loadingRepos[r.name] ||
                    (isActive &&
                      isTreeLoading &&
                      repoDisplayNodes.length === 0),
                  );
                  const canAdminRepo = Boolean(
                    r.permissions?.admin || r.is_owner || canCreateRootRepo,
                  );

                  return (
                    <RepoTreeItem
                      key={`org-repo-node-${r.name}`}
                      repo={r}
                      isActive={isActive}
                      isCollapsed={isRepoCollapsed}
                      repoDisplayNodes={repoDisplayNodes}
                      isRepoLoading={isRepoLoading}
                      canAdminRepo={canAdminRepo}
                      dragOverTarget={dragOverTarget}
                      repoProgress={repoProgress}
                      loadingRepos={loadingRepos}
                      onSelectRepo={handleSelectRepo}
                      onToggleCollapse={toggleRepoCollapse}
                      onOpenGovernance={(repo) => setGovernanceRepoTarget(repo)}
                      onSyncRepo={handleSyncRepo}
                      onOpenInOS={handleOpenInOS}
                      onOpenImport={(targetFolder, repoTarget) => {
                        setTargetUploadFolder(targetFolder);
                        setTargetUploadRepo(repoTarget || "");
                        fileInputRef.current?.click();
                      }}
                      onStartInlineCreate={startInlineCreate}
                      onDeleteRepoPrompt={(repo) => setDeleteRepoTarget(repo)}
                      onCloneRepo={handleCloneRepo}
                      onOpenLockedRepo={(repo) => setLockedRepoTarget(repo)}
                      onDragOverRepo={handleDragOverRepo}
                      onDragLeaveRepo={handleDragLeaveRepo}
                      onDropOnRepo={handleDropOnRepo}
                      scrollContainerRef={treeScrollRef}
                      treeNodeProps={treeNodeProps}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Drag Overlay Feedback */}
          {isExternalDragActive && (
            <div
              className="tree-drag-overlay"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="tree-drag-overlay-card">
                <div className="tree-drag-overlay-icon">
                  <Upload size={12} color="#60a5fa" />
                </div>
                <div className="tree-drag-overlay-text">
                  <span>Soltar em:</span>
                  <code>
                    {dragOverTarget
                      ? `/${dragOverTarget}`
                      : selectedFolder
                        ? `/${selectedFolder}`
                        : "raiz"}
                  </code>
                </div>
              </div>
            </div>
          )}

          {/* Import Progress Loading Overlay */}
          {isImporting && (
            <div className="tree-import-loading-overlay">
              <div className="tree-import-loading-card">
                <span
                  className="material-symbols-outlined spinning"
                  style={{ fontSize: "18px", color: "#2563eb" }}
                >
                  progress_activity
                </span>
                <span className="tree-import-loading-msg">
                  {importProgressMessage || "Importando arquivos..."}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Inputs Ocultos de Importação */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={async (e) => {
            if (e.target.files && e.target.files.length > 0) {
              const scanned = filesToScannedList(e.target.files);
              await handleImportFiles(
                scanned,
                targetUploadFolder,
                targetUploadRepo,
              );
              e.target.value = "";
            }
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-ignore
          webkitdirectory=""
          directory=""
          multiple
          style={{ display: "none" }}
          onChange={async (e) => {
            if (e.target.files && e.target.files.length > 0) {
              const scanned = filesToScannedList(e.target.files);
              await handleImportFiles(
                scanned,
                targetUploadFolder,
                targetUploadRepo,
              );
              e.target.value = "";
            }
          }}
        />

        {/* Toast Notifications */}
        {toast && (
          <div className="tree-toast-container">
            <div className={`tree-toast ${toast.type}`}>
              {toast.type === "warning" && (
                <AlertCircle
                  size={14}
                  color="#fbbf24"
                  style={{ flexShrink: 0 }}
                />
              )}
              <span>{toast.message}</span>
            </div>
          </div>
        )}
      </aside>

      {/* Modais Centralizados */}
      <FileTreeModals
        lockedRepoTarget={lockedRepoTarget}
        onCloseLockedRepo={() => setLockedRepoTarget(null)}
        activeOrg={activeOrg}
        createRepoModalOpen={createRepoModalOpen}
        onCloseCreateRepo={() => setCreateRepoModalOpen(false)}
        onRepoCreated={async (newRepo) => {
          await loadRepos();
          navigate(`/repo/${encodeURIComponent(newRepo.name)}/editor`);
          await selectRepo(newRepo);
          setCreateRepoModalOpen(false);
          showToast(`Repositório ${newRepo.name} criado com sucesso!`, "info");
        }}
        deleteRepoTarget={deleteRepoTarget}
        onCloseDeleteRepo={() => setDeleteRepoTarget(null)}
        onRepoDeleted={async () => {
          const target = deleteRepoTarget;
          setDeleteRepoTarget(null);
          const wasActive = Boolean(
            target &&
            activeRepo &&
            target.name.toLowerCase() === activeRepo.name.toLowerCase()
          );

          if (wasActive) {
            resetActiveRepo();
            navigate("/", { replace: true });
          }

          await loadRepos();
          showToast(
            wasActive
              ? "Repositório desvinculado e removido da máquina."
              : "Repositório removido da máquina.",
            "info"
          );
        }}
        deleteItemTarget={deleteItemTarget}
        isDeletingItem={isDeletingItem}
        onCloseDeleteItem={() => setDeleteItemTarget(null)}
        onConfirmDeleteItem={handleConfirmDeleteItem}
        governanceRepoTarget={governanceRepoTarget}
        onCloseGovernance={() => setGovernanceRepoTarget(null)}
      />
    </>
  );
};

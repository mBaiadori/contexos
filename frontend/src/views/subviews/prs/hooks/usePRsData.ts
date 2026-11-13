import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { useWorkspace } from "../../../../context/WorkspaceContext";
import { API } from "../../../../services/api";
import type { PR, Repo } from "../../../../types";
import { isPathHidden, isSystemPath } from "../../../../utils/hidden-files";
import type {
  PRStatusFilter,
  MergeabilityInfo,
  PRFileDiffData,
  ActionLoadingState,
  ActionFeedbackState,
  ActiveConflictPR,
} from "../types";

export function usePRsData() {
  const { user, provider } = useAuth();
  const providerLabel = provider === "github" ? "GitHub" : "Modo Local";
  const navigate = useNavigate();
  const {
    activeRepo,
    repos,
    refreshGitStatus,
    refreshPendingChanges,
    projectConfig,
    getRepoOwnerOrOrg,
  } = useWorkspace();
  const repoName = activeRepo?.name || "local";

  const [selectedRepoFilter, setSelectedRepoFilter] = useState<string>(
    () => activeRepo?.name || "all",
  );
  const [prs, setPrs] = useState<PR[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [repoOpenCounts, setRepoOpenCounts] = useState<Record<string, number>>(
    {},
  );

  // Pagination & Server-side Filtering State
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [counts, setCounts] = useState<{ all: number; open: number; merged: number; closed: number }>({
    all: 0,
    open: 0,
    merged: 0,
    closed: 0,
  });

  const [searchParams] = useSearchParams();
  const prParam = searchParams.get("pr");

  const [activeStatus, setActiveStatus] = useState<PRStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState(() => prParam || "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => prParam || "");

  const [expandedPRs, setExpandedPRs] = useState<Record<number | string, boolean>>(
    () => (prParam ? { [prParam]: true } : {}),
  );
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});
  const [fileDiffsCache, setFileDiffsCache] = useState<Record<string, string>>({});
  const [fileDiffsData, setFileDiffsData] = useState<Record<string, PRFileDiffData>>({});
  const [loadingDiffs, setLoadingDiffs] = useState<Record<string, boolean>>({});
  const [mergeabilityMap, setMergeabilityMap] = useState<Record<string | number, MergeabilityInfo>>({});
  const [activeConflictPR, setActiveConflictPR] = useState<ActiveConflictPR | null>(null);
  const [syncingFromBase, setSyncingFromBase] = useState<Record<string | number, boolean>>({});
  const [actionFeedback, setActionFeedback] = useState<ActionFeedbackState | null>(null);
  const [actionLoading, setActionLoading] = useState<ActionLoadingState | null>(null);

  // Approval modal state
  const [approvalModalPR, setApprovalModalPR] = useState<PR | null>(null);
  const [approvalRole, setApprovalRole] = useState("Tech Lead");
  const [approvalComment, setApprovalComment] = useState("");

  // Rollback modal state
  const [rollbackTarget, setRollbackTarget] = useState<PR | null>(null);

  const executionIdRef = useRef<number>(0);
  const userHasManuallySelectedFilter = useRef<boolean>(false);
  const reposRef = useRef<Repo[]>(repos || []);
  const activeRepoRef = useRef<Repo | null>(activeRepo);
  const isInitialLoadRef = useRef<boolean>(true);

  useEffect(() => {
    reposRef.current = repos || [];
  }, [repos]);

  useEffect(() => {
    activeRepoRef.current = activeRepo;
  }, [activeRepo]);

  // Debounce da busca
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Sincroniza com activeRepo se o usuário não alterou manualmente para outro
  useEffect(() => {
    if (activeRepo?.name && !userHasManuallySelectedFilter.current) {
      if (selectedRepoFilter !== activeRepo.name) {
        setSelectedRepoFilter(activeRepo.name);
        setPage(1);
      }
    }
  }, [activeRepo?.name, selectedRepoFilter]);

  const handleStatusChange = useCallback((status: PRStatusFilter) => {
    setActiveStatus(status);
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  }, []);

  /**
   * Pipeline de Carregamento de Revisões com Dupla Prioridade e Paginação
   */
  const loadPRs = useCallback(
    async (
      targetFilter?: string,
      skipContextPull = false,
      targetPage?: number,
      targetPageSize?: number,
      targetStatus?: PRStatusFilter,
      targetSearch?: string,
    ) => {
      const currentExecId = ++executionIdRef.current;
      const filter =
        targetFilter !== undefined ? targetFilter : selectedRepoFilter;
      const curPage = targetPage !== undefined ? targetPage : page;
      const curLimit = targetPageSize !== undefined ? targetPageSize : pageSize;
      const curStatus = targetStatus !== undefined ? targetStatus : activeStatus;
      const curSearch = targetSearch !== undefined ? targetSearch : debouncedSearch;

      setIsLoading(true);

      const currentRepoList: Repo[] = reposRef.current || [];
      const currentActive = activeRepoRef.current;
      const isAll = filter === "all";

      // 1. Identifica o repositório em contexto
      const contextRepo =
        !isAll
          ? currentRepoList.find(
              (r: Repo) => r.name.toLowerCase() === filter.toLowerCase(),
            ) ||
            (currentActive?.name.toLowerCase() === filter.toLowerCase()
              ? currentActive
              : { name: filter })
          : null;

      const contextRepoName = isAll ? "all" : (contextRepo?.name || "local");
      const isContextCloned = Boolean(
        contextRepo?.is_cloned_locally ||
        currentRepoList.find(
          (r: Repo) => r.name.toLowerCase() === contextRepoName.toLowerCase(),
        )?.is_cloned_locally,
      );

      // PRIORIDADE 1: Pull sempre para o repositório em contexto (se clonado e específico)
      if (!isAll && !skipContextPull && isContextCloned && contextRepoName !== "local") {
        try {
          const owner = getRepoOwnerOrOrg
            ? getRepoOwnerOrOrg(contextRepo)
            : contextRepo?.owner || undefined;
          await API.pullLocalRepo({ repo: contextRepoName, owner });
        } catch (pullErr) {
          console.warn(
            `[PRsSubView] Aviso ao realizar pull no contexto (${contextRepoName}):`,
            pullErr,
          );
        }
      }

      // CARREGAMENTO DAS REVISÕES PAGINADAS DO CONTEXTO (ou de Todos os Repositórios)
      let receivedRepoOpenCounts = false;
      try {
        const res = await API.getPRs(contextRepoName, {
          page: curPage,
          limit: curLimit,
          status: curStatus,
          search: curSearch,
        });
        if (executionIdRef.current !== currentExecId) return;

        const contextPrs: PR[] =
          res && Array.isArray(res.prs)
            ? res.prs.map((p: PR) => ({
                ...p,
                repo_name: p.repo_name || (contextRepoName !== "all" ? contextRepoName : "local"),
              }))
            : [];

        // Atualiza itens da página atual
        setPrs(contextPrs);
        const totalFound = res?.total ?? contextPrs.length;
        setTotalItems(totalFound);
        setTotalPages(
          res?.total_pages ??
            Math.max(1, Math.ceil(totalFound / curLimit)),
        );
        if (res?.counts) {
          setCounts(res.counts);
        }

        if (res?.repoOpenCounts) {
          receivedRepoOpenCounts = true;
          setRepoOpenCounts((prev) => ({
            ...prev,
            ...res.repoOpenCounts,
          }));
        } else if (contextRepoName !== "all") {
          const openCount =
            res.counts?.open ??
            contextPrs.filter((p) => {
              const s = (p.status || "").toLowerCase();
              return s === "open" || s === "in_review";
            }).length;

          setRepoOpenCounts((prev) => ({
            ...prev,
            [contextRepoName]: openCount,
          }));
        }
      } catch (err) {
        console.error(
          `[PRsSubView] Erro ao carregar revisões (${contextRepoName}):`,
          err,
        );
      } finally {
        if (executionIdRef.current === currentExecId) {
          setIsLoading(false);
        }
      }

      // PRIORIDADE 2: Em segundo plano APENAS se o backend não retornou repoOpenCounts
      if (!receivedRepoOpenCounts && !isAll) {
        const backgroundClonedRepos = currentRepoList.filter(
          (r: Repo) =>
            r.is_cloned_locally &&
            r.name.toLowerCase() !== contextRepoName.toLowerCase(),
        );

        if (backgroundClonedRepos.length > 0) {
          (async () => {
            for (const bgRepo of backgroundClonedRepos) {
              if (executionIdRef.current !== currentExecId) break;

              try {
                const bgRes = await API.getPRs(bgRepo.name, { page: 1, limit: 1 });
                if (executionIdRef.current !== currentExecId) break;

                const openCount = bgRes?.counts?.open ?? 0;
                setRepoOpenCounts((prev) => ({
                  ...prev,
                  [bgRepo.name]: openCount,
                }));
              } catch (e) {
                console.warn(
                  `[PRsSubView] Erro ao obter contagens em background de ${bgRepo.name}:`,
                  e,
                );
              }
            }
          })();
        }
      }
    },
    [
      selectedRepoFilter,
      page,
      pageSize,
      activeStatus,
      debouncedSearch,
      getRepoOwnerOrOrg,
    ],
  );

  useEffect(() => {
    const isFirst = isInitialLoadRef.current;
    isInitialLoadRef.current = false;
    loadPRs(undefined, !isFirst);
  }, [loadPRs]);

  const fetchDiffForFile = useCallback(
    async (pr: PR, filePath: string) => {
      const prRepo = pr.repo_name || repoName;
      const fileKey = `${pr.id}-${filePath}`;
      if (fileDiffsData[fileKey] || loadingDiffs[fileKey]) return;
      setLoadingDiffs((prev) => ({ ...prev, [fileKey]: true }));
      try {
        const diffRes = await API.getPRFileDiff({
          path: filePath,
          pr_id: pr.id,
          commit: pr.commit_hash || pr.head_sha,
          repo: prRepo,
        });
        if (diffRes.ok && diffRes.data) {
          setFileDiffsData((prev) => ({
            ...prev,
            [fileKey]: diffRes.data,
          }));
          if (diffRes.data.diff) {
            setFileDiffsCache((prev) => ({
              ...prev,
              [fileKey]: diffRes.data.diff,
            }));
          }
        }
      } catch (e) {
        console.warn(`[PRsSubView] Erro ao obter diff de ${filePath}:`, e);
      } finally {
        setLoadingDiffs((prev) => ({ ...prev, [fileKey]: false }));
      }
    },
    [fileDiffsData, loadingDiffs, repoName],
  );

  const fetchMergeability = useCallback(
    async (pr: PR) => {
      const prRepo = pr.repo_name || repoName;
      try {
        const res = await API.getPRMergeability({ pr_id: pr.id, repo: prRepo });
        if (res.ok && res.data) {
          setMergeabilityMap((prev) => ({ ...prev, [pr.id]: res.data }));
        }
      } catch (e) {
        console.warn(
          `[PRsSubView] Erro ao verificar mergeabilidade do PR #${pr.id}:`,
          e,
        );
      }
    },
    [repoName],
  );

  const handleUpdateFromBase = async (pr: PR) => {
    const prRepo = pr.repo_name || repoName;
    setSyncingFromBase((prev) => ({ ...prev, [pr.id]: true }));
    setActionFeedback(null);
    try {
      const res = await API.updatePRFromBase({ pr_id: pr.id, repo: prRepo });
      if (res.ok) {
        setActionFeedback({
          id: pr.id,
          message:
            res.data?.message ||
            "Proposta sincronizada com a versão oficial com sucesso!",
          type: "success",
        });
        await loadPRs();
        fetchMergeability(pr);
      } else {
        setActionFeedback({
          id: pr.id,
          message: res.data?.error || "Erro ao atualizar da versão oficial.",
          type: "error",
        });
      }
    } catch (err: any) {
      setActionFeedback({
        id: pr.id,
        message: err.message || "Erro ao atualizar da versão oficial.",
        type: "error",
      });
    } finally {
      setSyncingFromBase((prev) => ({ ...prev, [pr.id]: false }));
    }
  };

  const handleOpenConflictResolution = async (pr: PR, filePath: string) => {
    const prRepo = pr.repo_name || repoName;
    try {
      const res = await API.getPRConflict({
        pr_id: pr.id,
        path: filePath,
        repo: prRepo,
      });
      if (res.ok && res.data) {
        setActiveConflictPR({ pr, filePath, bundle: res.data });
      } else {
        alert(
          (res.data as any)?.error || "Erro ao carregar dados do conflito.",
        );
      }
    } catch (e: any) {
      alert(e.message || "Erro ao carregar dados do conflito.");
    }
  };

  const handleSaveConflictResolution = async (resolvedContent: string) => {
    if (!activeConflictPR) return;
    const { pr, filePath } = activeConflictPR;
    const prRepo = pr.repo_name || repoName;
    try {
      const res = await API.resolvePRConflict({
        pr_id: pr.id,
        filePath,
        resolvedContent,
        repo: prRepo,
      });
      if (res.ok) {
        setActiveConflictPR(null);
        setActionFeedback({
          id: pr.id,
          message: `Conflito em "${filePath}" resolvido com sucesso!`,
          type: "success",
        });
        await loadPRs();
        fetchMergeability(pr);
      } else {
        alert(res.data?.error || "Erro ao salvar resolução de conflito.");
      }
    } catch (e: any) {
      alert(e.message || "Erro ao salvar resolução de conflito.");
    }
  };

  const toggleExpand = async (id: number | string, pr: PR) => {
    const nextState = !expandedPRs[id];
    setExpandedPRs((prev) => ({ ...prev, [id]: nextState }));

    if (nextState && Array.isArray(pr.files)) {
      const isStatusOpen =
        (pr.status || "").toLowerCase() === "open" ||
        (pr.status || "").toLowerCase() === "in_review";
      if (isStatusOpen) {
        fetchMergeability(pr);
      }
      const visibleFiles = pr.files.filter(
        (file) =>
          file?.path && !isSystemPath(file.path) && !isPathHidden(file.path),
      );
      for (const file of visibleFiles) {
        if (!file.restricted) {
          fetchDiffForFile(pr, file.path);
        }
      }
    }
  };

  const toggleFileCollapse = (fileKey: string) => {
    setCollapsedFiles((prev) => {
      const isCurrentlyCollapsed = prev[fileKey] !== undefined ? prev[fileKey] : true;
      return {
        ...prev,
        [fileKey]: !isCurrentlyCollapsed,
      };
    });
  };

  const handleExpandAllFiles = (prId: number | string, files: any[]) => {
    setCollapsedFiles((prev) => {
      const next = { ...prev };
      files.forEach((f, idx) => {
        const key = `${prId}-${f.path || idx}`;
        next[key] = false;
      });
      return next;
    });
  };

  const handleCollapseAllFiles = (prId: number | string, files: any[]) => {
    setCollapsedFiles((prev) => {
      const next = { ...prev };
      files.forEach((f, idx) => {
        const key = `${prId}-${f.path || idx}`;
        next[key] = true;
      });
      return next;
    });
  };

  const handleOpenApproveModal = (pr: PR) => {
    setApprovalModalPR(pr);
    setApprovalComment("");
    setApprovalRole("Tech Lead");
  };

  const handleApproveSubmit = async () => {
    if (!approvalModalPR) return;
    const id = approvalModalPR.id;
    const prRepo = approvalModalPR.repo_name || repoName;
    setActionLoading({ id, action: "approve" });
    setActionFeedback(null);
    try {
      const res = await API.approvePR(id, {
        approver: user?.login ? `@${user.login}` : undefined,
        role: approvalRole,
        comment: approvalComment,
        repo: prRepo,
      });
      if (res.ok) {
        setActionFeedback({
          id,
          message: res.data?.message || "Aprovação registrada com sucesso!",
          type: "success",
        });
        setApprovalModalPR(null);
        setApprovalComment("");
        await loadPRs();
        refreshGitStatus?.();
        refreshPendingChanges?.();
      } else {
        setActionFeedback({
          id,
          message: res.data?.error || "Erro ao aprovar proposta.",
          type: "error",
        });
      }
    } catch (err: any) {
      setActionFeedback({
        id,
        message: err.message || "Erro ao aprovar proposta.",
        type: "error",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditDocumentInPR = (pr: PR, filePath: string) => {
    const prRepo = pr.repo_name || repoName;
    navigate(
      `/repo/${encodeURIComponent(prRepo)}/editor?file=${encodeURIComponent(filePath)}&pr=${encodeURIComponent(String(pr.id))}&base=${encodeURIComponent(pr.head_sha || "")}`,
    );
  };

  const handleMerge = async (id: number | string, customRepo?: string) => {
    const prRepo = customRepo || repoName;
    setActionLoading({ id, action: "merge" });
    setActionFeedback(null);
    try {
      const res = await API.mergePR(id, prRepo);
      if (res.ok) {
        setActionFeedback({
          id,
          message:
            res.data?.message || "Versão publicada e integrada com sucesso!",
          type: "success",
        });
        await loadPRs();
        refreshGitStatus?.();
        refreshPendingChanges?.();
      } else {
        setActionFeedback({
          id,
          message: res.data?.error || "Erro ao publicar versão.",
          type: "error",
        });
      }
    } catch (err: any) {
      setActionFeedback({
        id,
        message: err.message || "Erro ao publicar versão.",
        type: "error",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: number | string, customRepo?: string) => {
    const prRepo = customRepo || repoName;
    const reason = window.prompt("Informe o motivo da rejeição (opcional):");
    if (reason === null) return;

    setActionLoading({ id, action: "reject" });
    setActionFeedback(null);
    try {
      const res = await API.rejectPR(
        id,
        reason || "Rejeitado pelo revisor",
        prRepo,
      );
      if (res.ok) {
        setActionFeedback({
          id,
          message: "Proposta arquivada e rejeitada.",
          type: "success",
        });
        await loadPRs();
        refreshGitStatus?.();
        refreshPendingChanges?.();
      } else {
        setActionFeedback({
          id,
          message: res.data?.error || "Erro ao rejeitar proposta.",
          type: "error",
        });
      }
    } catch (err: any) {
      setActionFeedback({
        id,
        message: err.message || "Erro ao rejeitar proposta.",
        type: "error",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRollback = async () => {
    if (!rollbackTarget) return;
    const target = rollbackTarget;
    const prRepo = target.repo_name || repoName;
    setActionLoading({ id: target.id, action: "rollback" });
    setActionFeedback(null);

    try {
      const res = await API.rollbackVersion({
        id: target.id,
        commit_hash: target.commit_hash,
        repo: prRepo,
      });

      if (res.ok) {
        setActionFeedback({
          id: target.id,
          message:
            res.data?.message ||
            `Versão #${target.short_id || target.id} restaurada como a versão atual!`,
          type: "success",
        });
        setRollbackTarget(null);
        await loadPRs();
        refreshGitStatus?.();
        refreshPendingChanges?.();
      } else {
        setActionFeedback({
          id: target.id,
          message: res.data?.error || "Erro ao restaurar versão.",
          type: "error",
        });
      }
    } catch (err: any) {
      setActionFeedback({
        id: target.id,
        message: err.message || "Erro ao restaurar versão.",
        type: "error",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const countAll = counts?.all ?? 0;
  const countOpen = counts?.open ?? 0;
  const countMerged = counts?.merged ?? 0;
  const countClosed = counts?.closed ?? 0;

  // Como o backend já realiza a paginação e filtragem server-side,
  // prs representa diretamente a fatia da página atual
  const filteredPRs = prs;

  return {
    user,
    providerLabel,
    repos,
    activeRepo,
    selectedRepoFilter,
    setSelectedRepoFilter: (val: string) => {
      userHasManuallySelectedFilter.current = true;
      setSelectedRepoFilter(val);
      setPage(1);
    },
    repoOpenCounts,
    isLoading,
    loadPRs,
    // Paginação
    page,
    pageSize,
    totalPages,
    totalItems,
    handlePageChange,
    handlePageSizeChange,
    // Filtros
    activeStatus,
    setActiveStatus: handleStatusChange,
    searchQuery,
    setSearchQuery: handleSearchChange,
    handleStatusChange,
    handleSearchChange,
    filteredPRs,
    countAll,
    countOpen,
    countMerged,
    countClosed,
    expandedPRs,
    toggleExpand,
    collapsedFiles,
    toggleFileCollapse,
    handleExpandAllFiles,
    handleCollapseAllFiles,
    fileDiffsCache,
    fileDiffsData,
    loadingDiffs,
    mergeabilityMap,
    syncingFromBase,
    handleUpdateFromBase,
    activeConflictPR,
    setActiveConflictPR,
    handleOpenConflictResolution,
    handleSaveConflictResolution,
    actionFeedback,
    setActionFeedback,
    actionLoading,
    handleOpenApproveModal,
    handleMerge,
    handleReject,
    rollbackTarget,
    setRollbackTarget,
    handleRollback,
    handleEditDocumentInPR,
    // Approval modal
    approvalModalPR,
    setApprovalModalPR,
    approvalRole,
    setApprovalRole,
    approvalComment,
    setApprovalComment,
    handleApproveSubmit,
    projectConfig,
  };
}

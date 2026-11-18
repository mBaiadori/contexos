import { useState, useEffect, useCallback, useMemo } from "react";
import { useWorkspace } from "../../../../context/WorkspaceContext";
import { useAuth } from "../../../../context/AuthContext";
import { API } from "../../../../services/api";
import type { DraftItem } from "../types";

export function useVersionsData(onOpenFile?: (path: string) => void) {
  const { provider } = useAuth();
  const providerLabel = provider === "github" ? "GitHub" : "Modo Local";
  const {
    activeRepo,
    repos,
    gitStatus,
    pendingChanges = [],
    refreshGitStatus,
    refreshPendingChanges,
    syncGit,
    discardChanges,
    loadFile,
  } = useWorkspace();

  // Repository selection state
  const [selectedRepoFilter, setSelectedRepoFilter] = useState<string>(
    activeRepo?.name || "all"
  );
  const [repoEditsCounts, setRepoEditsCounts] = useState<Record<string, number>>({});
  const [allReposDrafts, setAllReposDrafts] = useState<DraftItem[]>([]);
  const [isLoadingChanges, setIsLoadingChanges] = useState(false);

  useEffect(() => {
    if (activeRepo?.name && selectedRepoFilter === "all") {
      setSelectedRepoFilter(activeRepo.name);
    }
  }, [activeRepo?.name]);

  // Proposal modal state
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
  const [modalTargetRepo, setModalTargetRepo] = useState<string>(
    activeRepo?.name || (repos && repos[0]?.name) || "local"
  );

  const [prTitle, setPrTitle] = useState("");
  const [prDescription, setPrDescription] = useState("");
  const [isCreatingPR, setIsCreatingPR] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [createdPRUrl, setCreatedPRUrl] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // File diff state
  const [expandedDraftFiles, setExpandedDraftFiles] = useState<Record<string, boolean>>({});
  const [draftDiffs, setDraftDiffs] = useState<Record<string, string>>({});
  const [loadingDraftDiffs, setLoadingDraftDiffs] = useState<Record<string, boolean>>({});

  // Load changes for all repos or active repos
  const loadAllEdits = useCallback(async (targetRepo?: string) => {
    const filter = targetRepo !== undefined ? targetRepo : selectedRepoFilter;
    setIsLoadingChanges(true);

    try {
      const clonedRepos = repos.filter((r) => r.is_cloned_locally);
      const targetRepoList = filter !== "all"
        ? (repos.find((r) => r.name.toLowerCase() === filter.toLowerCase())
            ? [repos.find((r) => r.name.toLowerCase() === filter.toLowerCase())!]
            : [{ name: filter }])
        : (clonedRepos.length > 0 ? clonedRepos : (activeRepo ? [activeRepo] : [{ name: "local" }]));

      const counts: Record<string, number> = {};
      const drafts: DraftItem[] = [];

      await Promise.all(
        targetRepoList.map(async (r) => {
          try {
            const data = await API.getWorkspaceChanges(r.name);
            const rChanges = (data?.changes || []).filter(
              (c: any) => c?.path && c.path !== ".docs.metadata.json",
            );
            counts[r.name] = rChanges.length;

            if (filter === "all" || filter.toLowerCase() === r.name.toLowerCase()) {
              for (const c of rChanges) {
                drafts.push({
                  path: c.path.replace(/^\/+/, ""),
                  repoName: r.name,
                  status: c.type === "ADDED" ? "??" : c.type === "DELETED" ? "D" : "M",
                  type: c.type || "MODIFIED",
                  additions: c.additions,
                  deletions: c.deletions,
                  diff_text: c.diff_text || c.diff,
                  old_content: c.old_content || "",
                  new_content: c.new_content || "",
                });
              }
            }
          } catch (err) {
            console.warn(`[VersionsSubView] Erro ao carregar edições de ${r.name}:`, err);
          }
        })
      );

      setRepoEditsCounts((prev) => ({ ...prev, ...counts }));
      setAllReposDrafts(drafts);
    } catch (err) {
      console.error("[VersionsSubView] Erro ao carregar alterações de trabalho:", err);
    } finally {
      setIsLoadingChanges(false);
    }
  }, [selectedRepoFilter, repos, activeRepo]);

  useEffect(() => {
    loadAllEdits();
  }, [loadAllEdits, gitStatus, pendingChanges]);

  // Reset local state when active repo changes
  useEffect(() => {
    setExpandedDraftFiles({});
    setDraftDiffs({});
    setPrTitle("");
    setPrDescription("");
    setCreatedPRUrl(null);
    setFeedback(null);
  }, [activeRepo?.name, selectedRepoFilter]);

  const allDraftFiles = allReposDrafts;
  const changedFiles = allDraftFiles;
  const isClean = allDraftFiles.length === 0;

  useEffect(() => {
    if (refreshGitStatus) refreshGitStatus();
    if (refreshPendingChanges) refreshPendingChanges();
  }, [refreshGitStatus, refreshPendingChanges]);

  const fetchDraftDiff = useCallback(
    async (filePath: string, targetRepo?: string) => {
      const key = `${targetRepo || "local"}:${filePath}`;
      if (!filePath || draftDiffs[key]) return;
      setLoadingDraftDiffs((prev) => ({ ...prev, [key]: true }));
      try {
        const res = await API.getGitDiff(filePath, targetRepo);
        if (res?.ok && res?.data?.diff) {
          setDraftDiffs((prev) => ({ ...prev, [key]: res.data.diff }));
        }
      } catch (err) {
        console.error(
          `[VersionsSubView] Erro ao buscar diff de rascunho de ${filePath}:`,
          err,
        );
      } finally {
        setLoadingDraftDiffs((prev) => ({ ...prev, [key]: false }));
      }
    },
    [draftDiffs],
  );

  const toggleDraftFile = (filePath: string, repoName?: string) => {
    const key = `${repoName || "local"}:${filePath}`;
    const isNowExpanded = !expandedDraftFiles[key];
    setExpandedDraftFiles((prev) => ({ ...prev, [key]: isNowExpanded }));
    if (isNowExpanded) {
      fetchDraftDiff(filePath, repoName);
    }
  };

  const toggleAllDraftFiles = () => {
    const areAllExpanded =
      allDraftFiles.length > 0 &&
      allDraftFiles.every((f) => !!expandedDraftFiles[`${f.repoName}:${f.path}`]);
    const nextState = !areAllExpanded;
    const nextMap: Record<string, boolean> = {};
    allDraftFiles.forEach((f) => {
      const key = `${f.repoName}:${f.path}`;
      nextMap[key] = nextState;
      if (nextState) fetchDraftDiff(f.path, f.repoName);
    });
    setExpandedDraftFiles(nextMap);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setFeedback(null);
    try {
      if (syncGit) {
        await syncGit();
        if (refreshGitStatus) await refreshGitStatus();
        if (refreshPendingChanges) await refreshPendingChanges();
        await loadAllEdits();
        setFeedback({
          type: "success",
          message: "Sincronização com o repositório concluída com sucesso.",
        });
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Erro durante a sincronização com o repositório.",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateProposal = async (targetRepoName?: string) => {
    const targetRepo = targetRepoName || (selectedRepoFilter !== "all" ? selectedRepoFilter : activeRepo?.name || "local");
    const repoEdits = allDraftFiles.filter((f) => f.repoName === targetRepo);

    if (repoEdits.length === 0) {
      setFeedback({
        type: "error",
        message: `Nenhuma alteração pendente detectada no repositório "${targetRepo}". Modifique arquivos no editor e salve (Ctrl+S) antes de propor uma versão.`,
      });
      return;
    }
    if (!prTitle.trim()) {
      setFeedback({
        type: "error",
        message: "Por favor, informe o título da proposta ou clique em 'Gerar Resumo Automático'.",
      });
      return;
    }

    setIsCreatingPR(true);
    setFeedback(null);
    try {
      const res = await API.createUnifiedPR({
        title: prTitle.trim(),
        description: prDescription.trim(),
        repo: targetRepo,
      });

      if (res.ok && res.data) {
        setCreatedPRUrl(res.data.html_url || res.data.url || "#");
        setFeedback({
          type: "success",
          message: res.data.message || "Proposta de versão enviada com sucesso!",
        });
        setPrTitle("");
        setPrDescription("");
        setIsProposalModalOpen(false);
        if (refreshGitStatus) await refreshGitStatus(targetRepo);
        if (refreshPendingChanges) await refreshPendingChanges(targetRepo);
        await loadAllEdits();
      } else {
        setFeedback({
          type: "error",
          message: res.data?.error || "Erro ao criar proposta de versão.",
        });
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Falha na comunicação com o servidor.",
      });
    } finally {
      setIsCreatingPR(false);
    }
  };

  const handleGenerateSummaryAI = async (targetRepoName?: string) => {
    const targetRepo = targetRepoName || (selectedRepoFilter !== "all" ? selectedRepoFilter : activeRepo?.name || "local");
    setIsGeneratingAI(true);
    try {
      const res = await API.generatePRSummaryAI(targetRepo);
      if (res.ok && res.data) {
        if (res.data.title) setPrTitle(res.data.title);
        if (res.data.description) setPrDescription(res.data.description);

        if (res.data.is_ai_generated) {
          setFeedback({
            type: "success",
            message: "Nome semântico e descrição sugeridos com sucesso!",
          });
        } else {
          setFeedback({
            type: "success",
            message: "Resumo das alterações gerado com sucesso. Configure um modelo de IA nas configurações para obter sugestões semânticas ainda mais inteligentes.",
          });
        }
      }
    } catch (err) {
      console.error("[VersionsSubView] Erro ao gerar resumo IA:", err);
      setFeedback({
        type: "error",
        message: "Falha ao gerar resumo das alterações.",
      });
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleOpenFileClick = (filePath: string) => {
    if (onOpenFile) {
      onOpenFile(filePath);
    } else if (loadFile) {
      loadFile(filePath);
    }
  };

  const handleDiscard = async (filePath: string, targetRepo?: string) => {
    const repoName = targetRepo || activeRepo?.name || "local";
    if (
      window.confirm(
        `Deseja descartar as alterações locais do arquivo "${filePath}" no repositório "${repoName}"? Essa ação não pode ser desfeita.`,
      )
    ) {
      if (discardChanges) {
        const key = `${repoName}:${filePath}`;
        await discardChanges(filePath, repoName);
        setExpandedDraftFiles((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setDraftDiffs((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        await loadAllEdits();
        setFeedback({
          type: "success",
          message: `Alterações em "${filePath}" foram descartadas com sucesso.`,
        });
      }
    }
  };

  const handleDiscardAll = async (targetRepo?: string) => {
    const repoName = targetRepo || (selectedRepoFilter !== "all" ? selectedRepoFilter : activeRepo?.name || "local");
    if (
      window.confirm(
        `Tem certeza que deseja descartar TODAS as alterações pendentes no repositório "${repoName}"? Essa ação não pode ser desfeita.`,
      )
    ) {
      if (discardChanges) {
        await discardChanges(undefined, repoName);
        setExpandedDraftFiles({});
        setDraftDiffs({});
        await loadAllEdits();
        setFeedback({
          type: "success",
          message: `Todas as edições do repositório "${repoName}" foram descartadas.`,
        });
      }
    }
  };

  const getDraftDiffInfo = (filePath: string, targetRepo?: string) => {
    if (!filePath) return { diffText: "", additions: 0, deletions: 0, type: undefined, oldContent: "", newContent: "" };
    const cleanPath = filePath.replace(/^\/+/, "");
    const item = allDraftFiles.find(
      (c) => c.path === cleanPath && (!targetRepo || c.repoName === targetRepo)
    );
    const key = `${targetRepo || item?.repoName || "local"}:${cleanPath}`;
    const diffText = item?.diff_text || draftDiffs[key] || "";
    let adds = item?.additions;
    let dels = item?.deletions;

    if (adds === undefined || dels === undefined) {
      if (diffText) {
        const lines = diffText.split("\n");
        adds = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
        dels = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length;
      } else {
        adds = 0;
        dels = 0;
      }
    }
    return {
      diffText,
      additions: adds,
      deletions: dels,
      type: item?.type,
      oldContent: item?.old_content || "",
      newContent: item?.new_content || "",
    };
  };

  // Modal target files
  const modalDraftFiles = useMemo(() => {
    return allDraftFiles.filter((f) => f.repoName === modalTargetRepo);
  }, [allDraftFiles, modalTargetRepo]);

  const openProposalModalWithRepo = (targetRepo?: string) => {
    const repoToUse = targetRepo || (selectedRepoFilter !== "all" ? selectedRepoFilter : activeRepo?.name || (repos && repos[0]?.name) || "local");
    setModalTargetRepo(repoToUse);
    setIsProposalModalOpen(true);
  };

  return {
    providerLabel,
    selectedRepoFilter,
    setSelectedRepoFilter,
    repoEditsCounts,
    allReposDrafts,
    allDraftFiles,
    changedFiles,
    isClean,
    isLoadingChanges,
    feedback,
    setFeedback,
    isSyncing,
    handleSync,
    loadAllEdits,
    refreshGitStatus,
    refreshPendingChanges,
    openProposalModalWithRepo,
    handleOpenFileClick,
    // Drafts
    expandedDraftFiles,
    loadingDraftDiffs,
    getDraftDiffInfo,
    toggleDraftFile,
    toggleAllDraftFiles,
    handleDiscard,
    handleDiscardAll,
    prTitle,
    setPrTitle,
    prDescription,
    setPrDescription,
    isCreatingPR,
    createdPRUrl,
    handleCreateProposal,
    handleGenerateSummaryAI,
    isGeneratingAI,
    // Proposal Modal
    isProposalModalOpen,
    setIsProposalModalOpen,
    modalTargetRepo,
    setModalTargetRepo,
    modalDraftFiles,
    repos,
    activeRepo,
  };
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DraftsTrashModal } from "../../components/modals/DraftsTrashModal";
import { SafeSwitchModal } from "../../components/modals/SafeSwitchModal";
import {
  AlertBanner,
  Button,
  Input,
  PageContainer,
} from "../../components/ui";
import { useWorkspace } from "../../context/WorkspaceContext";
import type { GitFileStatus, GitGraphCommit } from "../../types";
import { GitGraphTimeline } from "./versions/components/GitGraphTimeline";
import { VersionCanvasView } from "./versions/components/VersionCanvasView";
import { CommitPanel } from "./versions/components/CommitPanel";

export interface VersionsCanvasSubViewProps {
  onNavigateToProposal?: (proposalId: number | string) => void;
  onOpenDiffModal?: (targetBranch?: string) => void;
}

export const VersionsCanvasSubView: React.FC<
  VersionsCanvasSubViewProps
> = () => {
  const {
    versionGraph,
    refreshVersionGraph,
    isVersionGraphLoading,
    safeSwitch,
    createOrSwitchBranch,
    commitGit,
    mergeBranch,
    refreshGitStatus,
    refreshPendingChanges,
  } = useWorkspace();

  const [viewMode, setViewMode] = useState<"canvas" | "timeline">("canvas");
  const [search, setSearch] = useState("");
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(
    null,
  );
  const [selectedTargetBranch, setSelectedTargetBranch] = useState<
    string | null
  >(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Safe switch guard modal
  const [safeModalOpen, setSafeModalOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<{
    branch?: string;
    commitHash?: string;
  } | null>(null);
  const [uncommittedFiles, setUncommittedFiles] = useState<GitFileStatus[]>([]);
  const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);

  const loadGraph = useCallback(async () => {
    if (refreshVersionGraph) {
      await refreshVersionGraph();
    }
  }, [refreshVersionGraph]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Auto-dismiss do feedback após 5 segundos
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => {
      setFeedback(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const commits = versionGraph?.commits || [];
  const currentBranch = versionGraph?.currentBranch || "main";
  const defaultBranch = versionGraph?.defaultBranch || "main";
  const isDetached = Boolean(versionGraph?.isDetached);
  const headHash = versionGraph?.headHash;

  // Seleciona o commit HEAD inicialmente quando os dados chegam
  useEffect(() => {
    if (!selectedCommitHash && commits.length > 0) {
      const headCommit = commits.find((c) => c.isHead) || commits[0];
      if (headCommit) {
        setSelectedCommitHash(headCommit.hash);
        setSelectedTargetBranch(currentBranch);
      }
    }
  }, [commits, selectedCommitHash, currentBranch]);

  const selectedCommit = useMemo(() => {
    if (!selectedCommitHash) return null;
    return commits.find((c) => c.hash === selectedCommitHash) || null;
  }, [commits, selectedCommitHash]);

  // Manipulador único e seguro de alternância (Branch ou Commit)
  const handleSwitchTarget = async (target: {
    branch?: string;
    commitHash?: string;
  }) => {
    // Evita no-op se já estiver no alvo
    if (target.branch && target.branch === currentBranch && !isDetached) return;
    if (target.commitHash && target.commitHash === headHash && isDetached)
      return;

    setIsProcessing(true);
    setFeedback(null);

    try {
      // 1. Checagem de segurança de arquivos não salvos
      const checkRes = await safeSwitch({
        ...target,
        action: "check",
      });

      if (
        checkRes.hasUncommitted &&
        checkRes.files &&
        checkRes.files.length > 0
      ) {
        setPendingTarget(target);
        setUncommittedFiles(checkRes.files);
        setSafeModalOpen(true);
        setIsProcessing(false);
        return;
      }

      // 2. Se o workspace estiver limpo, realiza a troca direta
      const switchRes = await safeSwitch({
        ...target,
        action: "switch",
      });

      if (switchRes.success) {
        if (target.commitHash) setSelectedCommitHash(target.commitHash);
        await Promise.all([
          refreshGitStatus?.(),
          refreshPendingChanges?.(),
          loadGraph(),
        ]);
      } else {
        setFeedback({
          type: "error",
          message: switchRes.error || "Erro ao alternar de versão.",
        });
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message: (err as Error).message || "Erro inesperado ao alternar.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // SafeSwitch Confirm: Salvar marco e alternar
  const handleConfirmCommitAndSwitch = async (msg: string) => {
    if (!pendingTarget || !commitGit) return;
    setIsProcessing(true);
    setFeedback(null);
    try {
      const commitRes = await commitGit(msg);
      if (!commitRes || !commitRes.success) {
        setFeedback({
          type: "error",
          message:
            commitRes?.message || "Falha ao gravar marco antes de alternar.",
        });
        setIsProcessing(false);
        return;
      }

      const switchRes = await safeSwitch({
        ...pendingTarget,
        action: "switch",
      });

      if (switchRes.success) {
        setSafeModalOpen(false);
        setPendingTarget(null);
        setFeedback({
          type: "success",
          message: "Marco salvo com sucesso e versão alternada.",
        });
        await Promise.all([
          refreshGitStatus?.(),
          refreshPendingChanges?.(),
          loadGraph(),
        ]);
      } else {
        setFeedback({
          type: "error",
          message: switchRes.error || "Falha ao alternar após salvar marco.",
        });
      }
    } catch (err) {
      setFeedback({ type: "error", message: (err as Error).message });
    } finally {
      setIsProcessing(false);
    }
  };

  // SafeSwitch Confirm: Guardar no stash e alternar
  const handleConfirmStash = async () => {
    if (!pendingTarget) return;
    setIsProcessing(true);
    try {
      const res = await safeSwitch({
        ...pendingTarget,
        action: "stash",
      });
      if (res.success) {
        setSafeModalOpen(false);
        setPendingTarget(null);
        setFeedback({
          type: "success",
          message:
            res.message || "Rascunhos guardados no stash e versão alternada.",
        });
        await Promise.all([
          refreshGitStatus?.(),
          refreshPendingChanges?.(),
          loadGraph(),
        ]);
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Falha ao guardar rascunhos.",
        });
      }
    } catch (err) {
      setFeedback({ type: "error", message: (err as Error).message });
    } finally {
      setIsProcessing(false);
    }
  };

  // SafeSwitch Confirm: Mover para lixeira e alternar
  const handleConfirmDiscard = async () => {
    if (!pendingTarget) return;
    setIsProcessing(true);
    try {
      const res = await safeSwitch({
        ...pendingTarget,
        action: "discard",
      });
      if (res.success) {
        setSafeModalOpen(false);
        setPendingTarget(null);
        setFeedback({
          type: "success",
          message:
            res.message || "Alterações salvas na lixeira e versão alternada.",
        });
        await Promise.all([
          refreshGitStatus?.(),
          refreshPendingChanges?.(),
          loadGraph(),
        ]);
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Falha ao descartar alterações.",
        });
      }
    } catch (err) {
      setFeedback({ type: "error", message: (err as Error).message });
    } finally {
      setIsProcessing(false);
    }
  };

  // Criar nova branch a partir de um commit ou da versão selecionada
  const handleCreateBranch = async (name: string, fromHash: string) => {
    setIsProcessing(true);
    setFeedback(null);
    try {
      const res = await createOrSwitchBranch(name, fromHash, name);
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Nova versão "${name}" criada e ativada com sucesso.`,
        });
        await Promise.all([
          refreshGitStatus?.(),
          refreshPendingChanges?.(),
          loadGraph(),
        ]);
      } else {
        setFeedback({
          type: "error",
          message: res.message || "Erro ao criar nova versão.",
        });
      }
    } catch (err) {
      setFeedback({ type: "error", message: (err as Error).message });
    } finally {
      setIsProcessing(false);
    }
  };

  // Mesclar uma branch na branch atual (Merge)
  const handleMergeBranch = async (sourceBranch: string) => {
    if (!mergeBranch) return;
    setIsProcessing(true);
    setFeedback(null);
    try {
      const res = await mergeBranch({ sourceBranch });
      if (res.success) {
        setFeedback({
          type: "success",
          message:
            res.message || `Branch "${sourceBranch}" mesclada com sucesso.`,
        });
        await Promise.all([
          refreshGitStatus?.(),
          refreshPendingChanges?.(),
          loadGraph(),
        ]);
      } else {
        setFeedback({
          type: "error",
          message: res.message || "Falha ao realizar o merge.",
        });
      }
    } catch (err) {
      setFeedback({ type: "error", message: (err as Error).message });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <PageContainer id="versions-canvas-subview">
      {/* Top Bar Minimalista e Clara */}
      <div
        style={{
          padding: "10px 20px",
          borderBottom: "1px solid var(--border-color)",
          background: "var(--bg-surface)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
          minHeight: "54px",
          zIndex: 5,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--text-heading)",
            }}
          >
            Versões & Linha do Tempo
          </h2>
        </div>

        {/* Ações da Barra Superior */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexShrink: 0,
          }}
        >
          {/* Alternador de Visualização: Mapa (Canvas) vs Linha do Tempo (Timeline) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "var(--bg-main)",
              padding: "2px",
              borderRadius: "6px",
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode("canvas")}
              style={{
                border: "none",
                background:
                  viewMode === "canvas" ? "var(--bg-surface)" : "transparent",
                color:
                  viewMode === "canvas"
                    ? "var(--text-heading)"
                    : "var(--text-secondary)",
                padding: "4px 10px",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: viewMode === "canvas" ? 600 : 300,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.12s ease",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "16px" }}
              >
                alt_route
              </span>
              <span>Mapa</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("timeline")}
              style={{
                border: "none",
                background:
                  viewMode === "timeline" ? "var(--bg-surface)" : "transparent",
                color:
                  viewMode === "timeline"
                    ? "var(--text-heading)"
                    : "var(--text-secondary)",
                padding: "4px 10px",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: viewMode === "timeline" ? 600 : 300,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.12s ease",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "16px" }}
              >
                timeline
              </span>
              <span>Linha</span>
            </button>
          </div>

          <Input
            type="text"
            placeholder="Buscar por mensagem, autor ou versão..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "220px", height: "32px", fontSize: "12px" }}
          />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadGraph()}
            disabled={isProcessing || isVersionGraphLoading}
            title="Recarregar histórico git do disco"
          >
            {isVersionGraphLoading ? "Atualizando..." : "Atualizar"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsTrashModalOpen(true)}
            title="Abrir lixeira local de rascunhos descartados"
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "16px" }}
            >
              delete
            </span>
            <span>Lixeira</span>
          </Button>

          {!isDrawerOpen && selectedCommit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDrawerOpen(true)}
            >
              Ver Detalhes
            </Button>
          )}
        </div>
      </div>

      {/* Banner de Feedback */}
      {feedback && (
        <div style={{ padding: "8px 20px 0 20px" }}>
          <AlertBanner
            type={feedback.type === "success" ? "success" : "error"}
            message={feedback.message}
            onClose={() => setFeedback(null)}
          />
        </div>
      )}

      {/* Área Principal: Grafo à Esquerda + Painel de Detalhes à Direita */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flex: 1,
          height: "calc(100vh - 120px)",
          overflow: "hidden",
        }}
      >
        {/* Grafo: Canvas 2D ou Linha do Tempo */}
        <div style={{ flex: 1, height: "100%", overflow: "hidden" }}>
          {viewMode === "canvas" ? (
            <VersionCanvasView
              commits={commits}
              nodes={versionGraph?.nodes || []}
              defaultBranch={defaultBranch}
              currentBranch={currentBranch}
              isDetached={isDetached}
              headHash={headHash}
              selectedCommitHash={selectedCommitHash}
              selectedBranchName={selectedTargetBranch}
              onSelectCommit={(commit: GitGraphCommit, branchName?: string) => {
                setSelectedCommitHash(commit.hash);
                setSelectedTargetBranch(branchName || null);
                setIsDrawerOpen(true);
              }}
              onSwitchCommit={(
                commit: GitGraphCommit,
                targetBranch?: string,
              ) => {
                if (targetBranch) {
                  handleSwitchTarget({ branch: targetBranch });
                } else {
                  const b = commit.branches?.find(
                    (x) => x.name !== currentBranch,
                  );
                  if (b) {
                    handleSwitchTarget({ branch: b.name });
                  } else {
                    handleSwitchTarget({ commitHash: commit.hash });
                  }
                }
              }}
              searchQuery={search}
            />
          ) : (
            <GitGraphTimeline
              commits={commits}
              selectedHash={selectedCommitHash}
              onSelectCommit={(commit: GitGraphCommit) => {
                setSelectedCommitHash(commit.hash);
                const b =
                  commit.branches?.find((x) => !x.isDefault) ||
                  commit.branches?.[0];
                setSelectedTargetBranch(b?.name || defaultBranch);
                setIsDrawerOpen(true);
              }}
              onSwitchCommit={(
                commit: GitGraphCommit,
                targetBranch?: string,
              ) => {
                if (targetBranch) {
                  handleSwitchTarget({ branch: targetBranch });
                } else {
                  const b = commit.branches?.find(
                    (x) => x.name !== currentBranch,
                  );
                  if (b) {
                    handleSwitchTarget({ branch: b.name });
                  } else {
                    handleSwitchTarget({ commitHash: commit.hash });
                  }
                }
              }}
              searchQuery={search}
            />
          )}
        </div>

        {/* Painel Lateral de Detalhes e Ações do Commit */}
        {isDrawerOpen && selectedCommit && (
          <CommitPanel
            commit={selectedCommit}
            targetBranchName={selectedTargetBranch}
            currentBranch={currentBranch}
            defaultBranch={defaultBranch}
            isDetached={isDetached}
            headHash={headHash}
            nodes={versionGraph?.nodes}
            onClose={() => setIsDrawerOpen(false)}
            onSwitch={handleSwitchTarget}
            onCreateBranch={handleCreateBranch}
            onMerge={handleMergeBranch}
            isProcessing={isProcessing}
          />
        )}
      </div>

      {/* Modal de Transição Segura com Edições Pendentes (SafeSwitchModal) */}
      <SafeSwitchModal
        isOpen={safeModalOpen}
        onClose={() => {
          setSafeModalOpen(false);
          setPendingTarget(null);
        }}
        targetBranch={
          pendingTarget?.branch ||
          (pendingTarget?.commitHash
            ? `marco ${pendingTarget.commitHash.slice(0, 7)}`
            : "")
        }
        currentBranch={
          isDetached
            ? `HEAD (${headHash ? headHash.slice(0, 7) : ""})`
            : currentBranch
        }
        uncommittedFiles={uncommittedFiles}
        onConfirmCommit={handleConfirmCommitAndSwitch}
        onConfirmStash={handleConfirmStash}
        onConfirmDiscard={handleConfirmDiscard}
        isProcessing={isProcessing}
      />

      {/* Modal da Lixeira Permanente de Rascunhos */}
      <DraftsTrashModal
        isOpen={isTrashModalOpen}
        onClose={() => setIsTrashModalOpen(false)}
      />
    </PageContainer>
  );
};

export default VersionsCanvasSubView;

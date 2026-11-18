import React, { useState } from "react";
import { BookmarkPlus, Eye, GitBranch, RefreshCw, Send, Trash2 } from "lucide-react";
import { Button, Input } from "../../../../components/ui";
import { useWorkspace } from "../../../../context/WorkspaceContext";
import { API } from "../../../../services/api";
import { CreateDraftBranchModal } from "../../../../components/modals/CreateDraftBranchModal";
import { CreatePublicationModal } from "../../../../components/modals/CreatePublicationModal";
import { isPathHidden } from "../../../../utils/hidden-files";

export interface EditorVersionBarProps {
  isDraftPromptOpen: boolean;
  onCloseDraftPrompt: () => void;
  onOpenDraftPrompt: () => void;
  suggestedDraftName?: string;
}

export const EditorVersionBar: React.FC<EditorVersionBarProps> = ({
  isDraftPromptOpen,
  onCloseDraftPrompt,
  onOpenDraftPrompt,
  suggestedDraftName,
}) => {
  const {
    activeRepo,
    gitStatus,
    versionGraph,
    commitGit,
    discardChanges,
    createOrSwitchBranch,
    safeSwitch,
    refreshGitStatus,
    refreshPendingChanges,
    refreshVersionGraph,
  } = useWorkspace();

  const [isCreatingCheckpoint, setIsCreatingCheckpoint] = useState(false);
  const [checkpointMsg, setCheckpointMsg] = useState("");
  const [isSavingCheckpoint, setIsSavingCheckpoint] = useState(false);
  const [isPubModalOpen, setIsPubModalOpen] = useState(false);
  const [isUpdatingPub, setIsUpdatingPub] = useState(false);
  const [isBranchBusy, setIsBranchBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const defaultBranch = versionGraph?.defaultBranch || activeRepo?.default_branch || "main";
  const currentBranch = gitStatus?.branch || versionGraph?.currentBranch || defaultBranch;
  const isDetached = Boolean(versionGraph?.isDetached);
  const isOfficial = !isDetached && currentBranch === defaultBranch;

  const activeNode = versionGraph?.nodes?.find((n) => n.name === currentBranch);
  const isPublished = Boolean(
    !isOfficial &&
      !isDetached &&
      (activeNode?.isMerged || activeNode?.publicationStatus === "published"),
  );
  const isReadOnlyMode = isDetached || isPublished;
  const hasOpenProposal = Boolean(
    !isOfficial &&
      !isReadOnlyMode &&
      (activeNode?.publicationStatus === "open" || activeNode?.proposal?.status === "OPEN"),
  );
  const displayVersionName = isDetached
    ? "Histórico"
    : isOfficial
      ? "Versão Oficial"
      : activeNode?.displayName || currentBranch;

  const uncommittedFiles = (gitStatus?.files || []).filter(
    (f) => f?.path && !isPathHidden(f.path),
  );
  const uncommittedCount = uncommittedFiles.length;
  const checkpointsCount = !isOfficial && !isDetached ? activeNode?.ahead || 0 : 0;

  const handleSaveCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitGit) return;
    const msg = checkpointMsg.trim() || `Checkpoint em ${displayVersionName}`;
    setIsSavingCheckpoint(true);
    setFeedback(null);
    try {
      const res = await commitGit(msg);
      if (res?.success) {
        setCheckpointMsg("");
        setIsCreatingCheckpoint(false);
        setFeedback({ type: "success", text: `Checkpoint "${msg}" salvo neste rascunho.` });
      } else {
        setFeedback({ type: "error", text: res?.message || "Não foi possível salvar o checkpoint." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Erro ao salvar checkpoint." });
    } finally {
      setIsSavingCheckpoint(false);
    }
  };

  const handleDiscardAll = async () => {
    if (!discardChanges) return;
    if (!window.confirm("Descartar todas as alterações ainda não salvas em checkpoint?")) return;
    await discardChanges();
    await refreshGitStatus?.();
    await refreshVersionGraph?.();
    setFeedback({ type: "success", text: "Alterações pendentes descartadas." });
  };

  const handleReturnToOfficial = async () => {
    if (!safeSwitch) return;
    setIsBranchBusy(true);
    try {
      await safeSwitch({ branch: defaultBranch, action: "switch" });
      await Promise.all([
        refreshGitStatus?.(),
        refreshPendingChanges?.(),
        refreshVersionGraph?.(),
      ]);
    } finally {
      setIsBranchBusy(false);
    }
  };

  const handleCreateDraftBranch = async (params: {
    branchName: string;
    baseBranch: string;
    displayTitle: string;
  }) => {
    if (!createOrSwitchBranch) return;
    setIsBranchBusy(true);
    setFeedback(null);
    try {
      const res = await createOrSwitchBranch(
        params.branchName,
        params.baseBranch,
        params.displayTitle,
      );
      if (res?.success !== false) {
        onCloseDraftPrompt();
        setFeedback({
          type: "success",
          text: `Rascunho "${params.displayTitle}" criado. Suas edições serão salvas nele.`,
        });
      } else {
        setFeedback({
          type: "error",
          text: res?.message || "Não foi possível criar o rascunho de versão.",
        });
      }
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Erro ao criar rascunho de versão." });
    } finally {
      setIsBranchBusy(false);
    }
  };

  const handleUpdateOpenPublication = async () => {
    if (!activeRepo || !activeNode) return;
    setIsUpdatingPub(true);
    setFeedback(null);
    try {
      const res = await API.createPR({
        title: activeNode.proposal?.title || displayVersionName,
        description: activeNode.proposal?.description || "",
        sourceBranch: currentBranch,
        targetProposalId: activeNode.proposal?.id,
        repo: activeRepo.name,
      });
      if (res.ok && res.data && !res.data.error) {
        setFeedback({
          type: "success",
          text: res.data.message || "Publicação atualizada com suas novas alterações!",
        });
        await Promise.all([
          refreshGitStatus?.(),
          refreshPendingChanges?.(),
          refreshVersionGraph?.(),
        ]);
      } else {
        setFeedback({
          type: "error",
          text: res.data?.error || "Não foi possível atualizar a publicação.",
        });
      }
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Erro ao atualizar publicação." });
    } finally {
      setIsUpdatingPub(false);
    }
  };

  if (!activeRepo) return null;

  return (
    <>
      {isReadOnlyMode && (
        <div
          style={{
            padding: "6px 16px",
            background: "rgba(245, 158, 11, 0.12)",
            borderBottom: "1px solid rgba(245, 158, 11, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            fontSize: "12px",
            color: "#b45309",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600 }}>
            <Eye size={14} />
            {isPublished
              ? "Versão já publicada (somente leitura)"
              : "Histórico (somente leitura)"}
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button
              size="sm"
              variant="outline"
              onClick={onOpenDraftPrompt}
              disabled={isBranchBusy}
            >
              Novo rascunho
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleReturnToOfficial}
              disabled={isBranchBusy}
            >
              Ir para Oficial
            </Button>
          </div>
        </div>
      )}

      <div
        style={{
          padding: "6px 16px",
          background: "var(--bg-surface, #ffffff)",
          borderBottom: "1px solid var(--border-color, #e2e8f0)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          flexWrap: "wrap",
          fontSize: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontWeight: 600,
              color: isOfficial ? "#1d4ed8" : "#7c3aed",
              background: isOfficial ? "rgba(37, 99, 235, 0.08)" : "rgba(124, 58, 237, 0.08)",
              padding: "3px 10px",
              borderRadius: "9999px",
            }}
          >
            <GitBranch size={13} />
            {displayVersionName}
          </span>

          {hasOpenProposal && (
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "9999px",
                background: "rgba(245, 158, 11, 0.12)",
                color: "#b45309",
                border: "1px solid rgba(245, 158, 11, 0.35)",
              }}
            >
              Em Publicação{activeNode?.proposal?.id ? ` #${activeNode.proposal.id}` : ""}
            </span>
          )}

          {uncommittedCount > 0 && (
            <span style={{ color: "#d97706", fontWeight: 500 }}>
              • {uncommittedCount} alteração(ões) sem checkpoint
            </span>
          )}

          {checkpointsCount > 0 && (
            <span style={{ color: "var(--text-secondary)" }}>
              • {checkpointsCount} checkpoint(s) neste rascunho
            </span>
          )}

          {feedback && (
            <span
              style={{
                color: feedback.type === "success" ? "#15803d" : "#dc2626",
                fontWeight: 500,
              }}
            >
              • {feedback.text}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {isOfficial && (
            <Button
              size="sm"
              variant="outline"
              onClick={onOpenDraftPrompt}
              icon={<GitBranch size={13} />}
            >
              Novo Rascunho de Versão
            </Button>
          )}

          {uncommittedCount > 0 && !isCreatingCheckpoint && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDiscardAll}
                icon={<Trash2 size={13} />}
                style={{ color: "#dc2626" }}
              >
                Descartar
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setIsCreatingCheckpoint(true)}
                icon={<BookmarkPlus size={13} />}
              >
                Criar Checkpoint
              </Button>
            </>
          )}

          {isCreatingCheckpoint && (
            <form
              onSubmit={handleSaveCheckpoint}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <Input
                value={checkpointMsg}
                onChange={(e) => setCheckpointMsg(e.target.value)}
                placeholder="O que mudou neste checkpoint?"
                style={{ height: "28px", width: "220px", fontSize: "12px" }}
                autoFocus
              />
              <Button
                type="submit"
                size="sm"
                variant="primary"
                isLoading={isSavingCheckpoint}
                disabled={isSavingCheckpoint}
              >
                Salvar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setIsCreatingCheckpoint(false)}
              >
                Cancelar
              </Button>
            </form>
          )}

          {hasOpenProposal ? (
            <Button
              size="sm"
              variant="primary"
              onClick={handleUpdateOpenPublication}
              isLoading={isUpdatingPub}
              disabled={isUpdatingPub}
              icon={<RefreshCw size={13} />}
            >
              {isUpdatingPub ? "Atualizando..." : "Atualizar Publicação"}
            </Button>
          ) : (!isOfficial && !isReadOnlyMode && (checkpointsCount > 0 || uncommittedCount > 0)) ||
            (isOfficial && uncommittedCount > 0) ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setIsPubModalOpen(true)}
              icon={<Send size={13} />}
            >
              Enviar para Publicação
            </Button>
          ) : null}
        </div>
      </div>

      <CreateDraftBranchModal
        isOpen={isDraftPromptOpen}
        onClose={onCloseDraftPrompt}
        defaultBaseBranch={defaultBranch}
        availableBranches={versionGraph?.nodes || []}
        suggestedName={suggestedDraftName}
        onConfirmCreate={handleCreateDraftBranch}
        isProcessing={isBranchBusy}
      />

      <CreatePublicationModal
        isOpen={isPubModalOpen}
        onClose={() => setIsPubModalOpen(false)}
        repoName={activeRepo.name}
        nodes={versionGraph?.nodes || []}
        defaultBranch={defaultBranch}
        initialSourceBranch={!isOfficial && !isReadOnlyMode ? currentBranch : undefined}
        onCreated={async () => {
          setFeedback({ type: "success", text: "Pedido de publicação enviado!" });
          await Promise.all([
            refreshGitStatus?.(),
            refreshPendingChanges?.(),
            refreshVersionGraph?.(),
          ]);
        }}
      />
    </>
  );
};

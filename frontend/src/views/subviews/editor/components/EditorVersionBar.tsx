import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookmarkPlus, ChevronDown, Eye, FileText, GitBranch, RefreshCw, Send, Trash2 } from "lucide-react";
import { Button, Input, Modal, Spinner } from "../../../../components/ui";
import { DiffViewer } from "../../../../components/common";
import { VisualMarkdownDiff } from "../../../../components/editor/VisualMarkdownDiff";
import { useWorkspace } from "../../../../context/WorkspaceContext";
import { API } from "../../../../services/api";
import { CreateDraftBranchModal } from "../../../../components/modals/CreateDraftBranchModal";
import { CreatePublicationModal } from "../../../../components/modals/CreatePublicationModal";
import { isPathHidden } from "../../../../utils/hidden-files";
import type { WorkspaceChange } from "../../../../types";

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
  const [isBranchBusy, setIsBranchBusy] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedPendingDiffPath, setSelectedPendingDiffPath] = useState<string | null>(null);
  const [pendingDiffData, setPendingDiffData] = useState<WorkspaceChange | null>(null);
  const [isLoadingPendingDiff, setIsLoadingPendingDiff] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuPortalRef = useRef<HTMLDivElement>(null);

  const handleOpenPendingFileDiff = async (filePath: string) => {
    setIsMenuOpen(false);
    setSelectedPendingDiffPath(filePath);
    setPendingDiffData(null);
    setIsLoadingPendingDiff(true);
    try {
      const res = await API.getWorkspaceChanges(activeRepo?.name);
      const match = (res?.changes || []).find((c) => c.path === filePath) || null;
      setPendingDiffData(match);
    } catch {
      setPendingDiffData(null);
    } finally {
      setIsLoadingPendingDiff(false);
    }
  };

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const updatePos = () => {
      if (dropdownRef.current) {
        const rect = dropdownRef.current.getBoundingClientRect();
        setMenuPos({ top: rect.bottom + 6, left: rect.left });
      }
    };
    updatePos();
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        (!menuPortalRef.current || !menuPortalRef.current.contains(target))
      ) {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    document.addEventListener("mousedown", handleOutside);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
      document.removeEventListener("mousedown", handleOutside);
    };
  }, [isMenuOpen]);

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
          padding: "5px 16px",
          background: "var(--bg-surface, #ffffff)",
          borderBottom: "1px solid var(--border-color, #e2e8f0)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          fontSize: "12px",
          minHeight: "36px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <div ref={dropdownRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px",
                borderRadius: "6px",
                border: "1px solid var(--border-color, #e2e8f0)",
                background: isMenuOpen ? "var(--bg-main, #f1f5f9)" : "var(--bg-surface, #ffffff)",
                color: "var(--text-heading)",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <span>
                {uncommittedCount > 0 ? (
                  <strong style={{ color: "#d97706" }}>
                    {uncommittedCount} pendente{uncommittedCount === 1 ? "" : "s"}
                  </strong>
                ) : (
                  <span style={{ color: "var(--text-secondary)" }}>Sem pendências</span>
                )}
                {checkpointsCount > 0 && (
                  <span style={{ color: "var(--text-secondary)" }}>
                    {" "}• {checkpointsCount} checkpoint{checkpointsCount === 1 ? "" : "s"}
                  </span>
                )}
              </span>
              <ChevronDown size={13} style={{ color: "var(--text-secondary)" }} />
            </button>

            {isMenuOpen &&
              createPortal(
                <div
                  ref={menuPortalRef}
                  style={{
                    position: "fixed",
                    top: `${menuPos.top}px`,
                    left: `${menuPos.left}px`,
                    zIndex: 9999,
                    width: "300px",
                    background: "var(--bg-surface, #ffffff)",
                    border: "1px solid var(--border-color, #e2e8f0)",
                    borderRadius: "10px",
                    boxShadow: "0 10px 25px rgba(15, 23, 42, 0.14)",
                    padding: "10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                <div style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Resumo das alterações
                </div>

                {uncommittedFiles.length > 0 ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      maxHeight: "150px",
                      overflowY: "auto",
                      padding: "6px",
                      borderRadius: "6px",
                      background: "var(--bg-main, #f8fafc)",
                      border: "1px solid var(--border-color, #e2e8f0)",
                    }}
                  >
                    {uncommittedFiles.map((f) => (
                      <button
                        key={f.path}
                        type="button"
                        onClick={() => handleOpenPendingFileDiff(f.path)}
                        title={`Ver alterações de ${f.path}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "6px",
                          width: "100%",
                          padding: "4px 6px",
                          border: "none",
                          borderRadius: "5px",
                          background: "transparent",
                          fontSize: "11.5px",
                          color: "var(--text-heading)",
                          fontFamily: "monospace",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                          <FileText size={12} style={{ flexShrink: 0, color: "#d97706" }} />
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {f.path}
                          </span>
                        </span>
                        <Eye size={12} style={{ flexShrink: 0, color: "var(--text-secondary)" }} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", padding: "2px 0" }}>
                    Nenhuma edição local pendente de checkpoint.
                  </div>
                )}

                {(isOfficial || uncommittedCount > 0) && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      borderTop: "1px solid var(--border-color, #e2e8f0)",
                      paddingTop: "8px",
                    }}
                  >
                    {isOfficial && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          onOpenDraftPrompt();
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: "6px",
                          border: "none",
                          background: "transparent",
                          color: "var(--text-heading)",
                          fontSize: "12px",
                          fontWeight: 500,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <GitBranch size={14} />
                        Novo Rascunho de Versão
                      </button>
                    )}

                    {uncommittedCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          handleDiscardAll();
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: "6px",
                          border: "none",
                          background: "transparent",
                          color: "#dc2626",
                          fontSize: "12px",
                          fontWeight: 500,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <Trash2 size={14} />
                        Descartar alterações
                      </button>
                    )}
                  </div>
                )}
              </div>,
                document.body,
              )}
          </div>

          {hasOpenProposal && (
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "9999px",
                background: "rgba(124, 58, 237, 0.12)",
                color: "#7c3aed",
                border: "1px solid rgba(124, 58, 237, 0.3)",
                whiteSpace: "nowrap",
              }}
            >
              Em Publicação{activeNode?.proposal?.id ? ` #${activeNode.proposal.id}` : ""}
            </span>
          )}

          {feedback && (
            <span
              style={{
                color: feedback.type === "success" ? "#15803d" : "#dc2626",
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              • {feedback.text}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {uncommittedCount > 0 && !isCreatingCheckpoint && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsCreatingCheckpoint(true)}
              icon={<BookmarkPlus size={13} />}
            >
              Checkpoint
            </Button>
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
            (() => {
              const hasUpdatesToPublish = uncommittedCount > 0 || (gitStatus?.ahead ?? 0) > 0;
              return (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setIsPubModalOpen(true)}
                  disabled={!hasUpdatesToPublish}
                  title={
                    hasUpdatesToPublish
                      ? "Revisar e atualizar a publicação aberta"
                      : "Nenhuma nova alteração para enviar"
                  }
                  icon={<RefreshCw size={13} />}
                >
                  Atualizar Publicação
                </Button>
              );
            })()
          ) : (!isOfficial && !isReadOnlyMode && (checkpointsCount > 0 || uncommittedCount > 0)) ||
            (isOfficial && uncommittedCount > 0) ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setIsPubModalOpen(true)}
              icon={<Send size={13} />}
            >
              Publicar
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
        existingProposal={hasOpenProposal ? activeNode?.proposal : undefined}
        onCreated={async (pr) => {
          setFeedback({
            type: "success",
            text:
              pr?.message ||
              (hasOpenProposal
                ? "Publicação atualizada com suas novas alterações!"
                : "Pedido de publicação enviado!"),
          });
          await Promise.all([
            refreshGitStatus?.(),
            refreshPendingChanges?.(),
            refreshVersionGraph?.(),
          ]);
        }}
      />

      <Modal
        isOpen={Boolean(selectedPendingDiffPath)}
        onClose={() => {
          setSelectedPendingDiffPath(null);
          setPendingDiffData(null);
        }}
        size="xl"
        title={
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FileText size={17} color="#d97706" />
            <span>Diferenças pendentes</span>
          </span>
        }
        subtitle={selectedPendingDiffPath || undefined}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSelectedPendingDiffPath(null);
                setPendingDiffData(null);
              }}
            >
              Fechar
            </Button>
          </div>
        }
      >
        {isLoadingPendingDiff ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "24px", justifyContent: "center" }}>
            <Spinner size="sm" />
            <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Carregando diferenças do arquivo...
            </span>
          </div>
        ) : pendingDiffData &&
          (pendingDiffData.old_content !== undefined ||
            pendingDiffData.new_content !== undefined) ? (
          <div style={{ border: "1px solid var(--border-color, #e2e8f0)", borderRadius: "8px", overflow: "hidden" }}>
            <VisualMarkdownDiff
              oldContent={pendingDiffData.old_content || ""}
              newContent={pendingDiffData.new_content || ""}
              fileName={selectedPendingDiffPath || undefined}
              oldTitle="Último Checkpoint / Oficial"
              newTitle="Edição Local Atual"
              hideHeader={true}
              initialViewMode="split"
            />
          </div>
        ) : pendingDiffData?.diff_text ? (
          <DiffViewer diffText={pendingDiffData.diff_text} />
        ) : (
          <div style={{ padding: "16px", fontSize: "13px", color: "var(--text-secondary)" }}>
            Nenhuma alteração textual encontrada para este arquivo.
          </div>
        )}
      </Modal>
    </>
  );
};

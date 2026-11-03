import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { API } from "../../services/api";
import { isPathHidden } from "../../utils/hidden-files";

import { GitBranchesTab } from "./git/GitBranchesTab";
import { GitHistoryTab } from "./git/GitHistoryTab";
import { GitStatusTab } from "./git/GitStatusTab";
import { GitWhatsNewTab, type WhatsNewFilterType } from "./git/GitWhatsNewTab";

interface GitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDiffModal?: () => void;
}

type TabType = "status" | "whats-new" | "history" | "branches";

export const GitModal: React.FC<GitModalProps> = ({
  isOpen,
  onClose,
  onOpenDiffModal: _onOpenDiffModal,
}) => {
  const {
    activeRepo,
    gitStatus,
    gitLog = [],
    pendingChanges = [],
    whatsNewSummary,
    hasUnreadWhatsNew,
    refreshGitStatus,
    refreshGitLog,
    refreshPendingChanges,
    refreshWhatsNew,
    markWhatsNewAsSeen,
    commitGit,
    syncGit,
    createOrSwitchBranch,
    loadFile,
  } = useWorkspace();

  const [activeTab, setActiveTab] = useState<TabType>("status");
  const [whatsNewFilter, setWhatsNewFilter] =
    useState<WhatsNewFilterType>("all");
  const [commitMsg, setCommitMsg] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Expandable file diffs state
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>(
    {},
  );
  const [fileDiffs, setFileDiffs] = useState<Record<string, string>>({});
  const [loadingDiffs, setLoadingDiffs] = useState<Record<string, boolean>>({});

  const changedFiles = useMemo(() => {
    return (gitStatus?.files || []).filter(
      (f) => f?.path && !isPathHidden(f.path),
    );
  }, [gitStatus?.files]);
  const currentBranch = gitStatus?.branch || "main";
  const isClean = gitStatus?.isClean ?? changedFiles.length === 0;

  // Load status and pending changes when opened
  useEffect(() => {
    if (isOpen) {
      if (refreshGitStatus) refreshGitStatus();
      if (refreshGitLog) refreshGitLog(25);
      if (refreshPendingChanges) refreshPendingChanges();
      if (refreshWhatsNew) refreshWhatsNew();
      setFeedback(null);
      if (hasUnreadWhatsNew && isClean) {
        setActiveTab("whats-new");
      }
    }
  }, [
    isOpen,
    hasUnreadWhatsNew,
    isClean,
    refreshGitStatus,
    refreshGitLog,
    refreshPendingChanges,
    refreshWhatsNew,
  ]);

  // Fetch diff on demand if not available in pendingChanges
  const fetchFileDiff = useCallback(
    async (filePath: string) => {
      if (!filePath || fileDiffs[filePath]) return;
      setLoadingDiffs((prev) => ({ ...prev, [filePath]: true }));
      try {
        const res = await API.getGitDiff(filePath);
        if (res?.ok && res?.data?.diff) {
          setFileDiffs((prev) => ({ ...prev, [filePath]: res.data.diff }));
        }
      } catch (err) {
        console.error(
          `[GitModal] Erro ao buscar comparativo de ${filePath}:`,
          err,
        );
      } finally {
        setLoadingDiffs((prev) => ({ ...prev, [filePath]: false }));
      }
    },
    [fileDiffs],
  );

  // Toggle single file accordion
  const toggleFileExpand = (filePath: string) => {
    if (!filePath) return;
    const nextState = !expandedFiles[filePath];
    setExpandedFiles((prev) => ({ ...prev, [filePath]: nextState }));
    if (nextState) {
      fetchFileDiff(filePath);
    }
  };

  // Expand all / Collapse all
  const expandAll = () => {
    const allExpanded: Record<string, boolean> = {};
    changedFiles.forEach((f) => {
      if (f?.path) {
        allExpanded[f.path] = true;
        fetchFileDiff(f.path);
      }
    });
    setExpandedFiles(allExpanded);
  };

  const collapseAll = () => {
    setExpandedFiles({});
  };

  const handleOpenFile = async (filePath: string) => {
    if (!filePath) return;
    try {
      if (loadFile) await loadFile(filePath);
      onClose();
    } catch (err) {
      console.error("[GitModal] Erro ao abrir documento:", err);
    }
  };

  const handleMarkAsSeen = () => {
    if (markWhatsNewAsSeen) markWhatsNewAsSeen();
    setFeedback({
      type: "success",
      message: "Todas as novidades foram marcadas como visualizadas!",
    });
  };

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMsg.trim()) return;

    setIsCommitting(true);
    setFeedback(null);
    try {
      const res = await commitGit(commitMsg.trim());
      if (res?.success) {
        setFeedback({
          type: "success",
          message: `Novo marco oficial registrado com sucesso (${res.commitHash ? res.commitHash.slice(0, 7) : "versão atual"})!`,
        });
        setCommitMsg("");
        if (refreshPendingChanges) await refreshPendingChanges();
      } else {
        setFeedback({
          type: "error",
          message: res?.message || "Falha ao registrar novo marco de versão.",
        });
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Erro inesperado ao registrar marco de versão.",
      });
    } finally {
      setIsCommitting(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setFeedback(null);
    try {
      const res = await syncGit();
      if (res?.success) {
        setFeedback({
          type: "success",
          message: `Sincronização com  concluída: ${res.message || "Atualizado"}`,
        });
        if (refreshPendingChanges) await refreshPendingChanges();
        if (refreshWhatsNew) await refreshWhatsNew();
        if (hasUnreadWhatsNew) {
          setActiveTab("whats-new");
        }
      } else {
        setFeedback({
          type: "error",
          message: `Aviso de sincronização: ${res?.message || "Falha ao sincronizar"}`,
        });
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Erro ao sincronizar com o servidor d.",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;

    try {
      const res = await createOrSwitchBranch(newBranchName.trim());
      if (res?.success) {
        setFeedback({ type: "success", message: res.message });
        setNewBranchName("");
        if (refreshPendingChanges) await refreshPendingChanges();
      } else {
        setFeedback({
          type: "error",
          message: res?.message || "Erro ao alternar trilha",
        });
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Erro ao alternar trilha de trabalho.",
      });
    }
  };

  // Helper to get diff text and stats for a given file
  const getFileDiffInfo = (filePath: string) => {
    if (!filePath) return { diffText: "", additions: 0, deletions: 0 };
    const cleanPath = filePath.replace(/^\/+/, "");
    const wsChange = (pendingChanges || []).find(
      (c) => c?.path === filePath || c?.path?.replace(/^\/+/, "") === cleanPath,
    );

    const diffText =
      wsChange?.diff_text || wsChange?.diff || fileDiffs[filePath] || "";

    let adds = wsChange?.additions;
    let dels = wsChange?.deletions;

    if (adds === undefined || dels === undefined) {
      if (diffText) {
        const lines = diffText.split("\n");
        adds = lines.filter(
          (l) => l.startsWith("+") && !l.startsWith("+++"),
        ).length;
        dels = lines.filter(
          (l) => l.startsWith("-") && !l.startsWith("---"),
        ).length;
      } else {
        adds = 0;
        dels = 0;
      }
    }

    return { diffText, additions: adds, deletions: dels, type: wsChange?.type };
  };

  const renderDiffViewer = (diffText: string, filePath: string) => {
    if (loadingDiffs[filePath]) {
      return (
        <div
          style={{
            padding: "16px",
            color: "var(--text-muted)",
            fontSize: "12px",
            background: "#0d1117",
            textAlign: "center",
            borderRadius: "0 0 6px 6px",
          }}
        >
          <span
            className="material-symbols-outlined icon-xs"
            style={{
              animation: "spin 1s linear infinite",
              verticalAlign: "middle",
              marginRight: "6px",
            }}
          >
            progress_activity
          </span>
          Carregando comparativo de mudanças...
        </div>
      );
    }

    if (!diffText || !diffText.trim()) {
      return (
        <div
          style={{
            padding: "14px",
            color: "#8b949e",
            fontSize: "12px",
            fontStyle: "italic",
            background: "#0d1117",
            borderRadius: "0 0 6px 6px",
          }}
        >
          Nenhuma alteração de texto detectada neste arquivo (ou arquivo
          binário).
        </div>
      );
    }

    const lines = diffText.split("\n");

    return (
      <pre
        style={{
          margin: 0,
          padding: "8px 0",
          fontSize: "12px",
          lineHeight: "1.5",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          background: "#0d1117",
          color: "#e6edf3",
          overflowX: "auto",
          maxHeight: "320px",
          borderRadius: "0 0 6px 6px",
        }}
      >
        {lines.map((line, idx) => {
          let bg = "transparent";
          let color = "#e6edf3";
          let fontWeight = "normal";

          if (line.startsWith("+") && !line.startsWith("+++")) {
            bg = "rgba(46, 160, 67, 0.2)";
            color = "#3fb950";
          } else if (line.startsWith("-") && !line.startsWith("---")) {
            bg = "rgba(248, 81, 73, 0.2)";
            color = "#f85149";
          } else if (line.startsWith("@@")) {
            bg = "rgba(56, 139, 253, 0.15)";
            color = "#79c0ff";
            fontWeight = "600";
          } else if (
            line.startsWith("diff ") ||
            line.startsWith("index ") ||
            line.startsWith("--- ") ||
            line.startsWith("+++ ")
          ) {
            color = "#8b949e";
            fontWeight = "600";
          }

          return (
            <div
              key={idx}
              style={{
                display: "flex",
                padding: "1px 12px",
                backgroundColor: bg,
                color: color,
                fontWeight: fontWeight,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "32px",
                  userSelect: "none",
                  color: "#6e7681",
                  textAlign: "right",
                  marginRight: "12px",
                  fontSize: "11px",
                }}
              >
                {idx + 1}
              </span>
              <span style={{ flex: 1 }}>{line || " "}</span>
            </div>
          );
        })}
      </pre>
    );
  };

  const allAreExpanded =
    changedFiles.length > 0 &&
    changedFiles.every((f) => expandedFiles[f?.path]);

  // Whats New computed list with safety fallbacks
  const whatsNewFiles = useMemo(() => {
    return (whatsNewSummary?.files || []).filter(
      (f) => f?.path && !isPathHidden(f.path),
    );
  }, [whatsNewSummary?.files]);
  const whatsNewProposals = whatsNewSummary?.proposals || [];
  const whatsNewCommits = whatsNewSummary?.commits || [];

  const newFilesCount = whatsNewFiles.filter((f) => f?.status === "A").length;
  const modFilesCount = whatsNewFiles.filter((f) => f?.status === "M").length;

  const filteredWhatsNewFiles = useMemo(() => {
    if (whatsNewFilter === "new")
      return whatsNewFiles.filter((f) => f?.status === "A");
    if (whatsNewFilter === "modified")
      return whatsNewFiles.filter((f) => f?.status === "M");
    if (whatsNewFilter === "proposals") return [];
    return whatsNewFiles;
  }, [whatsNewFiles, whatsNewFilter]);

  if (!isOpen) return null;

  return (
    <div
      id="git-status-modal"
      className="modal-backdrop"
      style={{ display: "flex" }}
    >
      <div
        className="modal-box"
        style={{
          maxWidth: "860px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            paddingBottom: "14px",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                className="material-symbols-outlined"
                style={{
                  color: "var(--md-sys-color-primary, #3b82f6)",
                  fontSize: "26px",
                }}
              >
                history_edu
              </span>
              <h3
                style={{
                  margin: 0,
                  fontSize: "19px",
                  fontWeight: 700,
                  color: "var(--text-heading)",
                }}
              >
                Central de Versões & Evolução
              </h3>
              <span
                className="badge badge-primary-subtle"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "14px" }}
                >
                  layers
                </span>
                Trilha: {currentBranch}
              </span>
            </div>
            <span
              className="subtitle"
              style={{
                marginTop: "5px",
                display: "block",
                color: "var(--text-muted)",
                fontSize: "12.5px",
              }}
            >
              Documentação: <strong>{activeRepo?.name || "Local"}</strong>{" "}
              {gitStatus?.remoteUrl
                ? `(${gitStatus.remoteUrl})`
                : "(Armazenamento Local)"}
            </span>
          </div>
          <button className="btn-close" aria-label="Fechar" onClick={onClose}>
            <span className="material-symbols-outlined icon-sm">close</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 20px",
            background: "var(--bg-surface-secondary, rgba(255,255,255,0.03))",
            borderBottom: "1px solid var(--border-color)",
            overflowX: "auto",
          }}
        >
          {/* Tab 1: Meus Rascunhos */}
          <button
            type="button"
            className={`btn-tab ${activeTab === "status" ? "active" : ""}`}
            onClick={() => setActiveTab("status")}
            style={{
              height: "42px",
              padding: "0 16px",
              borderRadius: "8px",
              border:
                activeTab === "status"
                  ? "1px solid var(--primary, #3b82f6)"
                  : "1px solid transparent",
              background:
                activeTab === "status"
                  ? "rgba(59, 130, 246, 0.12)"
                  : "transparent",
              color:
                activeTab === "status"
                  ? "var(--primary, #3b82f6)"
                  : "var(--text-muted)",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.15s ease",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "18px" }}
            >
              edit_note
            </span>
            <span>Meus Rascunhos</span>
            {changedFiles.length > 0 && (
              <span
                style={{
                  padding: "2px 7px",
                  borderRadius: "10px",
                  fontSize: "11px",
                  fontWeight: 700,
                  background:
                    activeTab === "status"
                      ? "var(--primary, #3b82f6)"
                      : "rgba(234, 179, 8, 0.2)",
                  color: activeTab === "status" ? "#ffffff" : "#eab308",
                }}
              >
                {changedFiles.length}
              </span>
            )}
          </button>

          {/* Tab 2: Novidades d (What's New) */}
          <button
            type="button"
            className={`btn-tab ${activeTab === "whats-new" ? "active" : ""}`}
            onClick={() => setActiveTab("whats-new")}
            style={{
              height: "42px",
              padding: "0 16px",
              borderRadius: "8px",
              border:
                activeTab === "whats-new"
                  ? "1px solid #22c55e"
                  : "1px solid transparent",
              background:
                activeTab === "whats-new"
                  ? "rgba(34, 197, 94, 0.12)"
                  : "transparent",
              color:
                activeTab === "whats-new" ? "#16a34a" : "var(--text-muted)",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              position: "relative",
              transition: "all 0.15s ease",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "18px", color: "#22c55e" }}
            >
              auto_awesome
            </span>
            <span>Novidades d</span>
            {whatsNewFiles.length > 0 && (
              <span
                style={{
                  padding: "2px 7px",
                  borderRadius: "10px",
                  fontSize: "11px",
                  fontWeight: 700,
                  background:
                    activeTab === "whats-new"
                      ? "#16a34a"
                      : "rgba(34, 197, 94, 0.2)",
                  color: activeTab === "whats-new" ? "#ffffff" : "#16a34a",
                }}
              >
                {whatsNewFiles.length}
              </span>
            )}
            {hasUnreadWhatsNew && (
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "#22c55e",
                  boxShadow: "0 0 6px #22c55e",
                  position: "absolute",
                  top: "6px",
                  right: "6px",
                }}
                title="Novidades não visualizadas!"
              />
            )}
          </button>

          {/* Tab 3: Histórico de Publicações */}
          <button
            type="button"
            className={`btn-tab ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
            style={{
              height: "42px",
              padding: "0 16px",
              borderRadius: "8px",
              border:
                activeTab === "history"
                  ? "1px solid var(--primary, #3b82f6)"
                  : "1px solid transparent",
              background:
                activeTab === "history"
                  ? "rgba(59, 130, 246, 0.12)"
                  : "transparent",
              color:
                activeTab === "history"
                  ? "var(--primary, #3b82f6)"
                  : "var(--text-muted)",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.15s ease",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "18px" }}
            >
              history
            </span>
            <span>Histórico de Publicações</span>
            <span style={{ fontSize: "11px", opacity: 0.8 }}>
              ({(gitLog || []).length})
            </span>
          </button>

          {/* Tab 4: Trilhas de Trabalho */}
          <button
            type="button"
            className={`btn-tab ${activeTab === "branches" ? "active" : ""}`}
            onClick={() => setActiveTab("branches")}
            style={{
              height: "42px",
              padding: "0 16px",
              borderRadius: "8px",
              border:
                activeTab === "branches"
                  ? "1px solid var(--primary, #3b82f6)"
                  : "1px solid transparent",
              background:
                activeTab === "branches"
                  ? "rgba(59, 130, 246, 0.12)"
                  : "transparent",
              color:
                activeTab === "branches"
                  ? "var(--primary, #3b82f6)"
                  : "var(--text-muted)",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.15s ease",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "18px" }}
            >
              alt_route
            </span>
            <span>Versões</span>
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            style={{
              margin: "12px 20px 0 20px",
              padding: "10px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 500,
              background:
                feedback.type === "success"
                  ? "rgba(34, 197, 94, 0.12)"
                  : "rgba(239, 68, 68, 0.12)",
              border: `1px solid ${feedback.type === "success" ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
              color: feedback.type === "success" ? "#16a34a" : "#dc2626",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span className="material-symbols-outlined icon-xs">
              {feedback.type === "success" ? "check_circle" : "error"}
            </span>
            {feedback.message}
          </div>
        )}

        {/* Modal Body */}
        <div
          className="modal-body"
          style={{ overflowY: "auto", flex: 1, padding: "20px", gap: "16px" }}
        >
          {/* TAB 1: MEUS RASCUNHOS & MODIFICAÇÕES LOCAIS */}
          {activeTab === "status" && (
            <GitStatusTab
              isClean={isClean}
              changedFiles={changedFiles}
              gitStatus={gitStatus}
              onRefreshAll={() => {
                if (refreshGitStatus) refreshGitStatus();
                if (refreshGitLog) refreshGitLog();
                if (refreshPendingChanges) refreshPendingChanges();
                if (refreshWhatsNew) refreshWhatsNew();
              }}
              onSync={handleSync}
              isSyncing={isSyncing}
              allAreExpanded={allAreExpanded}
              onToggleAllExpanded={allAreExpanded ? collapseAll : expandAll}
              expandedFiles={expandedFiles}
              getFileDiffInfo={getFileDiffInfo}
              onToggleFileExpand={toggleFileExpand}
              onOpenFile={handleOpenFile}
              renderDiffViewer={renderDiffViewer}
              currentBranch={currentBranch}
              commitMsg={commitMsg}
              onCommitMsgChange={setCommitMsg}
              isCommitting={isCommitting}
              onCommit={handleCommit}
            />
          )}

          {/* TAB 2: NOVIDADES D (WHAT'S NEW) */}
          {activeTab === "whats-new" && (
            <GitWhatsNewTab
              whatsNewSummary={whatsNewSummary}
              whatsNewFilter={whatsNewFilter}
              onWhatsNewFilterChange={setWhatsNewFilter}
              whatsNewFiles={whatsNewFiles}
              whatsNewProposals={whatsNewProposals}
              whatsNewCommits={whatsNewCommits}
              newFilesCount={newFilesCount}
              modFilesCount={modFilesCount}
              filteredWhatsNewFiles={filteredWhatsNewFiles}
              isSyncing={isSyncing}
              onSync={handleSync}
              onMarkAsSeen={handleMarkAsSeen}
              expandedFiles={expandedFiles}
              getFileDiffInfo={getFileDiffInfo}
              onToggleFileExpand={toggleFileExpand}
              onOpenFile={handleOpenFile}
              renderDiffViewer={renderDiffViewer}
            />
          )}

          {/* TAB 3: HISTÓRICO DE PUBLICAÇÕES */}
          {activeTab === "history" && (
            <GitHistoryTab gitLog={gitLog} />
          )}

          {/* TAB 4: TRILHAS DE TRABALHO */}
          {activeTab === "branches" && (
            <GitBranchesTab
              currentBranch={currentBranch}
              newBranchName={newBranchName}
              onNewBranchNameChange={setNewBranchName}
              onCreateBranch={handleCreateBranch}
            />
          )}
        </div>

        {/* Modal Footer */}
        <div
          className="modal-footer"
          style={{ display: "flex", justifyContent: "flex-end" }}
        >
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

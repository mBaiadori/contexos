import React from "react";
import { FolderGit2 } from "lucide-react";
import { Card, Button, Badge } from "../../../../components/ui";
import type { PR } from "../../../../types";
import { isSystemPath, isPathHidden } from "../../../../utils/hidden-files";
import { formatPRDate, renderMarkdownDescription, cleanSemanticTitle } from "../utils/prFormatters";
import { PRFileList } from "./PRFileList";
import type {
  MergeabilityInfo,
  PRFileDiffData,
  ActionLoadingState,
  ActionFeedbackState,
} from "../types";

interface PRCardProps {
  pr: PR;
  user: any;
  providerLabel: string;
  projectConfig: any;
  isExpanded: boolean;
  toggleExpand: (id: number | string, pr: PR) => void;
  mergeabilityMap: Record<string | number, MergeabilityInfo>;
  handleOpenConflictResolution: (pr: PR, path: string) => void;
  syncingFromBase: Record<string | number, boolean>;
  handleUpdateFromBase: (pr: PR) => void;
  actionFeedback: ActionFeedbackState | null;
  actionLoading: ActionLoadingState | null;
  setRollbackTarget: (pr: PR) => void;
  handleReject: (id: number | string, repo?: string) => void;
  handleOpenApproveModal: (pr: PR) => void;
  handleMerge: (id: number | string, repo?: string) => void;
  collapsedFiles: Record<string, boolean>;
  toggleFileCollapse: (key: string) => void;
  handleExpandAllFiles: (prId: number | string, files: any[]) => void;
  handleCollapseAllFiles: (prId: number | string, files: any[]) => void;
  fileDiffsData: Record<string, PRFileDiffData>;
  fileDiffsCache: Record<string, string>;
  loadingDiffs: Record<string, boolean>;
  handleEditDocumentInPR: (pr: PR, path: string) => void;
}

export const PRCard: React.FC<PRCardProps> = ({
  pr,
  user,
  providerLabel,
  projectConfig,
  isExpanded,
  toggleExpand,
  mergeabilityMap,
  handleOpenConflictResolution,
  syncingFromBase,
  handleUpdateFromBase,
  actionFeedback,
  actionLoading,
  setRollbackTarget,
  handleReject,
  handleOpenApproveModal,
  handleMerge,
  collapsedFiles,
  toggleFileCollapse,
  handleExpandAllFiles,
  handleCollapseAllFiles,
  fileDiffsData,
  fileDiffsCache,
  loadingDiffs,
  handleEditDocumentInPR,
}) => {
  const statusLower = (pr.status || "").toLowerCase();
  const isMerged = statusLower === "merged";
  const isClosed = statusLower === "closed";
  const isOpen = !isMerged && !isClosed;
  const rawFiles = Array.isArray(pr.files) ? pr.files : [];
  const prFiles = rawFiles.filter(
    (f: any) =>
      f?.path && !isSystemPath(f.path) && !isPathHidden(f.path),
  );
  const systemFilesCount = rawFiles.length - prFiles.length;
  const isDirectCommit = !!pr.is_direct_commit;

  const statusBadgeText =
    isDirectCommit || isMerged
      ? "VERSÃO PUBLICADA"
      : isClosed
        ? "ARQUIVADA"
        : "EM REVISÃO";

  const revisionId =
    pr.short_id ||
    (pr.commit_hash ? pr.commit_hash.slice(0, 7) : pr.id);

  const currentUserHandle = user?.login
    ? `@${user.login}`
    : "@tech-lead";
  const isAuthor =
    (pr.author || "").replace(/^@/, "").toLowerCase() ===
    currentUserHandle.replace(/^@/, "").toLowerCase();
  const isSolo =
    pr.is_solo_mode !== undefined
      ? pr.is_solo_mode
      : (projectConfig?.governance_rules?.is_solo ?? true);
  const minApprovals = isSolo
    ? 1
    : pr.min_approvals ||
      (projectConfig?.governance_rules?.min_approvals_default ?? 1);
  const approvalsList = Array.isArray(pr.approvals)
    ? pr.approvals
    : [];
  const validApprovals = approvalsList.filter((app: any) => {
    const u = typeof app === "string" ? app : app.user;
    return (
      isSolo ||
      (u || "").replace(/^@/, "").toLowerCase() !==
        (pr.author || "").replace(/^@/, "").toLowerCase()
    );
  });
  const hasCurrentUserApproved = approvalsList.some((app: any) => {
    const u = typeof app === "string" ? app : app.user;
    return (
      (u || "").replace(/^@/, "").toLowerCase() ===
      currentUserHandle.replace(/^@/, "").toLowerCase()
    );
  });
  const quorumMet = isSolo
    ? approvalsList.length >= 1
    : validApprovals.length >= minApprovals;

  return (
    <Card
      key={pr.id}
      variant="elevated"
      padding="none"
      style={{
        overflow: "hidden",
        border: isExpanded
          ? "1px solid var(--md-sys-color-primary, #3b82f6)"
          : "1px solid var(--md-sys-color-outline-variant, #dadce0)",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
      }}
    >
      {/* Collapsed / Summary Header (Always Visible & Interactive) */}
      <div
        onClick={() => toggleExpand(pr.id, pr)}
        style={{
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "14px",
          cursor: "pointer",
          userSelect: "none",
          background: isExpanded
            ? "var(--md-sys-color-surface-container-low, #f8f9fa)"
            : "transparent",
          borderBottom: isExpanded
            ? "1px solid var(--md-sys-color-outline-variant, #dadce0)"
            : "none",
          transition: "background-color 0.15s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            minWidth: 0,
            flex: 1,
          }}
        >
          {/* Status Icon */}
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                isDirectCommit || isMerged
                  ? "var(--color-primary-subtle, #e0f2fe)"
                  : isClosed
                    ? "var(--color-danger-subtle, #fef2f2)"
                    : "var(--color-success-subtle, #f0fdf4)",
              color:
                isDirectCommit || isMerged
                  ? "var(--md-sys-color-primary, #0284c7)"
                  : isClosed
                    ? "var(--color-danger, #ef4444)"
                    : "var(--color-success, #16a34a)",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "22px" }}
            >
              {isDirectCommit || isMerged
                ? "check_circle"
                : isClosed
                  ? "cancel"
                  : "rate_review"}
            </span>
          </div>

          {/* Title & Metadata */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              <Badge variant="primary" size="sm">
                {isDirectCommit || isMerged ? `Versão #${revisionId}` : `Proposta #${pr.id}`}
              </Badge>
              <span
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "var(--color-text-primary, #0f172a)",
                  letterSpacing: "-0.01em",
                }}
              >
                {cleanSemanticTitle(pr.title)}
              </span>
              {pr.repo_name && (
                <Badge
                  variant="neutral"
                  size="sm"
                  title={`Repositório: ${pr.repo_name}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    backgroundColor:
                      "var(--md-sys-color-surface-container-high, #e8eaed)",
                    color:
                      "var(--md-sys-color-on-surface, #202124)",
                    borderColor:
                      "var(--md-sys-color-outline-variant, #dadce0)",
                  }}
                >
                  <FolderGit2 size={11} style={{ flexShrink: 0 }} />
                  {pr.repo_name}
                </Badge>
              )}
              {pr.github_number && (
                <Badge
                  variant="neutral"
                  size="sm"
                  title={`Sincronizado com ${providerLabel}`}
                >
                  {providerLabel} #{pr.github_number}
                </Badge>
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginTop: "4px",
                fontSize: "12.5px",
                color:
                  "var(--md-sys-color-on-surface-variant, #64748b)",
                flexWrap: "wrap",
              }}
            >
              <span>
                Autor:{" "}
                <strong
                  style={{
                    color:
                      "var(--md-sys-color-on-surface, #0f172a)",
                  }}
                >
                  {pr.author || "Equipe"}
                </strong>
              </span>
              <span>&bull;</span>
              <span>{formatPRDate(pr.created_at)}</span>
              <span>&bull;</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                title={
                  systemFilesCount > 0
                    ? `Dos ${rawFiles.length} arquivos editados no total, ${systemFilesCount} ${systemFilesCount === 1 ? "é arquivo" : "são arquivos"} de sistema (ocultos).`
                    : `${prFiles.length} ${prFiles.length === 1 ? "arquivo alterado" : "arquivos alterados"}`
                }
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "14px" }}
                >
                  description
                </span>
                {prFiles.length}{" "}
                {prFiles.length === 1 ? "documento" : "documentos"}
                {systemFilesCount > 0 && (
                  <span
                    style={{
                      opacity: 0.8,
                      fontSize: "11.5px",
                      fontWeight: 400,
                    }}
                  >
                    ({systemFilesCount} de sistema)
                  </span>
                )}
              </span>

              {/* Quorum indicator only for active/open reviews */}
              {isOpen && (
                <>
                  <span>&bull;</span>
                  <Badge
                    variant={quorumMet ? "success" : "warning"}
                    size="sm"
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: "13px",
                        marginRight: "3px",
                      }}
                    >
                      {quorumMet ? "verified" : "pending_actions"}
                    </span>
                    {quorumMet
                      ? `Quórum Atingido (${validApprovals.length}/${minApprovals})`
                      : `Aprovações (${validApprovals.length}/${minApprovals})`}
                  </Badge>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Status Badge & Chevron / Details Button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexShrink: 0,
          }}
        >
          <Badge
            variant={
              isMerged || isDirectCommit
                ? "info"
                : isClosed
                  ? "danger"
                  : "success"
            }
            size="md"
          >
            {statusBadgeText}
          </Badge>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(pr.id, pr);
            }}
            icon={
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: "18px",
                  transition: "transform 0.2s ease",
                  transform: isExpanded
                    ? "rotate(180deg)"
                    : "rotate(0deg)",
                }}
              >
                expand_more
              </span>
            }
          >
            {isExpanded ? "Recolher" : "Detalhes"}
          </Button>
        </div>
      </div>

      {/* Expanded Details Body */}
      {isExpanded && (
        <div
          style={{
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          {/* PR Description with Rich Markdown Rendering */}
          {pr.description && (
            <div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--color-text-secondary, #475569)",
                  marginBottom: "6px",
                }}
              >
                Descrição da Proposta:
              </div>
              <div
                style={{
                  background:
                    "var(--md-sys-color-surface-container-low, #f8f9fa)",
                  padding: "14px 16px",
                  borderRadius: "10px",
                  border:
                    "1px solid var(--md-sys-color-outline-variant, #dadce0)",
                }}
              >
                {renderMarkdownDescription(pr.description)}
              </div>
            </div>
          )}

          {/* Mergeability & Conflict Banner */}
          {isOpen && mergeabilityMap[pr.id] && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              {mergeabilityMap[pr.id].conflicts.length > 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    borderRadius: "8px",
                    background:
                      "var(--color-danger-subtle, #fef2f2)",
                    border:
                      "1px solid var(--color-border-subtle, #fecaca)",
                    color: "var(--color-danger, #991b1b)",
                    fontSize: "13px",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: "20px",
                        color: "var(--color-danger, #ef4444)",
                      }}
                    >
                      warning
                    </span>
                    <div>
                      <strong>
                        Divergências concorrentes detectadas:
                      </strong>{" "}
                      Esta proposta possui{" "}
                      {mergeabilityMap[pr.id].conflicts.length}{" "}
                      documento(s) com edições simultâneas em relação à versão oficial.
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                      flexWrap: "wrap",
                    }}
                  >
                    {mergeabilityMap[pr.id].conflicts.map(
                      (conf, cIdx) => (
                        <Button
                          key={cIdx}
                          type="button"
                          size="xs"
                          variant="danger"
                          onClick={() =>
                            handleOpenConflictResolution(
                              pr,
                              conf.path,
                            )
                          }
                          icon={
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: "14px" }}
                            >
                              build
                            </span>
                          }
                        >
                          Resolver {conf.path.split("/").pop()}
                        </Button>
                      ),
                    )}
                  </div>
                </div>
              ) : mergeabilityMap[pr.id].behind_by > 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background:
                      "var(--color-primary-subtle, #f0f9ff)",
                    border:
                      "1px solid var(--color-border-subtle, #bae6fd)",
                    color: "var(--md-sys-color-primary, #0369a1)",
                    fontSize: "13px",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "18px" }}
                    >
                      sync
                    </span>
                    <span>
                      Esta proposta possui{" "}
                      <strong>
                        {mergeabilityMap[pr.id].behind_by}
                      </strong>{" "}
                      atualização(ões) de diferença em relação à Versão Oficial.
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="xs"
                    variant="tonal"
                    loading={syncingFromBase[pr.id]}
                    onClick={() => handleUpdateFromBase(pr)}
                    icon={
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: "14px" }}
                      >
                        update
                      </span>
                    }
                  >
                    Sincronizar com a Oficial
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          {/* Quorum & Approvals Section */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              background:
                "var(--md-sys-color-surface-container-lowest, #f8f9fa)",
              padding: "12px 14px",
              borderRadius: "8px",
              border:
                "1px solid var(--md-sys-color-outline-variant, #e8eaed)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <span
                style={{
                  color: "var(--md-sys-color-on-surface, #0f172a)",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "13px",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "17px",
                    color: "var(--md-sys-color-primary, #1a73e8)",
                  }}
                >
                  verified_user
                </span>
                Trilha de Auditoria & Pareceres:
              </span>

              {isOpen && (
                <Badge
                  variant={quorumMet ? "success" : "warning"}
                  size="sm"
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "14px", marginRight: "3px" }}
                  >
                    {quorumMet ? "verified" : "pending_actions"}
                  </span>
                  {quorumMet
                    ? `✓ Quórum Atingido (${validApprovals.length}/${minApprovals}) • Liberado para Publicação`
                    : `Quórum Pendente (${validApprovals.length}/${minApprovals} aprovações necessárias)`}
                </Badge>
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              {approvalsList.length > 0 ? (
                approvalsList.map((app: any, idx: number) => {
                  const isInvalidated =
                    typeof app === "object" &&
                    app.status === "INVALIDATED";
                  const appUser =
                    typeof app === "string" ? app : app.user;
                  const appRole =
                    typeof app === "object" ? app.role : null;
                  const appHash =
                    typeof app === "object" && app.commit_hash
                      ? app.commit_hash.slice(0, 7)
                      : null;
                  const appDate =
                    typeof app === "object" && app.timestamp
                      ? formatPRDate(app.timestamp)
                      : null;
                  const appComment =
                    typeof app === "object" ? app.comment : null;

                  if (isInvalidated) {
                    return (
                      <div
                        key={idx}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          background:
                            "var(--md-sys-color-surface-container-high, #f1f5f9)",
                          border:
                            "1px dashed var(--color-border-subtle, #cbd5e1)",
                          color: "var(--color-text-muted, #64748b)",
                          fontSize: "12px",
                        }}
                        title={
                          appComment ||
                          "Aprovação invalidada devido a novas edições no PR."
                        }
                      >
                        <span
                          className="material-symbols-outlined"
                          style={{
                            fontSize: "15px",
                            color: "var(--color-warning, #f59e0b)",
                          }}
                        >
                          history_toggle_off
                        </span>
                        <span
                          style={{ textDecoration: "line-through" }}
                        >
                          {appUser}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            opacity: 0.85,
                            color: "var(--color-warning, #d97706)",
                            fontWeight: 600,
                          }}
                        >
                          (Invalidada por edições)
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={idx}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 10px",
                        borderRadius: "6px",
                        background:
                          "var(--color-success-subtle, #f0fdf4)",
                        border:
                          "1px solid var(--color-border-subtle, #bbf7d0)",
                        color: "var(--color-success, #166534)",
                        fontSize: "12px",
                      }}
                      title={
                        appComment
                          ? `Comentário de Auditoria: "${appComment}"`
                          : undefined
                      }
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{
                          fontSize: "15px",
                          color: "var(--color-success, #16a34a)",
                        }}
                      >
                        check_circle
                      </span>
                      <strong>{appUser}</strong>
                      {appRole && (
                        <span
                          style={{
                            opacity: 0.85,
                            fontSize: "11px",
                          }}
                        >
                          ({appRole})
                        </span>
                      )}
                      {appHash && (
                        <span
                          style={{
                            fontFamily: "var(--font-family-mono)",
                            fontSize: "10.5px",
                            background: "rgba(0,0,0,0.06)",
                            padding: "1px 4px",
                            borderRadius: "3px",
                          }}
                        >
                          #{appHash}
                        </span>
                      )}
                      {appDate && (
                        <span
                          style={{
                            opacity: 0.7,
                            fontSize: "10.5px",
                          }}
                        >
                          &bull; {appDate}
                        </span>
                      )}
                    </div>
                  );
                })
              ) : isMerged || isDirectCommit ? (
                <Badge variant="success" size="sm">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "14px", marginRight: "3px" }}
                  >
                    verified
                  </span>
                  Aprovado e integrado na versão oficial
                </Badge>
              ) : (
                <Badge variant="neutral" size="sm">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "14px", marginRight: "3px" }}
                  >
                    hourglass_top
                  </span>
                  Aguardando aprovação de revisores (0/{minApprovals})
                </Badge>
              )}
            </div>
          </div>

          {/* Feedback Message */}
          {actionFeedback && actionFeedback.id === pr.id && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                background:
                  actionFeedback.type === "success"
                    ? "var(--color-success-subtle, #f0fdf4)"
                    : "var(--color-danger-subtle, #fef2f2)",
                color:
                  actionFeedback.type === "success"
                    ? "var(--color-success, #166534)"
                    : "var(--color-danger, #991b1b)",
                border: `1px solid ${actionFeedback.type === "success" ? "var(--color-border-subtle, #bbf7d0)" : "var(--color-border-subtle, #fecaca)"}`,
              }}
            >
              {actionFeedback.message}
            </div>
          )}

          {/* Files List Component */}
          <PRFileList
            pr={pr}
            isOpen={isOpen}
            prFiles={prFiles}
            rawFiles={rawFiles}
            systemFilesCount={systemFilesCount}
            collapsedFiles={collapsedFiles}
            toggleFileCollapse={toggleFileCollapse}
            handleExpandAllFiles={handleExpandAllFiles}
            handleCollapseAllFiles={handleCollapseAllFiles}
            fileDiffsData={fileDiffsData}
            fileDiffsCache={fileDiffsCache}
            loadingDiffs={loadingDiffs}
            handleEditDocumentInPR={handleEditDocumentInPR}
          />

          {/* Actions Bottom Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
              paddingTop: "14px",
              borderTop:
                "1px solid var(--md-sys-color-outline-variant, #dadce0)",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                color: "var(--color-text-muted, #64748b)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>
                {isMerged || isDirectCommit ? "Versão Oficial integrada" : `Proposta #${pr.id} → Destino: Versão Oficial`}
              </span>
            </div>

            <div
              className="ui-row ui-row--align-center ui-row--xs"
              style={{ flexWrap: "wrap" }}
            >
              {/* Rollback button only for merged PRs */}
              {isMerged && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setRollbackTarget(pr)}
                  disabled={actionLoading?.id === pr.id}
                  icon={
                    <span className="material-symbols-outlined icon-xs">
                      history
                    </span>
                  }
                  title="Restaurar o estado desta revisão como a versão ativa atual"
                >
                  Restaurar esta Versão
                </Button>
              )}

              {/* Open PR actions */}
              {isOpen && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    style={{
                      color: "var(--color-danger, #ef4444)",
                    }}
                    onClick={() =>
                      handleReject(pr.id, pr.repo_name)
                    }
                    disabled={actionLoading?.id === pr.id}
                    icon={
                      <span className="material-symbols-outlined icon-xs">
                        {actionLoading?.id === pr.id &&
                        actionLoading.action === "reject"
                          ? "progress_activity"
                          : "close"}
                      </span>
                    }
                    title="Rejeitar e arquivar esta proposta"
                  >
                    {actionLoading?.id === pr.id &&
                    actionLoading.action === "reject"
                      ? "Rejeitando..."
                      : "Rejeitar"}
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenApproveModal(pr)}
                    disabled={
                      actionLoading?.id === pr.id ||
                      (!isSolo && isAuthor)
                    }
                    icon={
                      <span className="material-symbols-outlined icon-xs">
                        {actionLoading?.id === pr.id &&
                        actionLoading.action === "approve"
                          ? "progress_activity"
                          : hasCurrentUserApproved
                            ? "verified"
                            : "thumb_up"}
                      </span>
                    }
                    title={
                      !isSolo && isAuthor
                        ? "O autor da proposta não pode aprovar o seu próprio PR no Modo Equipe."
                        : hasCurrentUserApproved
                          ? "Você já registrou aprovação nesta proposta. Clique para atualizar seu comentário ou papel."
                          : isSolo
                            ? "Registrar aprovação nesta revisão (Modo Solo ativo)"
                            : "Registrar parecer e aprovação oficial nesta revisão"
                    }
                  >
                    {actionLoading?.id === pr.id &&
                    actionLoading.action === "approve"
                      ? "Aprovando..."
                      : hasCurrentUserApproved
                        ? `✓ Aprovado por você (${validApprovals.length}/${minApprovals})`
                        : `Aprovar Revisão (${validApprovals.length}/${minApprovals})`}
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleMerge(pr.id, pr.repo_name)}
                    disabled={
                      actionLoading?.id === pr.id || !quorumMet
                    }
                    icon={
                      <span className="material-symbols-outlined icon-xs">
                        {actionLoading?.id === pr.id &&
                        actionLoading.action === "merge"
                          ? "progress_activity"
                          : "publish"}
                      </span>
                    }
                    title={
                      !quorumMet
                        ? isSolo
                        : "Quórum atingido! Integrar e publicar alterações na versão oficial."
                    }
                  >
                    {actionLoading?.id === pr.id &&
                    actionLoading.action === "merge"
                      ? "Publicando..."
                      : quorumMet
                        ? "Publicar Versão Oficial"
                        : `Publicar (${validApprovals.length}/${minApprovals})`}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

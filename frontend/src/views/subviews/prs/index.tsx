import React, { useState } from "react";
import { PageContainer, PageBody, Card } from "../../../components/ui";
import { MergeConflictResolutionModal } from "../../../components/modals/MergeConflictResolutionModal";
import { CreatePublicationModal } from "../../../components/modals/CreatePublicationModal";
import { useWorkspace } from "../../../context/WorkspaceContext";
import { usePRsData } from "./hooks/usePRsData";
import { PRsHeader } from "./components/PRsHeader";
import { PRFilters } from "./components/PRFilters";
import { PRCard } from "./components/PRCard";
import { PRRollbackModal } from "./components/PRRollbackModal";
import { PRPagination } from "./components/PRPagination";
import type { PRsSubViewProps } from "./types";

export const PRsSubView: React.FC<PRsSubViewProps> = () => {
  const prsData = usePRsData();
  const { activeRepo, versionGraph, refreshVersionGraph, refreshGitStatus } = useWorkspace();
  const [isNewPubOpen, setIsNewPubOpen] = useState(false);

  return (
    <PageContainer id="prs-subview">
      {/* Header */}
      <PRsHeader
        selectedRepoFilter={prsData.selectedRepoFilter}
        setSelectedRepoFilter={prsData.setSelectedRepoFilter}
        repoOpenCounts={prsData.repoOpenCounts}
        isLoading={prsData.isLoading}
        loadPRs={prsData.loadPRs}
        providerLabel={prsData.providerLabel}
        onNewPublication={() => {
          refreshVersionGraph?.();
          setIsNewPubOpen(true);
        }}
      />

      <PageBody>
        <div
          style={{
            maxWidth: "1200px",
            width: "100%",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          {/* Status & Search Filters Bar */}
          <PRFilters
            activeStatus={prsData.activeStatus}
            setActiveStatus={prsData.setActiveStatus}
            searchQuery={prsData.searchQuery}
            setSearchQuery={prsData.setSearchQuery}
            countAll={prsData.countAll}
            countOpen={prsData.countOpen}
            countMerged={prsData.countMerged}
            countClosed={prsData.countClosed}
          />

          {/* Feedback Global Banner */}
          {prsData.actionFeedback && !prsData.actionFeedback.id && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                background:
                  prsData.actionFeedback.type === "success"
                    ? "var(--color-success-subtle, #f0fdf4)"
                    : "var(--color-danger-subtle, #fef2f2)",
                color:
                  prsData.actionFeedback.type === "success"
                    ? "var(--color-success, #166534)"
                    : "var(--color-danger, #991b1b)",
                border: `1px solid ${
                  prsData.actionFeedback.type === "success"
                    ? "var(--color-border-subtle, #bbf7d0)"
                    : "var(--color-border-subtle, #fecaca)"
                }`,
              }}
            >
              {prsData.actionFeedback.message}
            </div>
          )}

          {/* PRs List */}
          {prsData.isLoading ? (
            <Card variant="elevated" padding="xl" style={{ textAlign: "center" }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "36px",
                    color: "var(--md-sys-color-primary, #1a73e8)",
                    animation: "spin 1s linear infinite",
                  }}
                >
                  progress_activity
                </span>
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "var(--color-text-secondary, #475569)",
                  }}
                >
                  Carregando revisões e propostas do repositório...
                </span>
              </div>
            </Card>
          ) : prsData.filteredPRs.length === 0 ? (
            <Card variant="elevated" padding="xl" style={{ textAlign: "center" }}>
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: "44px",
                  color: "var(--color-text-muted, #94a3b8)",
                  marginBottom: "12px",
                }}
              >
                inbox
              </span>
              <h4 className="ui-heading-3" style={{ margin: 0 }}>
                Nenhuma proposta de revisão encontrada
              </h4>
              <p
                className="ui-text-muted"
                style={{
                  margin: "6px 0 0 0",
                  fontSize: "13.5px",
                }}
              >
                {prsData.searchQuery
                  ? "Tente refinar os termos da sua busca."
                  : "Não há registros com o filtro atual neste repositório."}
              </p>
            </Card>
          ) : (
            <>
              {prsData.filteredPRs.map((pr) => (
                <PRCard
                  key={pr.id}
                  pr={pr}
                  user={prsData.user}
                  providerLabel={prsData.providerLabel}
                  projectConfig={prsData.projectConfig}
                  isExpanded={!!prsData.expandedPRs[pr.id]}
                  toggleExpand={prsData.toggleExpand}
                  mergeabilityMap={prsData.mergeabilityMap}
                  handleOpenConflictResolution={prsData.handleOpenConflictResolution}
                  syncingFromBase={prsData.syncingFromBase}
                  handleUpdateFromBase={prsData.handleUpdateFromBase}
                  actionFeedback={prsData.actionFeedback}
                  actionLoading={prsData.actionLoading}
                  setRollbackTarget={prsData.setRollbackTarget}
                  handleReject={prsData.handleReject}
                  handleMerge={prsData.handleMerge}
                  collapsedFiles={prsData.collapsedFiles}
                  toggleFileCollapse={prsData.toggleFileCollapse}
                  handleExpandAllFiles={prsData.handleExpandAllFiles}
                  handleCollapseAllFiles={prsData.handleCollapseAllFiles}
                  fileDiffsData={prsData.fileDiffsData}
                  fileDiffsCache={prsData.fileDiffsCache}
                  loadingDiffs={prsData.loadingDiffs}
                  handleEditDocumentInPR={prsData.handleEditDocumentInPR}
                />
              ))}

              {/* Controles de Paginação */}
              <PRPagination
                currentPage={prsData.page}
                totalPages={prsData.totalPages}
                totalItems={prsData.totalItems}
                pageSize={prsData.pageSize}
                onPageChange={prsData.handlePageChange}
                onPageSizeChange={prsData.handlePageSizeChange}
                isLoading={prsData.isLoading}
              />
            </>
          )}
        </div>
      </PageBody>

      <CreatePublicationModal
        isOpen={isNewPubOpen}
        onClose={() => setIsNewPubOpen(false)}
        repoName={
          prsData.selectedRepoFilter !== "all"
            ? prsData.selectedRepoFilter
            : activeRepo?.name
        }
        nodes={versionGraph?.nodes || []}
        defaultBranch={versionGraph?.defaultBranch || activeRepo?.default_branch || "main"}
        onCreated={async () => {
          await prsData.loadPRs();
          await refreshVersionGraph?.();
          await refreshGitStatus?.();
        }}
      />

      {/* Rollback Confirmation Modal */}
      <PRRollbackModal
        rollbackTarget={prsData.rollbackTarget}
        onClose={() => prsData.setRollbackTarget(null)}
        handleRollback={prsData.handleRollback}
        actionLoading={prsData.actionLoading}
      />

      {/* Conflict Resolution Modal */}
      {prsData.activeConflictPR && prsData.activeConflictPR.bundle && (
        <MergeConflictResolutionModal
          isOpen={true}
          onClose={() => prsData.setActiveConflictPR(null)}
          filePath={prsData.activeConflictPR.filePath}
          content={
            prsData.activeConflictPR.bundle.merged ||
            (prsData.activeConflictPR.bundle.mergedContent as string | undefined) ||
            ""
          }
          onSaveResolved={prsData.handleSaveConflictResolution}
        />
      )}
    </PageContainer>
  );
};

export default PRsSubView;
export * from "./types";
export * from "./utils/prFormatters";

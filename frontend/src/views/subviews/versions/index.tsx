import React from "react";
import { PageContainer, PageBody, AlertBanner } from "../../../components/ui";
import { useVersionsData } from "./hooks/useVersionsData";
import { VersionsHeader } from "./components/VersionsHeader";
import { WhatsNewTab } from "./components/WhatsNewTab";
import { DraftsTab } from "./components/DraftsTab";
import { SystemDraftsTab } from "./components/SystemDraftsTab";
import { ProposalModal } from "./components/ProposalModal";
import type { VersionsSubViewProps } from "./types";

export const VersionsSubView: React.FC<VersionsSubViewProps> = ({
  onOpenFile,
  onOpenDiffModal: _onOpenDiffModal,
}) => {
  const versions = useVersionsData(onOpenFile);

  return (
    <PageContainer id="versions-subview">
      {/* Pinned Top Header & Tab Navigation Bar */}
      <VersionsHeader
        selectedRepoFilter={versions.selectedRepoFilter}
        setSelectedRepoFilter={versions.setSelectedRepoFilter}
        loadAllEdits={versions.loadAllEdits}
        repoEditsCounts={versions.repoEditsCounts}
        openProposalModalWithRepo={versions.openProposalModalWithRepo}
        refreshGitStatus={versions.refreshGitStatus}
        refreshPendingChanges={versions.refreshPendingChanges}
        refreshWhatsNew={versions.refreshWhatsNew}
        isLoadingChanges={versions.isLoadingChanges}
        handleSync={versions.handleSync}
        isSyncing={versions.isSyncing}
        providerLabel={versions.providerLabel}
        activeTab={versions.activeTab}
        handleTabChange={versions.handleTabChange}
        whatsNewFilesCount={versions.whatsNewFiles.length}
        changedFilesCount={versions.changedFiles.length}
        systemFilesCount={versions.allSystemDraftFiles.length}
      />

      {/* Main Content Area */}
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
          {/* Feedback Alert */}
          {versions.feedback && (
            <AlertBanner
              type={versions.feedback.type === "success" ? "success" : "error"}
              message={versions.feedback.message}
              onClose={() => versions.setFeedback(null)}
            />
          )}

          {/* TAB 1: NOVIDADES DA EQUIPE */}
          {versions.activeTab === "whats-new" && (
            <WhatsNewTab
              whatsNewSummary={versions.whatsNewSummary}
              handleSync={versions.handleSync}
              isSyncing={versions.isSyncing}
              handleMarkAsSeen={versions.handleMarkAsSeen}
              whatsNewFilter={versions.whatsNewFilter}
              setWhatsNewFilter={versions.setWhatsNewFilter}
              whatsNewFiles={versions.whatsNewFiles}
              newFilesCount={versions.newFilesCount}
              modFilesCount={versions.modFilesCount}
              whatsNewProposals={versions.whatsNewProposals}
              isWhatsNewProposalsExpanded={versions.isWhatsNewProposalsExpanded}
              setIsWhatsNewProposalsExpanded={versions.setIsWhatsNewProposalsExpanded}
              selectedRepoFilter={versions.selectedRepoFilter}
              activeRepoName={versions.activeRepo?.name}
              filteredWhatsNewFiles={versions.filteredWhatsNewFiles}
              expandedWhatsNewFiles={versions.expandedWhatsNewFiles}
              toggleAllWhatsNewFiles={versions.toggleAllWhatsNewFiles}
              toggleWhatsNewFile={versions.toggleWhatsNewFile}
              whatsNewDiffs={versions.whatsNewDiffs}
              loadingWhatsNewDiffs={versions.loadingWhatsNewDiffs}
              handleOpenFileClick={versions.handleOpenFileClick}
              whatsNewCommits={versions.whatsNewCommits}
              isWhatsNewCommitsExpanded={versions.isWhatsNewCommitsExpanded}
              setIsWhatsNewCommitsExpanded={versions.setIsWhatsNewCommitsExpanded}
            />
          )}

          {/* TAB 2: MINHAS EDIÇÕES & RASCUNHOS */}
          {versions.activeTab === "drafts" && (
            <DraftsTab
              allDraftFiles={versions.allDraftFiles}
              selectedRepoFilter={versions.selectedRepoFilter}
              handleDiscardAll={versions.handleDiscardAll}
              toggleAllDraftFiles={versions.toggleAllDraftFiles}
              expandedDraftFiles={versions.expandedDraftFiles}
              toggleDraftFile={versions.toggleDraftFile}
              getDraftDiffInfo={versions.getDraftDiffInfo}
              loadingDraftDiffs={versions.loadingDraftDiffs}
              handleOpenFileClick={versions.handleOpenFileClick}
              handleDiscard={versions.handleDiscard}
              handleCreateProposal={versions.handleCreateProposal}
              handleGenerateSummaryAI={versions.handleGenerateSummaryAI}
              isGeneratingAI={versions.isGeneratingAI}
              isClean={versions.isClean}
              prTitle={versions.prTitle}
              setPrTitle={versions.setPrTitle}
              prDescription={versions.prDescription}
              setPrDescription={versions.setPrDescription}
              isCreatingPR={versions.isCreatingPR}
            />
          )}

          {/* TAB 3: SISTEMA & TEMPLATES */}
          {versions.activeTab === "system" && (
            <SystemDraftsTab
              allSystemDraftFiles={versions.allSystemDraftFiles}
              toggleAllSystemFiles={versions.toggleAllSystemFiles}
              expandedSystemFiles={versions.expandedSystemFiles}
              toggleSystemFile={versions.toggleSystemFile}
              systemDiffs={versions.systemDiffs}
              loadingSystemDiffs={versions.loadingSystemDiffs}
              handleDiscard={versions.handleDiscard}
            />
          )}
        </div>
      </PageBody>

      {/* Modal: Propor Alterações & Seleção de Repositório */}
      <ProposalModal
        isOpen={versions.isProposalModalOpen}
        onClose={() => versions.setIsProposalModalOpen(false)}
        modalTargetRepo={versions.modalTargetRepo}
        setModalTargetRepo={versions.setModalTargetRepo}
        repos={versions.repos}
        activeRepo={versions.activeRepo}
        repoEditsCounts={versions.repoEditsCounts}
        modalDraftFiles={versions.modalDraftFiles}
        expandedDraftFiles={versions.expandedDraftFiles}
        loadingDraftDiffs={versions.loadingDraftDiffs}
        getDraftDiffInfo={versions.getDraftDiffInfo}
        toggleDraftFile={versions.toggleDraftFile}
        handleDiscard={versions.handleDiscard}
        handleDiscardAll={versions.handleDiscardAll}
        handleCreateProposal={versions.handleCreateProposal}
        handleGenerateSummaryAI={versions.handleGenerateSummaryAI}
        isGeneratingAI={versions.isGeneratingAI}
        isCreatingPR={versions.isCreatingPR}
        prTitle={versions.prTitle}
        setPrTitle={versions.setPrTitle}
        prDescription={versions.prDescription}
        setPrDescription={versions.setPrDescription}
      />
    </PageContainer>
  );
};

export default VersionsSubView;
export * from "./types";

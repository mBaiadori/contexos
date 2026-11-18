import React from "react";
import {
  Sparkles,
  FileEdit,
  RefreshCw,
  CloudUpload,
} from "lucide-react";
import { PageHeader, Row, Button, Tabs } from "../../../../components/ui";
import { RepoSelectorDropdown } from "../../../../components/layout/RepoSelectorDropdown";
import type { TabType } from "../types";

interface VersionsHeaderProps {
  selectedRepoFilter: string;
  setSelectedRepoFilter: (val: string) => void;
  loadAllEdits: (repo?: string) => void;
  repoEditsCounts: Record<string, number>;
  openProposalModalWithRepo: () => void;
  refreshGitStatus?: (repo?: string) => Promise<any> | void;
  refreshPendingChanges?: (repo?: string) => Promise<any> | void;
  refreshWhatsNew?: () => Promise<any> | void;
  isLoadingChanges: boolean;
  handleSync: () => void;
  isSyncing: boolean;
  providerLabel: string;
  activeTab: TabType;
  handleTabChange: (newTab: TabType) => void;
  whatsNewFilesCount: number;
  changedFilesCount: number;
}

export const VersionsHeader: React.FC<VersionsHeaderProps> = ({
  selectedRepoFilter,
  setSelectedRepoFilter,
  loadAllEdits,
  repoEditsCounts,
  openProposalModalWithRepo,
  refreshGitStatus,
  refreshPendingChanges,
  refreshWhatsNew,
  isLoadingChanges,
  handleSync,
  isSyncing,
  providerLabel,
  activeTab,
  handleTabChange,
  whatsNewFilesCount,
  changedFilesCount,
}) => {
  return (
    <PageHeader
      title="Central de Edições"
      subtitle={
        <Row
          gap="sm"
          align="center"
          style={{ marginTop: "4px", flexWrap: "wrap" }}
        >
          <RepoSelectorDropdown
            value={selectedRepoFilter}
            onChange={(val) => {
              setSelectedRepoFilter(val);
              loadAllEdits(val);
            }}
            repoOpenCounts={repoEditsCounts}
            allowAll={true}
          />
        </Row>
      }
      icon={
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            background: "var(--md-sys-color-primary-container, #e8f0fe)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--md-sys-color-primary, #1a73e8)",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "24px" }}
          >
            history_edu
          </span>
        </div>
      }
      actions={
        <Row gap="xs">
          <Button
            id="btn-open-proposal-modal"
            type="button"
            variant="primary"
            size="sm"
            icon={
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "16px" }}
              >
                alt_route
              </span>
            }
            onClick={() => openProposalModalWithRepo()}
            title="Abrir modal para selecionar repositório e criar proposta de versão"
          >
            Propor Alterações
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={14} />}
            onClick={() => {
              if (refreshGitStatus) refreshGitStatus();
              if (refreshPendingChanges) refreshPendingChanges();
              if (refreshWhatsNew) refreshWhatsNew();
              loadAllEdits();
            }}
            title="Atualizar dados e status"
            disabled={isLoadingChanges}
          >
            Atualizar
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<CloudUpload size={15} />}
            onClick={handleSync}
            isLoading={isSyncing}
          >
            {isSyncing
              ? "Sincronizando..."
              : `Sincronizar com ${providerLabel}`}
          </Button>
        </Row>
      }
    >
      <Tabs<TabType>
        activeTab={activeTab}
        onChange={handleTabChange}
        variant="underline"
        tabs={[
          {
            id: "whats-new",
            label: "Novidades da Equipe",
            icon: <Sparkles size={16} />,
            count: whatsNewFilesCount > 0 ? whatsNewFilesCount : undefined,
            badgeVariant: "success",
          },
          {
            id: "drafts",
            label: "Minhas Edições",
            icon: <FileEdit size={16} />,
            count: changedFilesCount > 0 ? changedFilesCount : undefined,
            badgeVariant: "warning",
          },
        ]}
      />
    </PageHeader>
  );
};

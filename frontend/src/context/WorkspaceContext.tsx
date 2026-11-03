import React, { createContext, useContext, useEffect, useMemo } from "react";
import type {
  DocumentMetadataItem,
  DictionaryTerm,
  EffectiveUserPermission,
  GitCommitInfo,
  GitStatus,
  Organization,
  ProjectMetadataOptions,
  Repo,
  RepoDiagnosis,
  TreeNode,
  WhatsNewSummary,
  WorkspaceChange,
  PendingInvitationsResult,
} from "../types";
import { useAuth } from "./AuthContext";
import { useEditorStore, type AutoSaveStatus } from "../stores/editorStore";
import { useRepoStore, getRepoOwnerOrOrg } from "../stores/repoStore";
import { useGitStore } from "../stores/gitStore";
import { useGovernanceStore } from "../stores/governanceStore";

export type { AutoSaveStatus };

export interface WorkspaceContextType {
  activeOrg: Organization | null;
  orgs: Organization[];
  loadOrgs: () => Promise<void>;
  selectOrg: (orgLogin: string) => Promise<void>;
  activeRepo: Repo | null;
  repos: Repo[];
  tree: TreeNode[];
  treesByRepo: Record<string, TreeNode[]>;
  activeFile: string;
  activeDocRepo: string;
  fileContent: string;
  originalContent: string;
  fileMetadata: Record<string, any>;
  pendingChanges: WorkspaceChange[];
  systemPendingChanges: WorkspaceChange[];
  guardrailStatus: string;
  isSaving: boolean;
  saveStatus: AutoSaveStatus;
  isLoadingFile: boolean;
  isLoading: boolean;
  isLoadingWorkspace: boolean;
  isLoadingTree: boolean;
  hasUnsavedChanges: boolean;
  gitStatus: GitStatus | null;
  gitLog: GitCommitInfo[];
  whatsNewSummary: WhatsNewSummary | null;
  hasUnreadWhatsNew: boolean;
  hasRemoteUpdates: boolean;
  remoteUpdateInfo: { localHash: string; remoteHash?: string; branch?: string } | null;
  checkRemoteUpdates: (targetRepoName?: string) => Promise<boolean>;
  refreshWhatsNew: () => Promise<void>;
  markWhatsNewAsSeen: () => void;
  loadRepos: (targetOrg?: string) => Promise<void>;
  selectRepo: (
    repo: Repo,
    initialFile?: string,
  ) => Promise<{ success: boolean; is_ready?: boolean; diagnosis?: RepoDiagnosis }>;
  selectRepoByName: (
    repoName: string,
    initialFile?: string,
  ) => Promise<boolean>;
  loadTree: (targetRepo?: string, isSilent?: boolean) => Promise<void>;
  loadFile: (filePath: string, targetRepo?: string) => Promise<void>;
  reloadActiveFile: (forceDisk?: boolean) => Promise<void>;
  setFileContent: (content: string) => void;
  setFileMetadata: (meta: Record<string, any>) => void;
  updateFileMetadata: (
    partialMeta: Partial<DocumentMetadataItem>,
  ) => Promise<void>;
  updateDocumentTitle: (newTitle: string) => Promise<void>;
  projectMetaOptions: ProjectMetadataOptions | null;
  loadProjectMetadataOptions: () => Promise<void>;
  projectConfig: any;
  loadProjectConfig: (targetRepoName?: string) => Promise<any>;
  saveProjectConfig: (
    configData: any,
  ) => Promise<{ success: boolean; error?: string }>;
  dictionaryTerms: DictionaryTerm[];
  loadDictionaryTerms: () => Promise<DictionaryTerm[]>;
  saveDictionaryTerms: (
    terms: DictionaryTerm[],
  ) => Promise<{ success: boolean; error?: string }>;
  addDictionaryTerm: (
    term: DictionaryTerm,
  ) => Promise<{ success: boolean; error?: string }>;
  addDictionarySynonym: (
    termIdOrCodename: string,
    synonym: string,
  ) => Promise<{ success: boolean; error?: string }>;
  saveCurrentFile: (
    meta?: Record<string, any>,
    content?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  flushPendingSave: () => Promise<void>;
  refreshPendingChanges: (targetRepoName?: string) => Promise<void>;
  discardChanges: (path?: string, targetRepo?: string) => Promise<void>;
  refreshGitStatus: (targetRepoName?: string) => Promise<void>;
  refreshGitLog: (limit?: number, targetRepoName?: string) => Promise<void>;
  commitGit: (
    message: string,
    files?: string[],
  ) => Promise<{ success: boolean; message: string; commitHash?: string }>;
  syncGit: (branch?: string) => Promise<{ success: boolean; message: string }>;
  createOrSwitchBranch: (
    branch: string,
  ) => Promise<{ success: boolean; message: string }>;
  moveFileOrFolder: (
    sourcePath: string,
    targetPath: string,
    sourceRepo?: string,
    targetRepo?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  duplicateFile: (
    filePath: string,
    targetRepo?: string,
  ) => Promise<{ success: boolean; newPath?: string; error?: string }>;
  cloneLocalRepo: (repo?: Repo) => Promise<{ success: boolean; error?: string }>;
  pullLocalRepo: (repo?: Repo) => Promise<{ success: boolean; message?: string; error?: string }>;
  getRepoOwnerOrOrg: (targetRepo?: Repo | null) => string | undefined;
  resetActiveRepo: () => void;
  repoProgress: Record<string, { stage: string; percent: number; message?: string }>;
  effectivePermission: EffectiveUserPermission | null;
  isLoadingPermission: boolean;
  refreshEffectivePermission: (repo?: Repo) => Promise<void>;
  authError: string | null;
  setAuthError: (err: string | null) => void;
  pendingInvitations: PendingInvitationsResult | null;
  isLoadingInvitations: boolean;
  refreshInvitations: () => Promise<void>;
  acceptInvitation: (payload: { type: 'repository' | 'org'; id?: number | string; org?: string }) => Promise<{ success: boolean; message?: string; error?: string }>;
  declineInvitation: (payload: { type: 'repository' | 'org'; id?: number | string; org?: string }) => Promise<{ success: boolean; message?: string; error?: string }>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const editor = useEditorStore();
  const repo = useRepoStore();
  const git = useGitStore();
  const gov = useGovernanceStore();

  useEffect(() => {
    if (isAuthenticated) {
      useRepoStore.getState().loadOrgs().catch(() => {});
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      useEditorStore.getState().flushPendingSave();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        useEditorStore.getState().flushPendingSave();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const value = useMemo<WorkspaceContextType>(() => ({
    ...editor,
    ...repo,
    ...git,
    ...gov,
    getRepoOwnerOrOrg,
  }), [editor, repo, git, gov]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = (): WorkspaceContextType => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace deve ser utilizado dentro de um WorkspaceProvider');
  }
  return context;
};

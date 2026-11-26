import { create } from "zustand";
import { API } from "../services/api";
import { DraftStore } from "../services/draft-store";
import type { GitCommitInfo, GitStatus, WorkspaceChange, VersionGraphData, SafeSwitchResult } from "../types";
import { useRepoStore } from "./repoStore";
import { useEditorStore } from "./editorStore";
import { useGovernanceStore } from "./governanceStore";

interface GitState {
  gitStatus: GitStatus | null;
  gitLog: GitCommitInfo[];
  pendingChanges: WorkspaceChange[];
  systemPendingChanges: WorkspaceChange[];
  hasRemoteUpdates: boolean;
  remoteUpdateInfo: { localHash: string; remoteHash?: string; branch?: string } | null;
  versionGraph: VersionGraphData | null;
  isVersionGraphLoading: boolean;

  setGitStatus: (status: GitStatus | null) => void;
  setGitLog: (log: GitCommitInfo[]) => void;
  setPendingChanges: (changes: WorkspaceChange[]) => void;
  setSystemPendingChanges: (changes: WorkspaceChange[]) => void;
  setHasRemoteUpdates: (hasUpdates: boolean) => void;
  setRemoteUpdateInfo: (info: { localHash: string; remoteHash?: string; branch?: string } | null) => void;

  refreshGitStatus: (targetRepoName?: string) => Promise<void>;
  refreshGitLog: (limit?: number, targetRepoName?: string) => Promise<void>;
  refreshPendingChanges: (targetRepoName?: string) => Promise<void>;
  discardChanges: (path?: string, targetRepo?: string) => Promise<void>;
  checkRemoteUpdates: (targetRepoName?: string, force?: boolean) => Promise<boolean>;
  commitGit: (message: string, files?: string[]) => Promise<{ success: boolean; message: string; commitHash?: string }>;
  syncGit: (branch?: string) => Promise<{ success: boolean; message: string }>;
  createOrSwitchBranch: (
    branch: string,
    baseBranch?: string,
    displayTitle?: string,
  ) => Promise<{ success: boolean; message: string }>;
  refreshVersionGraph: (targetRepoName?: string) => Promise<VersionGraphData | null>;
  safeSwitch: (payload: { branch?: string; commitHash?: string; repo?: string; action?: 'check' | 'switch' | 'stash' | 'discard'; owner?: string }) => Promise<SafeSwitchResult>;
  popStash: (stashId?: string) => Promise<{ success: boolean; message: string }>;
  dropStash: (stashId?: string) => Promise<{ success: boolean; message: string }>;
  clearStash: () => Promise<{ success: boolean; message: string }>;
  mergeBranch: (payload: {
    sourceBranch: string;
    targetBranch?: string;
    message?: string;
  }) => Promise<{ success: boolean; message: string; commitHash?: string; hasConflicts?: boolean; conflictFiles?: string[] }>;
}

const remoteUpdatesByRepo: Record<string, boolean> = {};
const pendingChangesByRepo: Record<string, WorkspaceChange[]> = {};
const lastRemoteCheckTime: Record<string, number> = {};

export const useGitStore = create<GitState>((set, get) => ({
  gitStatus: null,
  gitLog: [],
  pendingChanges: [],
  systemPendingChanges: [],
  hasRemoteUpdates: false,
  remoteUpdateInfo: null,
  versionGraph: null,
  isVersionGraphLoading: false,

  setGitStatus: (gitStatus) => set({ gitStatus }),
  setGitLog: (gitLog) => set({ gitLog }),
  setPendingChanges: (pendingChanges) => set({ pendingChanges }),
  setSystemPendingChanges: (systemPendingChanges) => set({ systemPendingChanges }),
  setHasRemoteUpdates: (hasRemoteUpdates) => set({ hasRemoteUpdates }),
  setRemoteUpdateInfo: (remoteUpdateInfo) => set({ remoteUpdateInfo }),

  refreshGitStatus: async (targetRepoName?: string) => {
    const repo = targetRepoName || useRepoStore.getState().activeRepo?.name;
    if (!repo) return;
    try {
      const res = await API.getGitStatus(repo);
      if (res.ok && res.data) {
        const filteredFiles = (res.data.files || []).filter(
          (f) => f?.path && f.path !== ".docs.metadata.json",
        );

        if (!targetRepoName || useRepoStore.getState().activeRepo?.name === repo) {
          set({
            gitStatus: {
              ...res.data,
              files: filteredFiles,
              systemFiles: [],
              isClean: filteredFiles.length === 0,
            },
            systemPendingChanges: [],
          });
        }
      }
    } catch (e) {
      console.warn("[gitStore] Erro ao carregar status do git:", e);
    }
  },

  refreshGitLog: async (limit = 20, targetRepoName?: string) => {
    const repo = targetRepoName || useRepoStore.getState().activeRepo?.name;
    if (!repo) return;
    try {
      const res = await API.getGitLog(limit, repo);
      if (res.ok && res.data) {
        if (!targetRepoName || useRepoStore.getState().activeRepo?.name === repo) {
          set({ gitLog: res.data.commits || [] });
        }
      }
    } catch (e) {
      console.warn("[gitStore] Erro ao carregar histórico git:", e);
    }
  },

  refreshPendingChanges: async (targetRepoName?: string) => {
    const repo = targetRepoName || useRepoStore.getState().activeRepo?.name;
    if (!repo) return;
    try {
      const data = await API.getWorkspaceChanges(repo);
      const filtered = (data.changes || []).filter(
        (c) => c?.path && c.path !== ".docs.metadata.json",
      );
      pendingChangesByRepo[repo] = filtered;
      if (!targetRepoName || useRepoStore.getState().activeRepo?.name === repo) {
        set({
          pendingChanges: filtered,
          systemPendingChanges: [],
        });
        useGovernanceStore.getState().setGuardrailStatus(
          filtered.length === 0 ? "CLEAN" : data.guardrail || "CLEAN",
        );
      }
      await get().refreshGitStatus(repo);
    } catch (err) {
      console.error("[gitStore] Erro ao buscar alterações pendentes:", err);
    }
  },

  discardChanges: async (path?: string, targetRepo?: string) => {
    const repo = useRepoStore.getState().activeRepo;
    const repoName = targetRepo || repo?.name || "local";
    const cleanPath = path ? path.replace(/^\/+/, "") : null;

    await API.discardWorkspaceChanges(cleanPath, repoName);

    const activeFile = useEditorStore.getState().activeFile;
    const currentBranch = get().gitStatus?.branch || get().versionGraph?.currentBranch || "default";
    if (cleanPath) {
      DraftStore.clearDocDraft(repoName, cleanPath, currentBranch);
      DraftStore.clearDocDraft(repoName, cleanPath);
    } else if (activeFile) {
      DraftStore.clearDocDraft(repoName, activeFile, currentBranch);
      DraftStore.clearDocDraft(repoName, activeFile);
    }

    await Promise.all([
      get().refreshPendingChanges(repoName),
      get().refreshGitStatus(repoName),
      useRepoStore.getState().loadTree(repoName),
    ]);

    const activeClean = activeFile ? activeFile.replace(/^\/+/, "") : null;
    if (!cleanPath || cleanPath === activeClean) {
      await useEditorStore.getState().reloadActiveFile(true);
    }
  },

  checkRemoteUpdates: async (targetRepoName?: string, force = false): Promise<boolean> => {
    const repoName = targetRepoName || useRepoStore.getState().activeRepo?.name;
    if (!repoName || repoName === "local" || repoName === "default" || repoName === "_default") {
      if (repoName) remoteUpdatesByRepo[repoName] = false;
      if (!targetRepoName || useRepoStore.getState().activeRepo?.name === repoName) {
        set({ hasRemoteUpdates: false, remoteUpdateInfo: null });
      }
      return false;
    }

    const now = Date.now();
    const lastCheck = lastRemoteCheckTime[repoName] || 0;
    if (!force && now - lastCheck < 60_000 && remoteUpdatesByRepo[repoName] !== undefined) {
      const cachedHasUp = Boolean(remoteUpdatesByRepo[repoName]);
      if (!targetRepoName || useRepoStore.getState().activeRepo?.name === repoName) {
        set({
          hasRemoteUpdates: cachedHasUp,
          remoteUpdateInfo: cachedHasUp ? get().remoteUpdateInfo : null,
        });
      }
      return cachedHasUp;
    }
    lastRemoteCheckTime[repoName] = now;

    try {
      const res = await API.checkRemoteGitUpdates(repoName);
      if (res.ok && res.data) {
        const hasUp = Boolean(res.data.hasUpdates);
        remoteUpdatesByRepo[repoName] = hasUp;
        if (!targetRepoName || useRepoStore.getState().activeRepo?.name === repoName) {
          set({
            hasRemoteUpdates: hasUp,
            remoteUpdateInfo: hasUp ? res.data : null,
          });
        }
        return hasUp;
      }
    } catch (err) {
      console.warn("[gitStore] Erro ao verificar atualizações remotas:", err);
    }
    return false;
  },

  commitGit: async (message: string, files?: string[]) => {
    const repo = useRepoStore.getState().activeRepo;
    const res = await API.commitGitChanges({ message, files, repo: repo?.name });
    if (res.ok && res.data?.success) {
      await get().refreshPendingChanges();
      await get().refreshGitStatus();
      await get().refreshGitLog(15);
      await get().refreshVersionGraph();
    }
    const rawData = res.data as { success?: boolean; message?: string; error?: string; commitHash?: string } | undefined;
    return {
      success: Boolean(res.ok && rawData?.success),
      message: rawData?.message || rawData?.error || "Não foi possível salvar o checkpoint.",
      commitHash: rawData?.commitHash,
    };
  },

  syncGit: async (branch?: string) => {
    const repo = useRepoStore.getState().activeRepo;
    const res = await API.syncGit(branch, repo?.name);
    if (res.ok && res.data?.success) {
      if (repo?.name) {
        remoteUpdatesByRepo[repo.name] = false;
        lastRemoteCheckTime[repo.name] = Date.now();
      }
      set({ hasRemoteUpdates: false, remoteUpdateInfo: null });
      await get().refreshPendingChanges();
      await get().refreshGitStatus();
      await get().refreshGitLog(15);
      await get().refreshVersionGraph();
      if (repo) await useRepoStore.getState().loadTree(repo.name);
    }
    return res.data;
  },

  createOrSwitchBranch: async (
    branch: string,
    baseBranch?: string,
    displayTitle?: string,
  ) => {
    const repo = useRepoStore.getState().activeRepo;
    const res = await API.createOrSwitchBranch(
      branch,
      repo?.name,
      baseBranch,
      displayTitle,
    );
    if (res.ok) {
      await get().refreshGitStatus();
      await get().refreshGitLog(15);
      await get().refreshVersionGraph();
      if (repo) await useRepoStore.getState().loadTree(repo.name);
    }
    return res.data;
  },

  refreshVersionGraph: async (targetRepoName?: string) => {
    set({ isVersionGraphLoading: true });
    try {
      const repo = useRepoStore.getState().activeRepo;
      const repoName = targetRepoName || repo?.name;
      const res = await API.getVersionGraph(repoName);
      if (res.ok && res.data) {
        set({ versionGraph: res.data });
        return res.data;
      }
      return null;
    } finally {
      set({ isVersionGraphLoading: false });
    }
  },

  safeSwitch: async (payload: {
    branch?: string;
    commitHash?: string;
    repo?: string;
    action?: 'check' | 'switch' | 'stash' | 'discard';
    owner?: string;
  }) => {
    const repo = useRepoStore.getState().activeRepo;
    const repoName = payload.repo || repo?.name;
    const repoOwner = payload.owner || repo?.owner;
    const res = await API.safeSwitch({ ...payload, repo: repoName, owner: repoOwner });
    if (res.ok && res.data) {
      if (payload.action && payload.action !== 'check' && res.data.success) {
        useEditorStore.getState().clearFileCache(true);
        await get().refreshGitStatus();
        await get().refreshPendingChanges();
        await get().refreshGitLog(15);
        await get().refreshVersionGraph();
        if (repo) await useRepoStore.getState().loadTree(repo.name);
        if (useEditorStore.getState().activeFile) {
          await useEditorStore.getState().reloadActiveFile(payload.action === 'discard');
        }
      }
      return res.data;
    }
    return res.data || { success: false, error: 'Falha na comunicação com o servidor' };
  },

  popStash: async (stashId?: string) => {
    const repo = useRepoStore.getState().activeRepo;
    const res = await API.popStash({ repo: repo?.name, stashId });
    if (res.ok && res.data?.success) {
      await get().refreshGitStatus();
      await get().refreshPendingChanges();
      await get().refreshVersionGraph();
      if (repo) await useRepoStore.getState().loadTree(repo.name);
    }
    return res.data || { success: false, message: 'Falha ao restaurar rascunhos' };
  },

  dropStash: async (stashId?: string) => {
    const repo = useRepoStore.getState().activeRepo;
    const res = await API.dropStash({ repo: repo?.name, stashId });
    if (res.ok && res.data?.success) {
      await get().refreshVersionGraph();
    }
    return res.data || { success: false, message: 'Falha ao descartar rascunho' };
  },

  clearStash: async () => {
    const repo = useRepoStore.getState().activeRepo;
    const res = await API.clearStash({ repo: repo?.name });
    if (res.ok && res.data?.success) {
      await get().refreshVersionGraph();
    }
    return res.data || { success: false, message: 'Falha ao limpar stashes' };
  },

  mergeBranch: async (payload: {
    sourceBranch: string;
    targetBranch?: string;
    message?: string;
  }) => {
    const repo = useRepoStore.getState().activeRepo;
    const res = await API.mergeBranch({ ...payload, repo: repo?.name });
    if (res.ok && res.data?.success) {
      await get().refreshGitStatus();
      await get().refreshGitLog(15);
      await get().refreshVersionGraph();
      if (repo) await useRepoStore.getState().loadTree(repo.name);
    }
    return res.data || { success: false, message: 'Falha ao executar o merge' };
  },
}));

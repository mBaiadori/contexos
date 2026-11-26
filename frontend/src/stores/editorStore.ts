import { create } from "zustand";
import { API } from "../services/api";
import { DraftStore } from "../services/draft-store";
import type { DocumentMetadataItem } from "../types";
import { useRepoStore } from "./repoStore";
import { useGitStore } from "./gitStore";

export type AutoSaveStatus =
  | "Pronto"
  | "Salvando..."
  | "Salvo no disco"
  | "Erro";

interface FileCacheEntry {
  content: string;
  originalContent: string;
  meta: Record<string, any>;
}

interface EditorState {
  activeFile: string;
  activeDocRepo: string;
  fileContent: string;
  originalContent: string;
  fileMetadata: Record<string, any>;
  saveStatus: AutoSaveStatus;
  isSaving: boolean;
  isLoadingFile: boolean;
  hasUnsavedChanges: boolean;

  setActiveFile: (file: string) => void;
  setActiveDocRepo: (repo: string) => void;
  setFileContent: (content: string) => void;
  setOriginalContent: (content: string) => void;
  setFileMetadata: (meta: Record<string, any>) => void;
  setSaveStatus: (status: AutoSaveStatus) => void;
  setIsSaving: (saving: boolean) => void;
  setIsLoadingFile: (loading: boolean) => void;

  loadFile: (rawFilePath: string, targetRepo?: string) => Promise<void>;
  reloadActiveFile: (forceDisk?: boolean) => Promise<void>;
  clearFileCache: (cancelPendingAutoSave?: boolean) => void;
  updateFileMetadata: (partialMeta: Partial<DocumentMetadataItem>) => Promise<void>;
  updateDocumentTitle: (newTitle: string) => Promise<void>;
  saveCurrentFile: (meta?: Record<string, any>, content?: string) => Promise<{ success: boolean; error?: string }>;
  flushPendingSave: () => Promise<void>;
}

const fileCache = new Map<string, FileCacheEntry>();
let inFlightFile: string | null = null;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let statusTimer: ReturnType<typeof setTimeout> | null = null;
let gitRefreshTimer: ReturnType<typeof setTimeout> | null = null;

const getCurrentBranchKey = (): string => {
  const gitState = useGitStore.getState();
  const branch = gitState.gitStatus?.branch || gitState.versionGraph?.currentBranch || "default";
  return branch.trim() || "default";
};

const makeCacheKey = (repoName: string, filePath: string, branch?: string): string => {
  const b = (branch || getCurrentBranchKey()).trim() || "default";
  return `${repoName}@${b}:${filePath}`;
};

const scheduleGitRefresh = (immediate = false) => {
  if (gitRefreshTimer) {
    clearTimeout(gitRefreshTimer);
    gitRefreshTimer = null;
  }
  if (immediate) {
    useGitStore.getState().refreshPendingChanges().catch(() => {});
    return;
  }
  // Debounce de 3.5s durante digitação contínua para poupar subprocessos Git no macOS
  gitRefreshTimer = setTimeout(() => {
    useGitStore.getState().refreshPendingChanges().catch(() => {});
    gitRefreshTimer = null;
  }, 3500);
};

const performDiskSave = async (
  file: string,
  content: string,
  meta: Record<string, any>,
  targetRepo?: string,
  immediateGit = false,
): Promise<{ success: boolean; error?: string }> => {
  if (!file) return { success: false, error: "Nenhum arquivo ativo para salvar" };
  const repoName = targetRepo || useRepoStore.getState().activeRepo?.name;
  if (!repoName) return { success: false, error: "Nenhum repositório selecionado" };
  const branchAtSave = getCurrentBranchKey();

  useEditorStore.setState({ isSaving: true, saveStatus: "Salvando..." });

  try {
    const res = await API.saveWorkspaceFile({ path: file, content, meta, repo: repoName });
    if (res.ok) {
      const current = useEditorStore.getState();
      if (
        file === current.activeFile &&
        (!targetRepo || targetRepo === current.activeDocRepo) &&
        getCurrentBranchKey() === branchAtSave
      ) {
        useEditorStore.setState({
          originalContent: content,
          fileContent: content,
          hasUnsavedChanges: false,
          fileMetadata: res.data?.meta || meta,
        });
      }
      DraftStore.clearDocDraft(repoName, file, branchAtSave);
      fileCache.set(makeCacheKey(repoName, file, branchAtSave), {
        content,
        originalContent: content,
        meta: res.data?.meta || meta,
      });

      if (res.data?.tree) {
        useRepoStore.getState().setTreeForRepo(repoName, res.data.tree as import("../types").TreeNode[]);
      }

      useEditorStore.setState({ saveStatus: "Salvo no disco" });
      window.dispatchEvent(
        new CustomEvent("workspace:document-saved", {
          detail: { filePath: file, meta: res.data?.meta },
        }),
      );

      if (statusTimer) clearTimeout(statusTimer);
      statusTimer = setTimeout(() => {
        useEditorStore.setState({ saveStatus: "Pronto" });
      }, 2200);

      scheduleGitRefresh(immediateGit);
      return { success: true };
    } else {
      useEditorStore.setState({ saveStatus: "Erro" });
      return { success: false, error: "Falha ao gravar no workspace" };
    }
  } catch (err: unknown) {
    console.error("[editorStore] Erro ao gravar arquivo no disco:", err);
    useEditorStore.setState({ saveStatus: "Erro" });
    const msg = err instanceof Error ? err.message : "Erro ao gravar no disco";
    return { success: false, error: msg };
  } finally {
    useEditorStore.setState({ isSaving: false });
  }
};

export const useEditorStore = create<EditorState>((set, get) => ({
  activeFile: "",
  activeDocRepo: "",
  fileContent: "",
  originalContent: "",
  fileMetadata: {},
  saveStatus: "Pronto",
  isSaving: false,
  isLoadingFile: false,
  hasUnsavedChanges: false,

  setActiveFile: (file) => set({ activeFile: file }),
  setActiveDocRepo: (repo) => set({ activeDocRepo: repo }),
  setFileContent: (content) => {
    const { originalContent, activeFile, fileMetadata } = get();
    const currentRepo = useRepoStore.getState().activeRepo;
    const hasUnsavedChanges = content !== originalContent;

    set({ fileContent: content, hasUnsavedChanges });

    if (currentRepo && activeFile) {
      const activeBranch = getCurrentBranchKey();
      DraftStore.saveDocDraft(
        currentRepo.name,
        activeFile,
        {
          body: content,
          rawContent: content,
        },
        500,
        activeBranch,
      );

      const cacheKey = makeCacheKey(currentRepo.name, activeFile, activeBranch);
      const existing = fileCache.get(cacheKey);
      fileCache.set(cacheKey, {
        content,
        originalContent: existing?.originalContent ?? originalContent,
        meta: existing?.meta ?? fileMetadata,
      });

      if (hasUnsavedChanges) {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        const scheduledRepo = currentRepo.name;
        const scheduledBranch = activeBranch;
        const scheduledFile = activeFile;
        autoSaveTimer = setTimeout(() => {
          autoSaveTimer = null;
          // Aborta autosave se o usuário trocou de branch ou repositório durante o debounce
          if (
            getCurrentBranchKey() !== scheduledBranch ||
            useRepoStore.getState().activeRepo?.name !== scheduledRepo
          ) {
            return;
          }
          performDiskSave(scheduledFile, content, fileMetadata, scheduledRepo, false);
        }, 750);
      }
    }
  },
  setOriginalContent: (content) =>
    set((state) => ({ originalContent: content, hasUnsavedChanges: state.fileContent !== content })),
  setFileMetadata: (meta) => set({ fileMetadata: meta }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  setIsSaving: (isSaving) => set({ isSaving }),
  setIsLoadingFile: (isLoadingFile) => set({ isLoadingFile }),

  clearFileCache: (cancelPendingAutoSave = true) => {
    if (cancelPendingAutoSave && autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    fileCache.clear();
  },

  flushPendingSave: async () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    const { activeFile, fileContent, originalContent, fileMetadata } = get();
    if (activeFile && fileContent !== originalContent) {
      await performDiskSave(activeFile, fileContent, fileMetadata, undefined, true);
    }
  },

  loadFile: async (rawFilePath: string, targetRepo?: string) => {
    const currentRepoName = targetRepo || useRepoStore.getState().activeRepo?.name;
    if (!rawFilePath) {
      fileCache.clear();
      set({
        activeFile: "",
        fileContent: "",
        originalContent: "",
        fileMetadata: {},
        hasUnsavedChanges: false,
      });
      return;
    }
    if (!currentRepoName) return;

    const hashIndex = rawFilePath.indexOf("#");
    const cleanPath = hashIndex !== -1 ? rawFilePath.slice(0, hashIndex) : rawFilePath;
    const hash = hashIndex !== -1 ? rawFilePath.slice(hashIndex) : "";

    if (hash) {
      if (window.location.hash !== hash) {
        try {
          window.history.replaceState(
            window.history.state,
            "",
            window.location.pathname + window.location.search + hash,
          );
        } catch {}
      }
    } else {
      if (window.location.hash) {
        try {
          window.history.replaceState(
            window.history.state,
            "",
            window.location.pathname + window.location.search,
          );
        } catch {}
      }
    }

    const { activeFile, activeDocRepo } = get();
    if (cleanPath === activeFile && currentRepoName === activeDocRepo) {
      if (hash) {
        window.dispatchEvent(
          new CustomEvent("workspace:navigate-fragment", {
            detail: { hash, filePath: cleanPath },
          }),
        );
      }
      return;
    }

    const activeBranch = getCurrentBranchKey();
    const cacheKey = makeCacheKey(currentRepoName, cleanPath, activeBranch);
    if (inFlightFile === cacheKey) return;
    inFlightFile = cacheKey;

    await get().flushPendingSave();

    const cached = fileCache.get(cacheKey);
    const draft = DraftStore.getDocDraft(currentRepoName, cleanPath, activeBranch);

    set({ isLoadingFile: true });

    try {
      let content = "";
      let original = "";
      let meta: Record<string, any> = {};

      if (draft) {
        content = draft.rawContent;
        original = cached ? cached.originalContent : draft.rawContent;
        meta = cached ? cached.meta : {};
      } else if (cached) {
        content = cached.content;
        original = cached.originalContent;
        meta = cached.meta;
      }

      if (!draft && !cached) {
        const data = await API.getProjectFile(cleanPath, currentRepoName);
        if (!data || (data as { error?: string }).error) {
          throw new Error((data as { error?: string }).error || "Arquivo não encontrado");
        }
        const activeDraft = DraftStore.getDocDraft(currentRepoName, cleanPath, activeBranch);
        content = activeDraft ? activeDraft.rawContent : data.content || "";
        original = data.content || "";
        meta = data.meta || {};

        fileCache.set(cacheKey, {
          content,
          originalContent: original,
          meta,
        });
      }

      set({
        activeDocRepo: currentRepoName,
        activeFile: cleanPath,
        fileContent: content,
        originalContent: original,
        fileMetadata: meta,
        hasUnsavedChanges: content !== original,
        saveStatus: "Pronto",
      });

      if (draft || cached) {
        API.getProjectFile(cleanPath, currentRepoName)
          .then((data) => {
            if (
              data &&
              !(data as { error?: string }).error &&
              get().activeFile === cleanPath &&
              getCurrentBranchKey() === activeBranch
            ) {
              const freshOriginal = data.content || "";
              const hasActiveDraft = !!DraftStore.getDocDraft(
                currentRepoName,
                cleanPath,
                activeBranch,
              );
              const nextContent = hasActiveDraft ? get().fileContent : freshOriginal;
              set({
                originalContent: freshOriginal,
                fileMetadata: data.meta || meta,
                fileContent: nextContent,
                hasUnsavedChanges: nextContent !== freshOriginal,
              });
              fileCache.set(cacheKey, {
                content: nextContent,
                originalContent: freshOriginal,
                meta: data.meta || meta,
              });
            }
          })
          .catch(() => {});
      }

      if (hash) {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("workspace:navigate-fragment", {
              detail: { hash, filePath: cleanPath },
            }),
          );
        }, 150);
      }
    } catch (err: unknown) {
      console.error("[editorStore] Erro ao carregar arquivo:", err);
      window.dispatchEvent(
        new CustomEvent("workspace:file-load-error", {
          detail: {
            path: cleanPath,
            message: `Documento "${cleanPath}" não foi encontrado no workspace.`,
          },
        }),
      );
    } finally {
      set({ isLoadingFile: false });
      inFlightFile = null;
    }
  },

  reloadActiveFile: async (forceDisk = true) => {
    const { activeFile } = get();
    const currentRepo = useRepoStore.getState().activeRepo;
    if (!activeFile || !currentRepo) return;

    try {
      const activeBranch = getCurrentBranchKey();
      if (forceDisk) {
        DraftStore.clearDocDraft(currentRepo.name, activeFile, activeBranch);
        DraftStore.clearDocDraft(currentRepo.name, activeFile);
      }
      const data = await API.getProjectFile(activeFile, currentRepo.name);
      if (data && !(data as { error?: string }).error) {
        const content = data.content || "";
        const meta = data.meta || {};
        fileCache.set(makeCacheKey(currentRepo.name, activeFile, activeBranch), {
          content,
          originalContent: content,
          meta,
        });
        set({
          fileContent: content,
          originalContent: content,
          fileMetadata: meta,
          hasUnsavedChanges: false,
          saveStatus: "Pronto",
        });
      }
    } catch (err) {
      console.warn("[editorStore] Erro ao recarregar arquivo ativo:", err);
    }
  },

  updateFileMetadata: async (partialMeta: Partial<DocumentMetadataItem>) => {
    const { activeFile, fileContent, fileMetadata } = get();
    if (!activeFile) return;

    const mergedMeta: Record<string, any> = {
      ...fileMetadata,
      ...partialMeta,
    };
    set({ fileMetadata: mergedMeta });
    await performDiskSave(activeFile, fileContent, mergedMeta, undefined, true);
  },

  updateDocumentTitle: async (newTitle: string) => {
    const { activeFile, fileContent, fileMetadata } = get();
    if (!activeFile) return;

    const mergedMeta: Record<string, any> = {
      ...fileMetadata,
      title: newTitle,
    };
    set({ fileMetadata: mergedMeta });
    await performDiskSave(activeFile, fileContent, mergedMeta, undefined, true);
  },

  saveCurrentFile: async (meta?: Record<string, any>, content?: string) => {
    const { activeFile, fileContent, fileMetadata } = get();
    const contentToSave = content !== undefined ? content : fileContent;
    const metaToSave = meta !== undefined ? meta : fileMetadata;
    return performDiskSave(activeFile, contentToSave, metaToSave, undefined, true);
  },
}));

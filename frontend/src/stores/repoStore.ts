import { create } from "zustand";
import { API } from "../services/api";
import type {
  EffectiveUserPermission,
  Organization,
  Repo,
  RepoDiagnosis,
  TreeNode,
  PendingInvitationsResult,
} from "../types";
import { useGitStore } from "./gitStore";
import { useEditorStore } from "./editorStore";
import { useGovernanceStore } from "./governanceStore";

function fileExistsInTree(nodes: TreeNode[], targetPath: string): boolean {
  if (!targetPath) return false;
  for (const node of nodes) {
    if (node.type === "file" && node.path === targetPath) return true;
    if (node.children && node.children.length > 0) {
      if (fileExistsInTree(node.children, targetPath)) return true;
    }
  }
  return false;
}

function resolveRepoOwnerOrOrg(
  targetRepo?: Repo | null,
  activeRepo?: Repo | null,
  activeOrg?: Organization | null,
): string | undefined {
  const r = targetRepo !== undefined ? targetRepo : activeRepo;
  if (r) {
    if (typeof r.owner === "string" && r.owner && r.owner !== "local") return r.owner;
    if (typeof r.owner === "object" && r.owner !== null && "login" in r.owner) {
      const ownerObj = r.owner as { login?: string };
      if (ownerObj.login && ownerObj.login !== "local") return ownerObj.login;
    }
    if (r.full_name && r.full_name.includes("/")) {
      const orgPart = r.full_name.split("/")[0];
      if (orgPart && orgPart !== "local") return orgPart;
    }
  }
  const match = typeof window !== "undefined" ? window.location.pathname.match(/\/org\/([^/]+)/) : null;
  if (match && match[1]) {
    const decoded = decodeURIComponent(match[1]);
    if (decoded !== "local") return decoded;
  }
  if (activeOrg?.login && activeOrg.login !== "local") return activeOrg.login;
  try {
    const saved = localStorage.getItem("spec_active_org_login");
    if (saved && saved !== "local") return saved;
  } catch {}
  return undefined;
}

interface RepoState {
  activeOrg: Organization | null;
  orgs: Organization[];
  activeRepo: Repo | null;
  repos: Repo[];
  tree: TreeNode[];
  treesByRepo: Record<string, TreeNode[]>;
  isLoading: boolean;
  isLoadingWorkspace: boolean;
  isLoadingTree: boolean;
  repoProgress: Record<string, { stage: string; percent: number; message?: string }>;
  effectivePermission: EffectiveUserPermission | null;
  isLoadingPermission: boolean;
  authError: string | null;
  pendingInvitations: PendingInvitationsResult | null;
  isLoadingInvitations: boolean;

  setActiveOrg: (org: Organization | null) => void;
  setOrgs: (orgs: Organization[]) => void;
  setActiveRepo: (repo: Repo | null) => void;
  setRepos: (repos: Repo[]) => void;
  setTree: (tree: TreeNode[]) => void;
  setTreesByRepo: (trees: Record<string, TreeNode[]>) => void;
  setTreeForRepo: (repoName: string, tree: TreeNode[]) => void;
  setRepoProgress: (progress: Record<string, { stage: string; percent: number; message?: string }>) => void;
  setEffectivePermission: (perm: EffectiveUserPermission | null) => void;
  setAuthError: (err: string | null) => void;

  refreshInvitations: () => Promise<void>;
  acceptInvitation: (payload: { type: 'repository' | 'org'; id?: number | string; org?: string }) => Promise<{ success: boolean; message?: string; error?: string }>;
  declineInvitation: (payload: { type: 'repository' | 'org'; id?: number | string; org?: string }) => Promise<{ success: boolean; message?: string; error?: string }>;

  loadOrgs: () => Promise<void>;
  selectOrg: (orgLogin: string) => Promise<void>;
  loadRepos: (targetOrg?: string) => Promise<void>;
  selectRepo: (
    repo: Repo,
    initialFile?: string,
  ) => Promise<{ success: boolean; is_ready?: boolean; diagnosis?: RepoDiagnosis }>;
  selectRepoByName: (repoName: string, initialFile?: string) => Promise<boolean>;
  loadTree: (targetRepo?: string, isSilent?: boolean) => Promise<void>;
  cloneLocalRepo: (targetRepo?: Repo) => Promise<{ success: boolean; error?: string }>;
  pullLocalRepo: (targetRepo?: Repo) => Promise<{ success: boolean; message?: string; error?: string }>;
  resetActiveRepo: () => void;
  clearPermissionsCache: () => void;
  refreshEffectivePermission: (targetRepo?: Repo) => Promise<void>;
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
  getRepoOwnerOrOrg: (targetRepo?: Repo | null) => string | undefined;
}

const treesByRepoCache: Record<string, TreeNode[]> = {};
const effectivePermissionsByRepo: Record<string, EffectiveUserPermission> = {};

export const clearEffectivePermissionsCache = () => {
  for (const k of Object.keys(effectivePermissionsByRepo)) {
    delete effectivePermissionsByRepo[k];
  }
};

function getPermCacheKey(repoName: string, owner?: string): string {
  const o = owner || resolveRepoOwnerOrOrg();
  return `${(o || "local").toLowerCase()}/${repoName.toLowerCase()}`;
}

function findTreeEntry(
  map: Record<string, TreeNode[]>,
  repoName: string,
): { key: string; tree: TreeNode[] } | null {
  const target = repoName.toLowerCase();
  const matchedKey = Object.keys(map).find((k) => k.toLowerCase() === target);
  return matchedKey ? { key: matchedKey, tree: map[matchedKey] } : null;
}

function upsertTreeRecord(
  map: Record<string, TreeNode[]>,
  repoName: string,
  tree: TreeNode[],
): Record<string, TreeNode[]> {
  const target = repoName.toLowerCase();
  const next = { ...map };
  for (const k of Object.keys(next)) {
    if (k.toLowerCase() === target && k !== repoName) {
      delete next[k];
    }
  }
  next[repoName] = tree;
  return next;
}

function getRepoNameFromPathname(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/\/repo\/([^/]+)/);
  if (!match || !match[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

let inFlightRepo: string | null = null;
let initializedRepoKey: string | null = null;

const initialOrg = (): Organization | null => {
  try {
    const saved = localStorage.getItem("spec_active_org_login");
    if (saved) return { login: saved, full_name: saved };
  } catch {}
  return null;
};

export const useRepoStore = create<RepoState>((set, get) => ({
  activeOrg: initialOrg(),
  orgs: [],
  activeRepo: null,
  repos: [],
  tree: [],
  treesByRepo: {},
  isLoading: false,
  isLoadingWorkspace: false,
  isLoadingTree: false,
  repoProgress: {},
  effectivePermission: null,
  isLoadingPermission: false,
  authError: null,
  pendingInvitations: null,
  isLoadingInvitations: false,

  setActiveOrg: (activeOrg) => set({ activeOrg }),
  setOrgs: (orgs) => set({ orgs }),
  setActiveRepo: (activeRepo) => set({ activeRepo }),
  setRepos: (repos) => set({ repos }),
  setTree: (tree) => set({ tree }),
  setTreesByRepo: (treesByRepo) => set({ treesByRepo }),
  setTreeForRepo: (repoName, tree) => {
    treesByRepoCache[repoName] = tree;
    set((state) => ({
      treesByRepo: upsertTreeRecord(state.treesByRepo, repoName, tree),
      tree: state.activeRepo?.name.toLowerCase() === repoName.toLowerCase() ? tree : state.tree,
    }));
  },
  setRepoProgress: (repoProgress) => set({ repoProgress }),
  setEffectivePermission: (effectivePermission) => set({ effectivePermission }),
  setAuthError: (authError) => set({ authError }),
  getRepoOwnerOrOrg: (targetRepo) =>
    resolveRepoOwnerOrOrg(targetRepo, get().activeRepo, get().activeOrg),

  refreshInvitations: async () => {
    set({ isLoadingInvitations: true });
    try {
      const res = await API.getPendingInvitations();
      if (res.ok && res.data) {
        set({ pendingInvitations: res.data });
      }
    } catch (err) {
      console.warn("[repoStore] Erro ao carregar convites:", err);
    } finally {
      set({ isLoadingInvitations: false });
    }
  },

  acceptInvitation: async (payload: { type: 'repository' | 'org'; id?: number | string; org?: string }) => {
    try {
      const res = await API.acceptInvitation(payload);
      if (res.ok && res.data?.success) {
        await get().refreshInvitations();
        await get().loadOrgs();
        await get().loadRepos();
        return { success: true, message: res.data.message };
      }
      return { success: false, error: res.data?.error || 'Falha ao aceitar convite' };
    } catch (err) {
      return { success: false, error: (err as Error)?.message || 'Erro ao aceitar convite' };
    }
  },

  declineInvitation: async (payload: { type: 'repository' | 'org'; id?: number | string; org?: string }) => {
    try {
      const res = await API.declineInvitation(payload);
      if (res.ok && res.data?.success) {
        await get().refreshInvitations();
        return { success: true, message: res.data.message };
      }
      return { success: false, error: res.data?.error || 'Falha ao recusar convite' };
    } catch (err) {
      return { success: false, error: (err as Error)?.message || 'Erro ao recusar convite' };
    }
  },

  loadOrgs: async () => {
    get().refreshInvitations().catch(() => {});
    try {
      const res = await API.getOrgs();
      if (res.ok && res.data?.orgs) {
        set({ orgs: res.data.orgs });
        const activeRepo = get().activeRepo;
        const repoOwner = activeRepo?.owner;
        const targetOrgLogin =
          (repoOwner && res.data.orgs.some((o) => o.login.toLowerCase() === repoOwner.toLowerCase()))
            ? repoOwner
            : localStorage.getItem("spec_active_org_login");

        if (targetOrgLogin) {
          const found = res.data.orgs.find(
            (o) => o.login.toLowerCase() === targetOrgLogin.toLowerCase(),
          );
          if (found) {
            set({ activeOrg: found });
            localStorage.setItem("spec_active_org_login", found.login);
            await get().loadRepos(found.login);
            return;
          }
        }
        // Se não há organização previamente escolhida, mantemos activeOrg null
        // para que o SelectOrgModal seja apresentado ao usuário.
      }
    } catch (e) {
      console.warn("[repoStore] Erro ao carregar organizações:", e);
    }
  },

  loadRepos: async (targetOrg?: string) => {
    set({ isLoading: true, isLoadingWorkspace: true });
    try {
      const orgToFetch =
        targetOrg !== undefined
          ? targetOrg
          : (get().activeOrg?.login || localStorage.getItem("spec_active_org_login") || "");

      const res = await API.getRepos(orgToFetch);
      if (res.data?.auth_error) {
        set({ authError: res.data.auth_error });
      } else if (res.ok) {
        set({ authError: null });
      }
      if (res.ok && res.data) {
        if (res.data.repos) {
          const cleanRepos = res.data.repos.filter((r) => r.name !== "default" && r.name !== "_default");
          set({ repos: cleanRepos });
        }
        if (res.data.active_repo) {
          const backendActiveRepo = res.data.active_repo;
          const currentActive = get().activeRepo;
          const urlRepoName = getRepoNameFromPathname();
          const matchesUrlRepo =
            !urlRepoName || urlRepoName.toLowerCase() === backendActiveRepo.name.toLowerCase();

          if (!currentActive && !inFlightRepo && matchesUrlRepo) {
            set({ activeRepo: backendActiveRepo });
          }
          const repoOwner = backendActiveRepo.owner;
          if (repoOwner && repoOwner !== "local" && !get().activeOrg) {
            const foundOrg = get().orgs.find((o) => o.login.toLowerCase() === repoOwner.toLowerCase());
            const orgToSet = foundOrg || { login: repoOwner, full_name: repoOwner };
            set({ activeOrg: orgToSet });
            try {
              localStorage.setItem("spec_active_org_login", orgToSet.login);
            } catch {}
            // Se buscou sem organização ou com org divergente, recarrega os repos para a org do active_repo
            if (!orgToFetch || orgToFetch.toLowerCase() !== repoOwner.toLowerCase()) {
              await get().loadRepos(repoOwner);
              return;
            }
          }

          if (
            backendActiveRepo.is_cloned_locally &&
            matchesUrlRepo &&
            !inFlightRepo &&
            !findTreeEntry(get().treesByRepo, backendActiveRepo.name)
          ) {
            void get().selectRepo(backendActiveRepo);
          }
        }
      }
    } catch (err) {
      console.error("[repoStore] Erro ao carregar repositórios:", err);
    } finally {
      set({ isLoading: false, isLoadingWorkspace: false });
    }
  },

  selectOrg: async (orgLogin: string) => {
    if (!orgLogin) return;
    const found = get().orgs.find((o) => o.login.toLowerCase() === orgLogin.toLowerCase());
    const orgToSet = found || { login: orgLogin, full_name: orgLogin };
    initializedRepoKey = null;
    for (const k of Object.keys(treesByRepoCache)) {
      delete treesByRepoCache[k];
    }
    set({
      activeOrg: orgToSet,
      activeRepo: null,
      tree: [],
      treesByRepo: {},
      repos: [],
      isLoadingWorkspace: true,
      isLoading: true,
    });
    try {
      localStorage.setItem("spec_active_org_login", orgToSet.login);
    } catch {}
    await get().loadRepos(orgToSet.login);
  },

  refreshEffectivePermission: async (targetRepo?: Repo) => {
    const r = targetRepo || get().activeRepo;
    if (!r?.name) return;
    const ownerLogin = getRepoOwnerOrOrg(r);
    const cacheKey = getPermCacheKey(r.name, ownerLogin);
    const cached = effectivePermissionsByRepo[cacheKey];
    if (cached) {
      set({ effectivePermission: cached, isLoadingPermission: false });
    } else {
      set({ effectivePermission: null, isLoadingPermission: true });
    }

    try {
      const res = await API.getEffectiveUserPermission(r.name, ownerLogin);
      if (res.ok && res.data) {
        effectivePermissionsByRepo[cacheKey] = res.data;
        if (get().activeRepo?.name === r.name) {
          set({ effectivePermission: res.data });
        }
      }
    } catch {} finally {
      if (get().activeRepo?.name === r.name) {
        set({ isLoadingPermission: false });
      }
    }
  },

  loadTree: async (targetRepo?: string, isSilent = false) => {
    const repo = targetRepo || get().activeRepo?.name;
    if (!repo) return;
    if (!isSilent) set({ isLoadingTree: true });
    try {
      const targetObj = targetRepo
        ? (get().repos.find((r) => r.name.toLowerCase() === targetRepo.toLowerCase()) ||
           (get().activeRepo?.name.toLowerCase() === targetRepo.toLowerCase() ? get().activeRepo : null))
        : get().activeRepo;
      const canonicalName = targetObj?.name || repo;
      const owner = getRepoOwnerOrOrg(targetObj);
      const data = await API.getProjectTree(canonicalName, owner);
      if (Array.isArray(data?.tree)) {
        treesByRepoCache[canonicalName] = data.tree;
        set((state) => ({
          treesByRepo: upsertTreeRecord(state.treesByRepo, canonicalName, data.tree),
          tree:
            state.activeRepo?.name.toLowerCase() === canonicalName.toLowerCase()
              ? data.tree
              : state.tree,
        }));
      }
    } catch (err) {
      console.error("[repoStore] Erro ao buscar árvore:", err);
    } finally {
      if (!isSilent) set({ isLoadingTree: false });
    }
  },

  selectRepo: async (
    repo: Repo,
    initialFile?: string,
  ): Promise<{ success: boolean; is_ready?: boolean; diagnosis?: RepoDiagnosis }> => {
    if (!repo || !repo.name) return { success: false, is_ready: false };
    if (inFlightRepo?.toLowerCase() === repo.name.toLowerCase()) {
      return { success: true, is_ready: true };
    }

    const ownerLogin = getRepoOwnerOrOrg(repo);
    const permKey = getPermCacheKey(repo.name, ownerLogin);
    const hasLoadedTree = findTreeEntry(get().treesByRepo, repo.name) !== null;
    const isAlreadyInitialized =
      initializedRepoKey === permKey &&
      get().activeRepo?.name.toLowerCase() === repo.name.toLowerCase() &&
      (!repo.is_cloned_locally || hasLoadedTree);

    if (isAlreadyInitialized && !initialFile) {
      return { success: true, is_ready: true };
    }
    inFlightRepo = repo.name;

    const cachedEntry = findTreeEntry(treesByRepoCache, repo.name);
    const cachedTree = cachedEntry?.tree;
    const hasCachedTree = Array.isArray(cachedTree) && cachedTree.length > 0;

    if (!hasCachedTree && repo.is_cloned_locally) {
      set({ isLoadingTree: true });
    }

    const cachedPerm = effectivePermissionsByRepo[permKey];
    set({
      effectivePermission: cachedPerm || null,
      isLoadingPermission: !cachedPerm,
    });

    try {
      const prevRepo = get().activeRepo;
      if (
        prevRepo?.name &&
        prevRepo.name.toLowerCase() !== repo.name.toLowerCase() &&
        (get().tree.length > 0 || findTreeEntry(get().treesByRepo, prevRepo.name) !== null)
      ) {
        treesByRepoCache[prevRepo.name] = get().tree;
      }

      await useEditorStore.getState().flushPendingSave();

      if (prevRepo && prevRepo.name.toLowerCase() !== repo.name.toLowerCase()) {
        useEditorStore.getState().loadFile("");
      }

      set({
        activeRepo: repo,
        tree: hasCachedTree && cachedTree ? cachedTree : [],
      });

      API.getEffectiveUserPermission(repo.name, ownerLogin)
        .then((res) => {
          if (res.ok && res.data) {
            effectivePermissionsByRepo[permKey] = res.data;
            if (get().activeRepo?.name.toLowerCase() === repo.name.toLowerCase()) {
              set({ effectivePermission: res.data });
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          if (get().activeRepo?.name.toLowerCase() === repo.name.toLowerCase()) {
            set({ isLoadingPermission: false });
          }
        });

      const selectRes = await API.selectRepo(repo);
      if (selectRes.data?.active_repo) {
        const updated = selectRes.data.active_repo;
        set((state) => ({
          activeRepo: updated,
          repos: state.repos.map((r) =>
            r.name.toLowerCase() === repo.name.toLowerCase()
              ? { ...r, is_cloned_locally: Boolean(updated.is_cloned_locally) }
              : r,
          ),
        }));
      }

      const isCloned = Boolean(selectRes.data?.active_repo?.is_cloned_locally);
      const diagnosis = selectRes.data?.diagnosis;

      if (!isCloned) {
        initializedRepoKey = permKey;
        set({ isLoadingTree: false });
        return { success: true, is_ready: false, diagnosis };
      }

      let treeNodes: TreeNode[] = [];
      try {
        const data = await API.getProjectTree(repo.name, ownerLogin);
        if (Array.isArray(data?.tree)) {
          treeNodes = data.tree;
          treesByRepoCache[repo.name] = treeNodes;
          set((state) => ({
            treesByRepo: upsertTreeRecord(state.treesByRepo, repo.name, treeNodes),
            tree:
              state.activeRepo?.name.toLowerCase() === repo.name.toLowerCase()
                ? treeNodes
                : state.tree,
            isLoadingTree: false,
          }));
        }
      } catch (treeErr) {
        console.error("[repoStore] Erro ao carregar árvore do repositório:", treeErr);
      }

      initializedRepoKey = permKey;

      const currentActive = useEditorStore.getState().activeFile;
      let fileToOpen: string | null = null;
      if (initialFile && fileExistsInTree(treeNodes, initialFile)) {
        fileToOpen = initialFile;
      } else if (currentActive && fileExistsInTree(treeNodes, currentActive)) {
        fileToOpen = currentActive;
      }

      if (fileToOpen) {
        useEditorStore.getState().loadFile(fileToOpen, repo.name).catch((e) =>
          console.warn("[repoStore] Erro ao carregar arquivo inicial:", e),
        );
      } else {
        useEditorStore.getState().loadFile("", repo.name).catch(() => {});
      }

      setTimeout(() => {
        Promise.allSettled([
          useGovernanceStore.getState().loadProjectConfig(repo.name),
          useGitStore.getState().refreshPendingChanges(repo.name),
          useGitStore.getState().refreshGitLog(15, repo.name),
          useGitStore.getState().checkRemoteUpdates(repo.name),
          useGovernanceStore.getState().loadDictionaryTerms(),
        ]).catch(() => {});
      }, 50);

      return { success: true, is_ready: true, diagnosis };
    } finally {
      inFlightRepo = null;
      set({ isLoadingTree: false });
    }
  },

  selectRepoByName: async (repoName: string, initialFile?: string): Promise<boolean> => {
    if (!repoName) return false;
    const currentActive = get().activeRepo;
    if (currentActive?.name.toLowerCase() === repoName.toLowerCase()) {
      const permKey = getPermCacheKey(currentActive.name, getRepoOwnerOrOrg(currentActive));
      const hasLoadedTree =
        !currentActive.is_cloned_locally ||
        findTreeEntry(get().treesByRepo, repoName) !== null;
      if (initializedRepoKey === permKey && hasLoadedTree) {
        if (initialFile && initialFile !== useEditorStore.getState().activeFile) {
          await useEditorStore.getState().loadFile(initialFile, repoName);
        }
        return true;
      }
    }
    if (inFlightRepo?.toLowerCase() === repoName.toLowerCase()) return true;

    let currentRepos = get().repos;
    let found = currentRepos.find((r) => r.name.toLowerCase() === repoName.toLowerCase());
    if (!found && currentRepos.length === 0) {
      try {
        const detectedOrg = getRepoOwnerOrOrg();
        const res = await API.getRepos(detectedOrg);
        if (res.ok && res.data.repos) {
          currentRepos = res.data.repos;
          set({ repos: currentRepos });
          found = currentRepos.find((r) => r.name.toLowerCase() === repoName.toLowerCase());
        }
      } catch (err) {
        console.error("[repoStore] Erro ao carregar repos:", err);
      }
    }

    if (!found && currentActive?.name.toLowerCase() === repoName.toLowerCase()) {
      found = currentActive;
    }

    if (found) {
      await get().selectRepo(found, initialFile);
      return true;
    }
    return false;
  },

  cloneLocalRepo: async (targetRepo?: Repo): Promise<{ success: boolean; error?: string }> => {
    const r = targetRepo || get().activeRepo;
    if (!r?.name) return { success: false, error: "Nenhum repositório selecionado para clonar" };
    set({ isLoadingTree: true });
    try {
      const owner = getRepoOwnerOrOrg(r);
      const res = await API.cloneLocalRepo({ name: r.name, owner });
      if (res.ok && res.data?.success) {
        const updatedRepo: Repo = { ...r, is_cloned_locally: true };
        set((state) => ({
          activeRepo: updatedRepo,
          repos: state.repos.map((repoItem) =>
            repoItem.name.toLowerCase() === r.name.toLowerCase()
              ? { ...repoItem, is_cloned_locally: true }
              : repoItem,
          ),
        }));

        try {
          const treeData = await API.getProjectTree(r.name, owner);
          if (Array.isArray(treeData?.tree)) {
            treesByRepoCache[r.name] = treeData.tree;
            initializedRepoKey = getPermCacheKey(r.name, owner);
            set((state) => ({
              treesByRepo: upsertTreeRecord(state.treesByRepo, r.name, treeData.tree),
              tree:
                state.activeRepo?.name.toLowerCase() === r.name.toLowerCase()
                  ? treeData.tree
                  : state.tree,
            }));
          }
        } catch (treeErr) {
          console.error("[repoStore] Erro ao carregar árvore pós-clone:", treeErr);
        }

        Promise.allSettled([
          useGitStore.getState().refreshGitStatus(r.name),
          useGitStore.getState().refreshGitLog(15, r.name),
          get().loadRepos(),
        ]).catch(() => {});

        return { success: true };
      }
      return { success: false, error: res.data?.error || "Falha ao clonar repositório" };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao clonar repositório";
      return { success: false, error: msg };
    } finally {
      set({ isLoadingTree: false });
    }
  },

  pullLocalRepo: async (targetRepo?: Repo): Promise<{ success: boolean; message?: string; error?: string }> => {
    const r = targetRepo || get().activeRepo;
    if (!r?.name) return { success: false, error: "Nenhum repositório ativo" };
    try {
      const owner = getRepoOwnerOrOrg(r);
      const res = await API.pullLocalRepo({ repo: r.name, owner });
      if (res.ok && res.data?.success) {
        await get().loadTree(r.name);
        await Promise.allSettled([
          useGitStore.getState().refreshGitStatus(r.name),
          useGitStore.getState().refreshGitLog(15, r.name),
        ]);
        return { success: true, message: res.data.message };
      }
      return { success: false, error: res.data?.error || "Falha ao puxar alterações" };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao puxar alterações";
      return { success: false, error: msg };
    }
  },

  resetActiveRepo: () => {
    initializedRepoKey = null;
    set({
      activeRepo: null,
      tree: [],
      effectivePermission: null,
    });
    useEditorStore.getState().loadFile("");
  },

  clearPermissionsCache: () => {
    clearEffectivePermissionsCache();
    set({ effectivePermission: null });
  },

  moveFileOrFolder: async (
    sourcePath: string,
    targetPath: string,
    sourceRepo?: string,
    targetRepo?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    const srcRepo = sourceRepo || get().activeRepo?.name;
    const dstRepo = targetRepo || srcRepo;
    if (!srcRepo || !dstRepo || !sourcePath || !targetPath) {
      return { success: false, error: "Parâmetros inválidos para mover arquivo." };
    }

    await useEditorStore.getState().flushPendingSave();

    try {
      const res = await API.moveProjectFile({
        source_path: sourcePath,
        target_path: targetPath,
        source_repo: srcRepo,
        target_repo: dstRepo,
      });

      if (res.ok && res.data?.success) {
        if (res.data.sourceTree) {
          get().setTreeForRepo(srcRepo, res.data.sourceTree);
        } else {
          await get().loadTree(srcRepo);
        }

        if (res.data.targetTree && srcRepo !== dstRepo) {
          get().setTreeForRepo(dstRepo, res.data.targetTree);
        } else if (srcRepo !== dstRepo) {
          await get().loadTree(dstRepo);
        }

        await Promise.all([
          useGitStore.getState().refreshPendingChanges(),
          useGitStore.getState().refreshGitStatus(),
        ]);

        const cleanOld = sourcePath.trim().replace(/^\/+/, "").replace(/\/+$/, "");
        const cleanNew = targetPath.trim().replace(/^\/+/, "").replace(/\/+$/, "");
        const currentActive = useEditorStore.getState().activeFile;

        if (currentActive === cleanOld || (currentActive && currentActive.startsWith(`${cleanOld}/`))) {
          const finalPath =
            currentActive === cleanOld ? cleanNew : `${cleanNew}${currentActive.slice(cleanOld.length)}`;

          if (srcRepo !== dstRepo) {
            const targetRepoObj = get().repos.find(
              (r) => r.name.toLowerCase() === dstRepo.toLowerCase(),
            ) || {
              id: 0,
              name: dstRepo,
              full_name: dstRepo,
              is_local: true,
            };
            await get().selectRepo(targetRepoObj, finalPath);
          } else {
            await useEditorStore.getState().loadFile(finalPath, dstRepo);
          }
        }

        return { success: true };
      }
      return { success: false, error: res.data?.error || "Falha ao mover arquivo/pasta." };
    } catch (err: unknown) {
      console.error("[repoStore] Erro ao mover arquivo:", err);
      const msg = err instanceof Error ? err.message : "Erro de conexão ao mover arquivo.";
      return { success: false, error: msg };
    }
  },

  duplicateFile: async (
    filePath: string,
    targetRepo?: string,
  ): Promise<{ success: boolean; newPath?: string; error?: string }> => {
    const currentRepoName = targetRepo || get().activeRepo?.name;
    if (!currentRepoName || !filePath) {
      return { success: false, error: "Parâmetros inválidos para duplicar arquivo." };
    }

    await useEditorStore.getState().flushPendingSave();

    try {
      const res = await API.duplicateProjectFile(filePath, currentRepoName);
      if (res.ok && res.data?.success && res.data.newPath) {
        const newPath = res.data.newPath;
        if (res.data.tree) {
          get().setTreeForRepo(currentRepoName, res.data.tree);
        } else {
          await get().loadTree(currentRepoName);
        }

        await Promise.all([
          useGitStore.getState().refreshPendingChanges(),
          useGitStore.getState().refreshGitStatus(),
        ]);
        await useEditorStore.getState().loadFile(newPath, currentRepoName);

        return { success: true, newPath };
      }
      return { success: false, error: res.data?.error || "Falha ao duplicar arquivo." };
    } catch (err: unknown) {
      console.error("[repoStore] Erro ao duplicar arquivo:", err);
      const msg = err instanceof Error ? err.message : "Erro de conexão ao duplicar arquivo.";
      return { success: false, error: msg };
    }
  },
}));

export const getRepoOwnerOrOrg = (targetRepo?: Repo | null): string | undefined =>
  useRepoStore.getState().getRepoOwnerOrOrg(targetRepo);


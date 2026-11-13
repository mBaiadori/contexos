import fs from "fs";
import path from "path";
import { resolveRepoDir } from "../../config/constants.js";
import { clearWorkspaceChanges, loadConfig } from "../../config/storage.js";
import { assertBranchName, assertCommitish } from "../../utils/git-validate.js";
import {
  checkRemoteGitUpdates,
  cloneGitRepo,
  commitChanges,
  createAndCheckoutBranch,
  executeGit,
  getDefaultBranch,
  getFileBlameDetails,
  getFileContentAtCommit,
  getFileGitLog,
  getGitBranches,
  getGitDiff,
  getGitLog,
  getGitStatus,
  GitFileStatus,
  getWhatsNewFileDiff,
  getWhatsNewSummary,
  isGitRepo,
  mergeGitBranch,
  pullGitRepo,
  syncGit,
} from "../../utils/git.js";
import { parseRepoRef, resolveRepoDirPath } from "../../utils/repo-ref.js";
import { recordAuditEvent } from "../audit/audit-chain.service.js";
import { eventsService } from "../events/events.service.js";
import { prsService } from "../prs/prs.service.js";
import { workspaceService } from "../workspace/workspace.service.js";
import { draftsTrashService } from "./drafts-trash.service.js";

interface RepoPRItem {
  id?: string | number;
  title?: string;
  description?: string;
  branch?: string;
  target_branch?: string;
  status?: string;
  merged_at?: string;
  updated_at?: string;
  author?: unknown;
  created_at?: string;
  approvals?: unknown[];
  [key: string]: unknown;
}

export class GitService {
  private getRepoDir(repoName?: string, ownerParam?: string): string {
    const cfg = loadConfig();
    const activeRepoName = repoName || cfg.active_repo?.name || "local";
    const effectiveOwner =
      ownerParam ||
      (cfg.active_repo?.name === activeRepoName
        ? cfg.active_repo?.owner
        : undefined);
    return resolveRepoDir(activeRepoName, effectiveOwner);
  }

  async clone(payload: { repo: string; owner?: string; remote_url?: string }) {
    const cfg = loadConfig();
    const ref = parseRepoRef(
      payload.repo,
      payload.owner || cfg.active_repo?.owner || cfg.user?.login,
    );
    if (!ref) {
      throw new Error(
        `Identificador de repositório inválido para clone: ${payload.repo}`,
      );
    }

    const repoDir = resolveRepoDirPath(ref);
    let remoteUrl = payload.remote_url;
    if (!remoteUrl) {
      remoteUrl = `https://github.com/${ref.owner}/${ref.repo}.git`;
    }

    const res = await cloneGitRepo(
      repoDir,
      remoteUrl,
      cfg.token,
      cfg.user,
      (p) => {
        eventsService.broadcast("repo_progress", {
          repo: ref.repo,
          owner: ref.owner,
          ...p,
        });
      },
    );
    if (res.success) {
      workspaceService.invalidateTreeCache(ref.repo);
      eventsService.broadcast("repo_progress", {
        repo: ref.repo,
        owner: ref.owner,
        stage: "Concluído",
        percent: 100,
      });
    }
    return {
      ...res,
      repo_dir: repoDir,
      owner: ref.owner,
      repo: ref.repo,
      is_cloned_locally: res.success,
    };
  }

  async pull(repoNameParam?: string, branch?: string, ownerParam?: string) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);
    const res = await pullGitRepo(repoDir, branch, cfg.token, (p) => {
      eventsService.broadcast("repo_progress", {
        repo: repoName,
        owner: ownerParam,
        ...p,
      });
    });
    if (res.success) {
      workspaceService.invalidateTreeCache(repoName);
      eventsService.broadcast("repo_progress", {
        repo: repoName,
        owner: ownerParam,
        stage: "Concluído",
        percent: 100,
      });
    }
    return res;
  }

  async checkRemote(
    repoNameParam?: string,
    branch?: string,
    ownerParam?: string,
  ) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);
    if (!(await isGitRepo(repoDir))) {
      return { hasUpdates: false, isCloned: false };
    }
    return await checkRemoteGitUpdates(repoDir, branch);
  }

  async getStatus(repoNameParam?: string, ownerParam?: string) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);
    const repoObj =
      cfg.repos?.find((r: any) => r.name === repoName) ||
      (cfg.active_repo?.name === repoName
        ? cfg.active_repo
        : { name: repoName, full_name: repoName, is_local: true });

    if (!(await isGitRepo(repoDir))) {
      return {
        repo_name: repoName,
        active_repo: repoObj,
        isRepo: false,
        isCloned: false,
        branch: "none",
        ahead: 0,
        behind: 0,
        isClean: true,
        files: [],
        systemFiles: [],
      };
    }

    const status = await getGitStatus(repoDir);
    return {
      repo_name: repoName,
      active_repo: repoObj,
      isCloned: true,
      ...status,
    };
  }

  async getDiff(
    filePath?: string,
    repoNameParam?: string,
    ownerParam?: string,
  ) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);
    if (!(await isGitRepo(repoDir))) {
      return { diff: "", isClean: true };
    }
    return await getGitDiff(repoDir, filePath);
  }

  async getLog(
    limit: number = 20,
    repoNameParam?: string,
    ownerParam?: string,
  ) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);
    if (!(await isGitRepo(repoDir))) {
      return { repo_name: repoName, commits: [] };
    }
    const commits = await getGitLog(repoDir, limit);
    return { repo_name: repoName, commits };
  }

  async getFileHistory(
    filePath: string,
    limit: number = 30,
    repoNameParam?: string,
    ownerParam?: string,
  ) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);
    if (!(await isGitRepo(repoDir))) {
      return { repo_name: repoName, file_path: filePath, commits: [] };
    }
    const commits = await getFileGitLog(repoDir, filePath, limit);
    return { repo_name: repoName, file_path: filePath, commits };
  }

  async getFileVersion(
    filePath: string,
    commitHash: string,
    repoNameParam?: string,
    ownerParam?: string,
  ) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);
    if (!(await isGitRepo(repoDir))) {
      return { content: "" };
    }
    return await getFileContentAtCommit(repoDir, filePath, commitHash);
  }

  async getBranches(repoNameParam?: string, ownerParam?: string) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);
    if (!(await isGitRepo(repoDir))) {
      return { current: "main", branches: ["main"] };
    }
    return await getGitBranches(repoDir);
  }

  async switchOrCreateBranch(
    branchName: string,
    repoNameParam?: string,
    ownerParam?: string,
    baseBranch?: string,
    displayTitle?: string,
  ) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);
    if (!(await isGitRepo(repoDir))) {
      throw new Error(`Repositório ${repoName} não está clonado localmente.`);
    }
    const res = await createAndCheckoutBranch(
      repoDir,
      branchName,
      baseBranch,
      displayTitle,
    );
    if (res.success && displayTitle?.trim()) {
      await executeGit(
        ["config", `branch.${branchName}.title`, displayTitle.trim()],
        repoDir,
      ).catch(() => {});
    }
    workspaceService.invalidateTreeCache(repoName);
    return res;
  }

  async commit(
    message: string,
    files?: string[],
    _userLogin?: string,
    repo?: string,
    ownerParam?: string,
  ) {
    const cfg = loadConfig();
    const repoName = repo || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);
    if (!(await isGitRepo(repoDir))) {
      throw new Error(`Repositório ${repoName} não está clonado localmente.`);
    }

    const res = await commitChanges(repoDir, message, files);
    workspaceService.invalidateTreeCache(repoName);
    return res;
  }

  async sync(branch?: string, repoNameParam?: string, ownerParam?: string) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);
    if (!(await isGitRepo(repoDir))) {
      throw new Error(`Repositório ${repoName} não está clonado localmente.`);
    }

    const repoObj =
      cfg.repos?.find((r: any) => r.name === repoName) ||
      (cfg.active_repo?.name === repoName ? cfg.active_repo : undefined);
    const targetBranch = branch || repoObj?.default_branch || "main";

    const result = await syncGit(repoDir, "origin", targetBranch);
    workspaceService.invalidateTreeCache(repoName);

    if (result.success) {
      try {
        await recordAuditEvent(repoName, {
          eventType: "GIT_SYNC_PUSH",
          user: cfg.user?.login || "developer",
          payload: { branch: targetBranch, repo: repoName },
        });
      } catch (auditErr) {
        console.warn(
          "[GitService] Falha ao registrar evento de auditoria no sync:",
          auditErr,
        );
      }
    }

    try {
      const status = await getGitStatus(repoDir);
      if (status.isClean && (!status.files || status.files.length === 0)) {
        clearWorkspaceChanges(repoName);
      }
    } catch {}

    return result;
  }

  async getBlame(
    filePath: string,
    repoNameParam?: string,
    ownerParam?: string,
  ) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);
    if (!(await isGitRepo(repoDir))) {
      return { lines: [] };
    }
    return await getFileBlameDetails(repoDir, filePath);
  }

  async getWhatsNew(
    lastSeenHash?: string,
    repoNameParam?: string,
    ownerParam?: string,
  ) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);
    if (!(await isGitRepo(repoDir))) {
      return { hasNewUpdates: false, files: [] };
    }
    return await getWhatsNewSummary(repoDir, lastSeenHash);
  }

  async getWhatsNewDiff(
    filePath: string,
    lastSeenHash?: string,
    repoNameParam?: string,
    ownerParam?: string,
  ) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);
    if (!(await isGitRepo(repoDir))) {
      return { diff: "" };
    }
    return await getWhatsNewFileDiff(repoDir, filePath, lastSeenHash);
  }

  async mergeBranch(payload: {
    sourceBranch: string;
    targetBranch?: string;
    message?: string;
    repo?: string;
    owner?: string;
  }) {
    const cfg = loadConfig();
    const repoName = payload.repo || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, payload.owner);
    if (!(await isGitRepo(repoDir))) {
      throw new Error(`Repositório ${repoName} não está clonado localmente.`);
    }

    const res = await mergeGitBranch(
      repoDir,
      payload.sourceBranch,
      payload.targetBranch,
      payload.message,
    );
    if (res.success) {
      workspaceService.invalidateTreeCache(repoName);
    }
    return res;
  }

  async getVersionGraph(
    repoNameParam?: string,
    ownerParam?: string,
    options?: { fetchRemote?: boolean },
  ) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);

    const isTargetActive = !repoNameParam || cfg.active_repo?.name === repoNameParam;
    const repoObj =
      cfg.repos?.find((r) => r?.name === repoName) ||
      (isTargetActive ? cfg.active_repo : undefined);
    const configuredDefault = repoObj?.default_branch || (isTargetActive ? cfg.active_repo?.default_branch : undefined);

    if (!(await isGitRepo(repoDir))) {
      const fallbackDefault = configuredDefault || "main";
      return {
        repo: repoName,
        defaultBranch: fallbackDefault,
        currentBranch: fallbackDefault,
        headHash: "",
        isDetached: false,
        uncommittedFiles: [],
        stashes: [],
        commits: [],
        mainCommits: [],
        nodes: [
          {
            name: fallbackDefault,
            displayName: "Principal",
            isCurrent: true,
            isDefault: true,
            type: "main" as const,
            proposal: undefined,
            lastCommit: undefined,
            ahead: 0,
            behind: 0,
          },
        ],
      };
    }

    if (options?.fetchRemote) {
      try {
        await executeGit(["fetch", "--prune"], repoDir);
      } catch {}
    }

    let defaultBranch = configuredDefault || (await getDefaultBranch(repoDir));

    // 1. Estado atual do HEAD (hash real + branch simbólica ou "HEAD" se desacoplado)
    const [headHashRes, symRefRes, statusRes, stashRes, refsRes, configRes, dagRes] =
      await Promise.all([
        executeGit(["rev-parse", "HEAD"], repoDir),
        executeGit(["symbolic-ref", "-q", "--short", "HEAD"], repoDir),
        getGitStatus(repoDir).catch(() => null),
        executeGit(["stash", "list", "--format=%gd|%s|%cI"], repoDir),
        executeGit(
          [
            "for-each-ref",
            "--format=%(refname:short)|%(objectname)|%(authordate:iso-strict)|%(authorname)|%(contents:subject)",
            "refs/heads/",
          ],
          repoDir,
        ),
        executeGit(["config", "--get-regexp", "^branch\\..*\\.(parent|title)$"], repoDir),
        executeGit(
          ["log", "--all", "--topo-order", "-n", "200", "--format=%H|%h|%P|%an|%cI|%s"],
          repoDir,
        ),
      ]);

    const headHash = headHashRes.success ? headHashRes.stdout.trim() : "";
    const symBranch = symRefRes.success ? symRefRes.stdout.trim() : "";
    const isDetached = Boolean(headHash && !symBranch);
    const currentBranch = isDetached ? "HEAD" : symBranch || defaultBranch;
    const currentStatusFiles: GitFileStatus[] = statusRes?.files || [];

    // 2. Stashes
    const stashes: Array<{ id: string; message: string; date: string }> = [];
    if (stashRes.success && stashRes.stdout.trim()) {
      for (const line of stashRes.stdout.trim().split("\n").filter(Boolean)) {
        const [id, message, date] = line.split("|");
        stashes.push({ id, message: message || "", date: date || "" });
      }
    }

    // 3. Configs de título e parentesco das branches
    const branchConfigParents = new Map<string, string>();
    const branchConfigTitles = new Map<string, string>();
    if (configRes.success && configRes.stdout.trim()) {
      for (const line of configRes.stdout.trim().split("\n")) {
        const mParent = line.match(/^branch\.(.+)\.parent\s+(.+)$/);
        if (mParent) branchConfigParents.set(mParent[1].trim(), mParent[2].trim());
        const mTitle = line.match(/^branch\.(.+)\.title\s+(.+)$/);
        if (mTitle) branchConfigTitles.set(mTitle[1].trim(), mTitle[2].trim());
      }
    }

    // 4. PRs do repositório (opcional, para enriquecer metadados de propostas)
    let repoPRs: RepoPRItem[] = [];
    try {
      repoPRs = prsService.loadRepoPRs(repoName) || [];
    } catch {}

    // 5. Pontas de todas as branches locais (refs/heads/*)
    const branchTips = new Map<
      string,
      {
        hash: string;
        shortHash: string;
        author: string;
        date: string;
        message: string;
      }
    >();
    if (refsRes.success && refsRes.stdout.trim()) {
      for (const line of refsRes.stdout.trim().split("\n").filter(Boolean)) {
        const parts = line.split("|");
        if (parts.length >= 4) {
          const [ref, hash, date, author, ...msgParts] = parts;
          branchTips.set(ref, {
            hash,
            shortHash: hash.slice(0, 7),
            author: author || "Git",
            date: date || "",
            message: msgParts.join("|") || "Commit",
          });
        }
      }
    }

    // Ajusta a defaultBranch caso o repositório use outra convenção local
    if (branchTips.size > 0 && !branchTips.has(defaultBranch)) {
      if (branchTips.has("main")) defaultBranch = "main";
      else if (branchTips.has("master")) defaultBranch = "master";
      else if (symBranch && branchTips.has(symBranch)) defaultBranch = symBranch;
      else defaultBranch = branchTips.keys().next().value || defaultBranch;
    } else if (branchTips.size === 0 && headHash) {
      branchTips.set(defaultBranch, {
        hash: headHash,
        shortHash: headHash.slice(0, 7),
        author: "Git",
        date: new Date().toISOString(),
        message: "Commit inicial",
      });
    }

    // 6. Parse do DAG real de commits (git log --all --topo-order)
    interface RawCommit {
      hash: string;
      shortHash: string;
      parents: string[];
      author: string;
      date: string;
      message: string;
    }
    const rawCommits: RawCommit[] = [];
    const commitByHash = new Map<string, RawCommit>();

    if (dagRes.success && dagRes.stdout.trim()) {
      for (const line of dagRes.stdout.trim().split("\n").filter(Boolean)) {
        const parts = line.split("|");
        const hash = parts[0] || "";
        const shortHash = parts[1] || hash.slice(0, 7);
        const parents = (parts[2] || "").trim().split(/\s+/).filter(Boolean);
        const author = parts[3] || "Git";
        const date = parts[4] || "";
        const message = parts.slice(5).join("|") || "Commit";
        const item: RawCommit = { hash, shortHash, parents, author, date, message };
        rawCommits.push(item);
        commitByHash.set(hash, item);
      }
    }

    // 7. Linhagem da branch Principal (first-parent a partir da ponta da main)
    const mainTipHash = branchTips.get(defaultBranch)?.hash || headHash;
    const mainCommits: Array<{
      hash: string;
      shortHash: string;
      author: string;
      date: string;
      message: string;
    }> = [];
    const mainAncestors = new Set<string>();
    const mergeBySecondParent = new Map<string, { hash: string; date: string }>();

    let cursor = mainTipHash;
    while (cursor && commitByHash.has(cursor) && !mainAncestors.has(cursor)) {
      mainAncestors.add(cursor);
      const c = commitByHash.get(cursor)!;
      mainCommits.push({
        hash: c.hash,
        shortHash: c.shortHash,
        author: c.author,
        date: c.date,
        message: c.message,
      });
      if (c.parents.length > 1) {
        for (let i = 1; i < c.parents.length; i++) {
          mergeBySecondParent.set(c.parents[i], { hash: c.hash, date: c.date });
        }
      }
      cursor = c.parents[0] || "";
    }

    // Todos os commits alcançáveis a partir da main (incluindo commits trazidos por merge)
    const reachableFromMain = new Set<string>();
    if (mainTipHash && commitByHash.has(mainTipHash)) {
      const stack = [mainTipHash];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        if (reachableFromMain.has(cur)) continue;
        reachableFromMain.add(cur);
        const c = commitByHash.get(cur);
        if (c) {
          for (const p of c.parents) {
            if (!reachableFromMain.has(p)) stack.push(p);
          }
        }
      }
    }

    // Helper para nome amigável de branch
    const resolveDisplayName = (branch: string, isDefault: boolean, pr?: RepoPRItem): string => {
      if (isDefault) return "Principal";
      if (branchConfigTitles.has(branch)) return branchConfigTitles.get(branch)!;
      if (pr?.title) return pr.title.trim();
      return branch;
    };

    // 8. Construção dos nós de branches a partir do DAG em memória
    const branchNames = Array.from(branchTips.keys());
    const nodes = branchNames.map((branch) => {
      const isDefault = branch === defaultBranch;
      const isCurrent = !isDetached && branch === currentBranch;
      const tip = branchTips.get(branch)!;
      const pr = repoPRs.find((p) => p.branch === branch && p.status !== "DELETED");

      const displayName = resolveDisplayName(branch, isDefault, pr);
      const cfgParent = branchConfigParents.get(branch);
      const parentBranch = isDefault
        ? undefined
        : cfgParent && branchTips.has(cfgParent) && cfgParent !== branch
          ? cfgParent
          : defaultBranch;

      // Commits exclusivos da branch (caminhando pelo first-parent até tocar na linhagem da main)
      const branchCommits: Array<{
        hash: string;
        shortHash: string;
        author: string;
        date: string;
        message: string;
      }> = [];
      let baseHash = isDefault ? "" : mainTipHash;
      let baseDate = "";

      if (!isDefault && tip.hash) {
        let cur = tip.hash;
        const seen = new Set<string>();
        while (cur && !seen.has(cur)) {
          seen.add(cur);
          if (mainAncestors.has(cur)) {
            baseHash = cur;
            baseDate = commitByHash.get(cur)?.date || "";
            break;
          }
          const c = commitByHash.get(cur);
          if (!c) break;
          branchCommits.push({
            hash: c.hash,
            shortHash: c.shortHash,
            author: c.author,
            date: c.date,
            message: c.message,
          });
          cur = c.parents[0] || "";
        }
      }

      // Verifica se esta branch foi mesclada na Principal
      const hasMergedPR = repoPRs.some((p) => p.branch === branch && p.status === "MERGED");
      const directMerge = mergeBySecondParent.get(tip.hash);
      const wasMergedIntoMain =
        !isDefault &&
        (hasMergedPR ||
          Boolean(directMerge) ||
          (reachableFromMain.has(tip.hash) && !mainAncestors.has(tip.hash)));

      const branchStashes = stashes.filter(
        (s) =>
          s.message.includes(`(${branch} ->`) ||
          s.message.includes(`On ${branch}:`) ||
          s.message.includes(`contexos:auto:${branch}`),
      );

      return {
        name: branch,
        displayName,
        parentDisplayName: isDefault
          ? undefined
          : parentBranch === defaultBranch
            ? "Principal"
            : branchConfigTitles.get(parentBranch || "") || parentBranch,
        isCurrent,
        isDefault,
        type: (isDefault ? "main" : pr ? "proposal" : "draft") as "main" | "proposal" | "draft",
        parentBranch,
        proposal: pr
          ? {
              id: pr.id,
              title: pr.title,
              description: pr.description || "",
              status: pr.status,
              author: pr.author,
              created_at: pr.created_at,
              approvals_count: Array.isArray(pr.approvals) ? pr.approvals.length : 0,
            }
          : undefined,
        lastCommit: tip,
        commits: isDefault ? mainCommits : branchCommits,
        ahead: isDefault ? 0 : branchCommits.length,
        behind: 0,
        isMerged: wasMergedIntoMain,
        mergedDate: directMerge?.date || "",
        mergeCommitHash: directMerge?.hash || "",
        baseHash,
        baseDate,
        hasStash: branchStashes.length > 0,
        stashes: branchStashes,
        uncommittedFiles: isCurrent ? currentStatusFiles : [],
      };
    });

    nodes.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });

    // 9. Anexa as pílulas de branches diretamente aos commits do DAG
    const branchesByCommit = new Map<
      string,
      Array<{
        name: string;
        displayName: string;
        isDefault: boolean;
        isCurrent: boolean;
        isMerged: boolean;
      }>
    >();

    for (const n of nodes) {
      const targetHash = n.lastCommit?.hash;
      if (!targetHash) continue;
      const list = branchesByCommit.get(targetHash) || [];
      list.push({
        name: n.name,
        displayName: n.isDefault ? "Principal" : n.displayName || n.name,
        isDefault: n.isDefault,
        isCurrent: n.isCurrent,
        isMerged: Boolean(n.isMerged),
      });
      branchesByCommit.set(targetHash, list);
    }

    const commits = rawCommits.map((c) => ({
      hash: c.hash,
      shortHash: c.shortHash,
      parents: c.parents,
      author: c.author,
      date: c.date,
      message: c.message,
      isHead: c.hash === headHash,
      isMainTip: c.hash === mainTipHash,
      isMainLineage: mainAncestors.has(c.hash),
      branches: branchesByCommit.get(c.hash) || [],
    }));

    return {
      repo: repoName,
      defaultBranch,
      currentBranch,
      headHash,
      isDetached,
      uncommittedFiles: currentStatusFiles,
      stashes,
      commits,
      mainCommits,
      nodes,
    };
  }

  async safeSwitch(payload: {
    branch?: string;
    commitHash?: string;
    repo?: string;
    action?: "check" | "switch" | "stash" | "discard";
    owner?: string;
  }) {
    const cfg = loadConfig();
    const repoName = payload.repo || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, payload.owner);
    if (!(await isGitRepo(repoDir))) {
      throw new Error(`Repositório ${repoName} não está clonado localmente.`);
    }

    const rawTarget = payload.commitHash || payload.branch;
    if (!rawTarget) {
      throw new Error(
        "Nome da versão (branch) ou hash do commit é obrigatório.",
      );
    }

    // Se payload.branch foi especificado, é SEMPRE uma branch (mesmo que o nome contenha apenas hexadecimais como 'bbbbbbb')
    // Se apenas payload.commitHash foi informado, é um commit
    const isCommit = !payload.branch && Boolean(payload.commitHash);
    const targetRef = isCommit
      ? assertCommitish(rawTarget, "Commit")
      : assertBranchName(rawTarget, "Branch");

    const status = await getGitStatus(repoDir);
    const userFiles = status.files || [];
    const isClean = userFiles.length === 0;
    const action = payload.action || "check";

    const switchTarget = async () => {
      // Destrava arquivos transitórios de controle interno (.spec-memory/workspace_changes.json)
      // que possam colidir durante o checkout se já tiverem sido commitados em alguma branch
      const wsChangesPath = path.join(
        repoDir,
        ".spec-memory",
        "workspace_changes.json",
      );
      let wsChangesBackup: string | null = null;
      if (fs.existsSync(wsChangesPath)) {
        try {
          wsChangesBackup = fs.readFileSync(wsChangesPath, "utf-8");
          fs.unlinkSync(wsChangesPath);
        } catch {}
      }

      try {
        if (isCommit) {
          const coRes = await executeGit(["checkout", targetRef], repoDir);
          if (!coRes.success) {
            throw new Error(
              coRes.stderr || `Falha ao alternar para o marco ${targetRef}.`,
            );
          }
        } else {
          const res = await createAndCheckoutBranch(repoDir, targetRef);
          if (!res.success) {
            throw new Error(
              res.message || `Falha ao alternar para a versão ${targetRef}.`,
            );
          }
        }
      } finally {
        if (wsChangesBackup && !fs.existsSync(wsChangesPath)) {
          try {
            fs.writeFileSync(wsChangesPath, wsChangesBackup, "utf-8");
          } catch {}
        }
      }
    };

    if (action === "check") {
      return {
        canSwitch: isClean,
        hasUncommitted: !isClean,
        changedCount: userFiles.length,
        files: userFiles,
        currentBranch: status.branch || "main",
        targetBranch: isCommit ? undefined : targetRef,
        targetCommit: isCommit ? targetRef : undefined,
      };
    }

    if (action === "stash") {
      if (!isClean) {
        const fromBranch = status.branch || "desconhecida";
        const stashMsg = `Auto-stash Contexos (${fromBranch} -> ${targetRef})`;
        await executeGit(["stash", "push", "-u", "-m", stashMsg], repoDir);
      }
      await switchTarget();
      workspaceService.invalidateTreeCache(repoName);
      return {
        success: true,
        message: isCommit
          ? `Alternado para o marco ${targetRef.slice(0, 7)}. Rascunhos guardados com segurança.`
          : `Alternado para a versão ${targetRef}. Rascunhos guardados com segurança.`,
        stashed: !isClean,
        branch: isCommit ? undefined : targetRef,
        commitHash: isCommit ? targetRef : undefined,
      };
    }

    if (action === "discard") {
      // Salvar na lixeira permanente antes de descartar
      try {
        const diffRes = await executeGit(["diff", "HEAD"], repoDir);
        let patch = diffRes.stdout || "";
        for (const uf of userFiles.filter(
          (f) => f.status === "A" || f.status === "U" || f.status === "??",
        )) {
          const filePath = path.join(repoDir, uf.path);
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, "utf-8");
            patch +=
              `\n--- /dev/null\n+++ b/${uf.path}\n@@ -0,0 +1,${content.split("\n").length} @@\n` +
              content
                .split("\n")
                .map((l) => `+${l}`)
                .join("\n");
          }
        }
        if (patch.trim()) {
          await draftsTrashService.moveToTrash(
            {
              fromBranch: status.branch || "Principal",
              source: "safe_switch",
              message: `Alterações descartadas ao alternar para ${targetRef}`,
              files: userFiles.map((f) => ({ path: f.path, status: f.status })),
              patch,
            },
            repoName,
            payload.owner,
          );
        }
      } catch (err) {
        console.warn(
          "[GitService] Falha ao arquivar rascunho descartado na lixeira:",
          err,
        );
      }

      await executeGit(["reset", "--hard", "HEAD"], repoDir);
      await executeGit(["clean", "-fd"], repoDir);
      try {
        clearWorkspaceChanges(repoName);
      } catch {}
      await switchTarget();
      workspaceService.invalidateTreeCache(repoName);
      return {
        success: true,
        message: isCommit
          ? `Alterações movidas para a lixeira e alternado para o marco ${targetRef.slice(0, 7)}.`
          : `Alterações movidas para a lixeira e alternado para a versão ${targetRef}.`,
        discarded: true,
        branch: isCommit ? undefined : targetRef,
        commitHash: isCommit ? targetRef : undefined,
      };
    }

    // action === 'switch'
    if (!isClean) {
      return {
        success: false,
        hasUncommitted: true,
        error: `Existem ${userFiles.length} alterações não salvas no repositório. Escolha salvar como marco (commit), guardar no stash ou descartar antes de alternar.`,
        changedCount: userFiles.length,
        files: userFiles,
      };
    }

    await switchTarget();
    workspaceService.invalidateTreeCache(repoName);
    return {
      success: true,
      message: isCommit
        ? `Alternado para o marco ${targetRef.slice(0, 7)}.`
        : `Alternado para a versão ${targetRef}.`,
      branch: isCommit ? undefined : targetRef,
      commitHash: isCommit ? targetRef : undefined,
    };
  }

  async popStash(
    repoNameParam?: string,
    stashId?: string,
    ownerParam?: string,
  ) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);
    if (!(await isGitRepo(repoDir))) {
      throw new Error(`Repositório ${repoName} não está clonado localmente.`);
    }

    const args = ["stash", "pop"];
    if (stashId) {
      args.push(stashId);
    }
    const res = await executeGit(args, repoDir);
    workspaceService.invalidateTreeCache(repoName);
    return {
      success: res.success,
      message: res.success
        ? "Rascunhos restaurados com sucesso."
        : res.stderr || "Erro ao restaurar rascunhos.",
    };
  }

  async getStashDetails(
    repoNameParam?: string,
    stashId = "stash@{0}",
    ownerParam?: string,
  ) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);
    if (!(await isGitRepo(repoDir))) {
      throw new Error(`Repositório ${repoName} não está clonado localmente.`);
    }

    const listRes = await executeGit(
      ["stash", "list", "--format=%gd|%s|%cI"],
      repoDir,
    );
    let message = "";
    let date = "";
    let fromBranch = "Principal";
    let targetBranch = "";

    if (listRes.success && listRes.stdout) {
      const line =
        listRes.stdout.split("\n").find((l) => l.startsWith(stashId)) ||
        listRes.stdout.split("\n")[0];
      if (line) {
        const [, msg, dt] = line.split("|");
        message = msg || "";
        date = dt || "";

        const match = message.match(/\((.+?) -> (.+?)\)/);
        if (match) {
          fromBranch = match[1];
          targetBranch = match[2];
        } else {
          const match2 = message.match(/On (.+?):/);
          if (match2) fromBranch = match2[1];
        }
      }
    }

    // Obter numstat
    const numstatRes = await executeGit(
      ["stash", "show", "--numstat", stashId],
      repoDir,
    );
    const files: Array<{ path: string; additions: number; deletions: number }> =
      [];
    if (numstatRes.success && numstatRes.stdout) {
      numstatRes.stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .forEach((l) => {
          const [add, del, filePath] = l.split("\t");
          files.push({
            additions: parseInt(add, 10) || 0,
            deletions: parseInt(del, 10) || 0,
            path: filePath || l,
          });
        });
    }

    return {
      id: stashId,
      message,
      date,
      fromBranch,
      targetBranch,
      fileCount: files.length,
      files,
    };
  }

  async dropStash(
    repoNameParam?: string,
    stashId?: string,
    ownerParam?: string,
  ) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);
    if (!(await isGitRepo(repoDir))) {
      throw new Error(`Repositório ${repoName} não está clonado localmente.`);
    }

    // Arquivar na lixeira antes de descartar
    try {
      const targetStash = stashId || "stash@{0}";
      const patchRes = await executeGit(
        ["stash", "show", "-p", targetStash],
        repoDir,
      );
      const patch = patchRes.success ? patchRes.stdout || "" : "";

      const numstatRes = await executeGit(
        ["stash", "show", "--numstat", targetStash],
        repoDir,
      );
      const files: Array<{
        path: string;
        additions?: number;
        deletions?: number;
      }> = [];
      if (numstatRes.success && numstatRes.stdout) {
        numstatRes.stdout
          .trim()
          .split("\n")
          .filter(Boolean)
          .forEach((l) => {
            const [add, del, p] = l.split("\t");
            files.push({
              additions: parseInt(add, 10) || 0,
              deletions: parseInt(del, 10) || 0,
              path: p || l,
            });
          });
      }

      let fromBranch = "Principal";
      const listRes = await executeGit(
        ["stash", "list", "--format=%gd|%s|%cI"],
        repoDir,
      );
      if (listRes.success && listRes.stdout) {
        const line =
          listRes.stdout.split("\n").find((l) => l.startsWith(targetStash)) ||
          listRes.stdout.split("\n")[0];
        if (line) {
          const [, msg] = line.split("|");
          const m1 = msg?.match(/\((.+?) ->/);
          if (m1 && m1[1]) fromBranch = m1[1];
          else {
            const m2 = msg?.match(/On (.+?):/);
            if (m2 && m2[1]) fromBranch = m2[1];
          }
        }
      }

      if (patch.trim()) {
        await draftsTrashService.moveToTrash(
          {
            fromBranch,
            source: "stash",
            message: `Rascunho guardado (${targetStash}) descartado`,
            files,
            patch,
          },
          repoName,
          ownerParam,
        );
      }
    } catch (err) {
      console.warn(
        "[GitService] Falha ao mover stash descartado para lixeira:",
        err,
      );
    }

    const args = ["stash", "drop"];
    if (stashId) {
      args.push(stashId);
    }
    const res = await executeGit(args, repoDir);
    workspaceService.invalidateTreeCache(repoName);
    return {
      success: res.success,
      message: res.success
        ? "Rascunho movido para a lixeira com sucesso."
        : res.stderr || "Erro ao descartar rascunho.",
    };
  }

  async clearStashes(repoNameParam?: string, ownerParam?: string) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);
    if (!(await isGitRepo(repoDir))) {
      throw new Error(`Repositório ${repoName} não está clonado localmente.`);
    }

    const res = await executeGit(["stash", "clear"], repoDir);
    workspaceService.invalidateTreeCache(repoName);
    return {
      success: res.success,
      message: res.success
        ? "Todos os rascunhos guardados no stash foram limpos."
        : res.stderr || "Erro ao limpar stashes.",
    };
  }

  async getGitVersion() {
    const res = await executeGit(["--version"], process.cwd());
    return {
      version: res.stdout || "Git não encontrado",
      installed: res.success,
    };
  }
}

export const gitService = new GitService();

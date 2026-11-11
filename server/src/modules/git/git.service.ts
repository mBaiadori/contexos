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
    const res = await createAndCheckoutBranch(repoDir, branchName, baseBranch);
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

  async getVersionGraph(repoNameParam?: string, ownerParam?: string) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);

    const defaultBranch = cfg.active_repo?.default_branch || "main";

    if (!(await isGitRepo(repoDir))) {
      return {
        repo: repoName,
        defaultBranch,
        currentBranch: defaultBranch,
        nodes: [
          {
            name: defaultBranch,
            displayName: "Versão Oficial",
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

    // Tenta sincronizar referências remotas do GitHub rapidamente se houver remote configurado
    try {
      await executeGit(["fetch", "--prune"], repoDir);
    } catch {}

    const branchesData = await getGitBranches(repoDir);
    const currentBranch = branchesData.current || defaultBranch;
    const branchNames = branchesData.branches || [currentBranch];

    let currentStatusFiles: GitFileStatus[] = [];
    try {
      const st = await getGitStatus(repoDir);
      currentStatusFiles = st.files || [];
    } catch {}

    let stashes: Array<{ id: string; message: string; date: string }> = [];
    try {
      const stashRes = await executeGit(
        ["stash", "list", "--format=%gd|%s|%cI"],
        repoDir,
      );
      if (stashRes.success && stashRes.stdout.trim()) {
        stashes = stashRes.stdout
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [id, message, date] = line.split("|");
            return { id, message: message || "", date: date || "" };
          });
      }
    } catch {}

    let repoPRs: RepoPRItem[] = [];
    try {
      repoPRs = prsService.loadRepoPRs(repoName) || [];
    } catch {}

    // Obter histórico de commits da branch Principal para a timeline completa
    let mainCommits: Array<{
      hash: string;
      shortHash: string;
      author: string;
      date: string;
      message: string;
    }> = [];
    try {
      const commitsRes = await executeGit(
        ["log", "-30", "--format=%H|%h|%an|%cI|%s", defaultBranch],
        repoDir,
      );
      if (commitsRes.success && commitsRes.stdout.trim()) {
        mainCommits = commitsRes.stdout
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const parts = line.split("|");
            return {
              hash: parts[0],
              shortHash: parts[1],
              author: parts[2],
              date: parts[3],
              message: parts.slice(4).join("|") || "Commit",
            };
          });
      }
    } catch {}

    let mergedBranches = new Set<string>();
    try {
      const mergedRes = await executeGit(
        ["branch", "--merged", defaultBranch],
        repoDir,
      );
      if (mergedRes.success && mergedRes.stdout.trim()) {
        mergedBranches = new Set(
          mergedRes.stdout
            .split("\n")
            .map((l) => l.replace("*", "").trim())
            .filter(Boolean),
        );
      }
    } catch {}

    // 1. Otimização em Massa: Últimos commits de todas as branches em 1 único comando
    const branchLastCommits = new Map<
      string,
      { hash: string; shortHash: string; author: string; date: string; message: string }
    >();
    try {
      const refRes = await executeGit(
        [
          "for-each-ref",
          "--format=%(refname:short)|%(objectname)|%(authordate:iso-strict)|%(authorname)|%(contents:subject)",
          "refs/heads/",
        ],
        repoDir,
      );
      if (refRes.success && refRes.stdout.trim()) {
        refRes.stdout
          .trim()
          .split("\n")
          .forEach((line) => {
            const parts = line.split("|");
            if (parts.length >= 4) {
              const [ref, hash, date, author, ...msgParts] = parts;
              branchLastCommits.set(ref, {
                hash,
                shortHash: hash.slice(0, 7),
                author: author || "Git",
                date: date || "",
                message: msgParts.join("|") || "Sem mensagem",
              });
            }
          });
      }
    } catch {}

    // 2. Otimização em Massa: Todas as configs branch.<name>.parent e branch.<name>.title em comandos únicos
    const branchConfigParents = new Map<string, string>();
    const branchConfigTitles = new Map<string, string>();
    try {
      const cfgRes = await executeGit(
        ["config", "--get-regexp", "^branch\\..*\\.parent$"],
        repoDir,
      );
      if (cfgRes.success && cfgRes.stdout.trim()) {
        cfgRes.stdout
          .trim()
          .split("\n")
          .forEach((line) => {
            const match = line.match(/^branch\.(.+)\.parent\s+(.+)$/);
            if (match) {
              branchConfigParents.set(match[1].trim(), match[2].trim());
            }
          });
      }

      const titlesRes = await executeGit(
        ["config", "--get-regexp", "^branch\\..*\\.title$"],
        repoDir,
      );
      if (titlesRes.success && titlesRes.stdout.trim()) {
        titlesRes.stdout
          .trim()
          .split("\n")
          .forEach((line) => {
            const match = line.match(/^branch\.(.+)\.title\s+(.+)$/);
            if (match) {
              branchConfigTitles.set(match[1].trim(), match[2].trim());
            }
          });
      }
    } catch {}

    // 3. Otimização em Massa: Commits de merge no tronco em 1 único comando
    const mergeCommitsByBranch = new Map<
      string,
      { hash: string; date: string; message: string }
    >();
    try {
      const mergesRes = await executeGit(
        ["log", "--merges", "-100", "--format=%H|%cI|%s", defaultBranch],
        repoDir,
      );
      if (mergesRes.success && mergesRes.stdout.trim()) {
        mergesRes.stdout
          .trim()
          .split("\n")
          .forEach((line) => {
            const parts = line.split("|");
            if (parts.length >= 3) {
              const [mHash, mDate, ...msgParts] = parts;
              const msg = msgParts.join("|") || "";
              branchNames.forEach((bName) => {
                if (bName !== defaultBranch && !mergeCommitsByBranch.has(bName)) {
                  if (
                    msg.includes(`'${bName}'`) ||
                    msg.includes(`"${bName}"`) ||
                    msg.includes(` ${bName} `) ||
                    msg.endsWith(` ${bName}`)
                  ) {
                    mergeCommitsByBranch.set(bName, { hash: mHash, date: mDate, message: msg });
                  }
                }
              });
            }
          });
      }
    } catch {}

    // Cache em memória para merge-base simétricos e datas de commits
    const mergeBaseCache = new Map<string, string>();
    const getMergeBase = async (a: string, b: string): Promise<string> => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (mergeBaseCache.has(key)) return mergeBaseCache.get(key)!;
      try {
        const res = await executeGit(["merge-base", a, b], repoDir);
        const hash = res.success ? res.stdout.trim() : "";
        mergeBaseCache.set(key, hash);
        return hash;
      } catch {
        mergeBaseCache.set(key, "");
        return "";
      }
    };

    const commitDateCache = new Map<string, string>();
    mainCommits.forEach((mc) => {
      if (mc.hash && mc.date) commitDateCache.set(mc.hash, mc.date);
    });

    const getCommitDate = async (hash: string): Promise<string> => {
      if (!hash) return "";
      if (commitDateCache.has(hash)) return commitDateCache.get(hash)!;
      try {
        const bdRes = await executeGit(["log", "-1", "--format=%cI", hash], repoDir);
        const d = bdRes.success ? bdRes.stdout.trim() : "";
        commitDateCache.set(hash, d);
        return d;
      } catch {
        return "";
      }
    };

    // 4. Processamento Concorrente com Promise.all (elimina o gargalo sequencial)
    const rawNodes = await Promise.all(
      branchNames.map(async (rawName) => {
        let branch = rawName;
        try {
          branch = assertBranchName(rawName);
        } catch {
          return null;
        }

        const isCurrent = branch === currentBranch;
        const isDefault = branch === defaultBranch;

        let baseHash = "";
        let baseDate = "";
        if (!isDefault) {
          baseHash = await getMergeBase(defaultBranch, branch);
          if (baseHash) {
            baseDate = await getCommitDate(baseHash);
          }
        }

        // Stashes vinculados a esta versão
        const branchStashes = stashes.filter(
          (s) =>
            s.message.includes(`(${branch} ->`) ||
            s.message.includes(`On ${branch}:`) ||
            (isCurrent && s.id === "stash@{0}"),
        );
        const hasStash = branchStashes.length > 0;

        // Obter último commit (do cache de for-each-ref ou fallback para log -1)
        let lastCommit = branchLastCommits.get(branch);
        if (!lastCommit) {
          try {
            const logRes = await executeGit(
              ["log", "-1", "--format=%H|%h|%an|%cI|%s", branch],
              repoDir,
            );
            if (logRes.success && logRes.stdout.trim()) {
              const parts = logRes.stdout.trim().split("|");
              if (parts.length >= 4) {
                lastCommit = {
                  hash: parts[0],
                  shortHash: parts[1],
                  author: parts[2],
                  date: parts[3],
                  message: parts.slice(4).join("|") || "Sem mensagem",
                };
              }
            }
          } catch {}
        }

        // Localizar proposta associada
        const pr = repoPRs.find(
          (p: RepoPRItem) => p.branch === branch && p.status !== "DELETED",
        );

        let type: "main" | "proposal" | "draft" = "draft";
        if (isDefault) {
          type = "main";
        } else if (pr) {
          type = "proposal";
        }

        // Descobrir a versão pai (parentBranch) de forma rápida e segura
        let parentBranch: string | undefined = undefined;
        if (!isDefault) {
          // 1. Config de branch
          const cfgParent = branchConfigParents.get(branch);
          if (cfgParent) {
            if (branchNames.includes(cfgParent)) {
              parentBranch = cfgParent;
            } else if (/^[0-9a-f]{7,40}$/i.test(cfgParent)) {
              parentBranch = defaultBranch;
            } else {
              parentBranch = cfgParent;
            }
          }

          // 2. Proposta (PR)
          if (!parentBranch && pr?.target_branch) {
            parentBranch = pr.target_branch;
          }

          // 3. Correspondência de prefixo de nome
          if (!parentBranch) {
            const candidates = branchNames
              .filter(
                (other) =>
                  other !== branch &&
                  other !== defaultBranch &&
                  (branch.startsWith(`${other}-`) ||
                    branch.startsWith(`${other}/`)),
              )
              .sort((a, b) => b.length - a.length);
            if (candidates.length > 0) {
              parentBranch = candidates[0];
            }
          }

          // 4. Se ainda não achou, checar se divergiu de outra branch existente via merge-base (amostra dos mais relevantes)
          if (!parentBranch) {
            let bestCandidate: string | null = null;
            let bestTimestamp = 0;

            const candidateSample = branchNames
              .filter((other) => other !== branch && other !== defaultBranch)
              .slice(0, 5);

            for (const other of candidateSample) {
              const mbHash = await getMergeBase(other, branch);
              if (mbHash && mbHash !== baseHash) {
                const dStr = await getCommitDate(mbHash);
                const ts = dStr ? new Date(dStr).getTime() : 0;
                if (ts > bestTimestamp) {
                  bestTimestamp = ts;
                  bestCandidate = other;
                }
              }
            }

            parentBranch = bestCandidate || defaultBranch;
          }
        }

        // Calcular ahead/behind
        let ahead = 0;
        let behind = 0;
        let branchCommits: Array<{
          hash: string;
          shortHash: string;
          author: string;
          date: string;
          message: string;
        }> = [];

        if (!isDefault) {
          const compareBase =
            parentBranch && parentBranch !== defaultBranch
              ? parentBranch
              : defaultBranch;
          try {
            const countRes = await executeGit(
              [
                "rev-list",
                "--left-right",
                "--count",
                `${compareBase}...${branch}`,
              ],
              repoDir,
            );
            if (countRes.success && countRes.stdout.trim()) {
              const [bStr, aStr] = countRes.stdout.trim().split(/\s+/);
              behind = parseInt(bStr, 10) || 0;
              ahead = parseInt(aStr, 10) || 0;
            }
          } catch {}

          // Obter o ponto exato de divergência entre a branch e a sua branch-mãe (ou defaultBranch)
          let forkPoint = "";
          if (parentBranch && parentBranch !== defaultBranch) {
            forkPoint = await getMergeBase(parentBranch, branch);
          }
          if (!forkPoint) {
            forkPoint = baseHash || (await getMergeBase(defaultBranch, branch));
          }

          // Atualiza baseHash e baseDate para refletir o ponto real de ramificação na árvore
          if (forkPoint) {
            baseHash = forkPoint;
            baseDate = await getCommitDate(forkPoint);
          }

          // Buscar TODOS os commits pertencentes ESPECIFICAMENTE a esta branch desde a divergência
          let logCmd: string[] = [];
          if (forkPoint) {
            logCmd = ["log", "-50", "--format=%H|%h|%an|%cI|%s", `${forkPoint}..${branch}`];
          } else if (parentBranch && parentBranch !== defaultBranch) {
            logCmd = ["log", "-50", "--format=%H|%h|%an|%cI|%s", `${parentBranch}..${branch}`];
          } else {
            logCmd = ["log", "-50", "--format=%H|%h|%an|%cI|%s", `${branch}`, "--not", `${defaultBranch}`];
          }

          try {
            const bCommitsRes = await executeGit(logCmd, repoDir);
            if (bCommitsRes.success && bCommitsRes.stdout.trim()) {
              branchCommits = bCommitsRes.stdout
                .trim()
                .split("\n")
                .filter(Boolean)
                .map((line) => {
                  const parts = line.split("|");
                  return {
                    hash: parts[0],
                    shortHash: parts[1],
                    author: parts[2],
                    date: parts[3],
                    message: parts.slice(4).join("|") || "Commit",
                  };
                });
            }
          } catch {}

          // Fallback adicional caso logCmd não retorne nada mas a branch tenha commits próprios
          if (branchCommits.length === 0) {
            try {
              const fallbackRes = await executeGit(
                ["log", "-30", "--format=%H|%h|%an|%cI|%s", branch],
                repoDir,
              );
              if (fallbackRes.success && fallbackRes.stdout.trim()) {
                const recentAll = fallbackRes.stdout
                  .trim()
                  .split("\n")
                  .filter(Boolean)
                  .map((line) => {
                    const parts = line.split("|");
                    return {
                      hash: parts[0],
                      shortHash: parts[1],
                      author: parts[2],
                      date: parts[3],
                      message: parts.slice(4).join("|") || "Commit",
                    };
                  });
                const excludedHashes = new Set<string>(mainCommits.map((mc) => mc.hash));
                if (forkPoint) excludedHashes.add(forkPoint);
                const onlyBranch = recentAll.filter((c) => !excludedHashes.has(c.hash));
                if (onlyBranch.length > 0) {
                  branchCommits = onlyBranch;
                }
              }
            } catch {}
          }

          if (branchCommits.length === 0 && lastCommit) {
            branchCommits = [lastCommit];
          }

          if (branchCommits.length > 0) {
            ahead = branchCommits.length;
          }
        }

        // Identifica se foi unida/mergeada
        const hasMergedPR = repoPRs.some(
          (p: RepoPRItem) => p.branch === branch && p.status === "MERGED",
        );
        const mergeInfo = mergeCommitsByBranch.get(branch);
        const isMerged = !isDefault && (hasMergedPR || Boolean(mergeInfo));
        let mergedDate = "";
        let mergeCommitHash = "";

        if (isMerged) {
          if (hasMergedPR) {
            const mergedPR = repoPRs.find(
              (p: RepoPRItem) => p.branch === branch && p.status === "MERGED",
            );
            mergedDate = mergedPR?.merged_at || mergedPR?.updated_at || "";
          }
          if (!mergedDate && mergeInfo) {
            mergedDate = mergeInfo.date;
            mergeCommitHash = mergeInfo.hash;
          }
        }

        // Resolução do Nome Semântico Humano (displayName)
        let displayName = branch;
        if (isDefault) {
          displayName = "Versão Oficial";
        } else if (pr?.title) {
          // Limpa prefixos técnicos de propostas (Conventional Commits e merges)
          displayName = pr.title
            .replace(/^(\[?(PR|pr|pull request|pull|pr#|pr-)[\s#:]*\d+\]?[:\s-]*)/i, "")
            .replace(/^(merge pull request #\d+ from [^\n]+|merge branch [^\n]+)/i, "")
            .replace(/^(feat|fix|docs|chore|refactor|test|style)(\([^)]+\))?:\s*/i, "")
            .trim() || pr.title;
          displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
        } else if (branchConfigTitles.has(branch)) {
          displayName = branchConfigTitles.get(branch)!;
        } else if (/^prop-\d+-/i.test(branch)) {
          // Fallback para propostas antigas sem título: prop-1-ajuste-contrato -> Ajuste contrato
          const rawSlug = branch.replace(/^prop-\d+-/i, "");
          const clean = rawSlug.replace(/[-_]+/g, " ").trim();
          displayName = clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : branch;
        } else if (/^galho-/i.test(branch)) {
          const rawSlug = branch.replace(/^galho-/i, "");
          displayName = `Versão ${rawSlug}`;
        } else if (branch.includes("-") || branch.includes("_")) {
          const clean = branch.replace(/[-_]+/g, " ").trim();
          displayName = clean.charAt(0).toUpperCase() + clean.slice(1);
        }

        return {
          name: branch,
          displayName,
          parentDisplayName: undefined as string | undefined, // Preenchido no pós-processamento com todos os nós
          isCurrent,
          isDefault,
          type,
          parentBranch,
          proposal: pr
            ? {
                id: pr.id,
                title: pr.title,
                description: pr.description || "",
                status: pr.status,
                author: pr.author,
                created_at: pr.created_at,
                approvals_count: Array.isArray(pr.approvals)
                  ? pr.approvals.length
                  : 0,
              }
            : undefined,
          lastCommit,
          commits: isDefault ? mainCommits : branchCommits,
          ahead,
          behind,
          isMerged,
          mergedDate,
          mergeCommitHash,
          baseHash,
          baseDate,
          hasStash,
          stashes: branchStashes,
          uncommittedFiles: isCurrent ? currentStatusFiles : [],
        };
      }),
    );

    const nodes = rawNodes.filter((n): n is NonNullable<typeof n> => Boolean(n));

    // Preenche o parentDisplayName semântico para cada nó
    const nodeMap = new Map<string, string>();
    nodes.forEach((n) => nodeMap.set(n.name, n.displayName || n.name));

    for (const node of nodes) {
      if (node.isDefault) {
        node.parentDisplayName = undefined;
      } else if (node.parentBranch) {
        node.parentDisplayName =
          node.parentBranch === defaultBranch
            ? "Principal"
            : nodeMap.get(node.parentBranch) || node.parentBranch;
      }
    }

    // Garantir que a árvore de parentBranch não contenha ciclos (DAG estrito convergindo para defaultBranch)
    for (const node of nodes) {
      if (node.isDefault) continue;
      const chain = new Set<string>([node.name]);
      let curr = node.parentBranch;
      while (curr && curr !== defaultBranch) {
        if (chain.has(curr)) {
          // Ciclo detectado! Quebra a dependência circular apontando para defaultBranch
          node.parentBranch = defaultBranch;
          break;
        }
        chain.add(curr);
        const parentNode = nodes.find((n) => n.name === curr);
        curr = parentNode ? parentNode.parentBranch : defaultBranch;
      }
    }

    // Ordenação amigável: Versão Principal no topo, seguida por propostas abertas, rascunhos e outras
    nodes.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      if (a.type === "proposal" && b.type !== "proposal") return -1;
      if (b.type === "proposal" && a.type !== "proposal") return 1;
      return a.name.localeCompare(b.name);
    });

    return {
      repo: repoName,
      defaultBranch,
      currentBranch,
      stashes,
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
      throw new Error("Nome da versão (branch) ou hash do commit é obrigatório.");
    }

    const isCommit = Boolean(payload.commitHash || /^[0-9a-f]{7,40}$/i.test(rawTarget));
    const targetRef = isCommit
      ? assertCommitish(rawTarget, "Commit")
      : assertBranchName(rawTarget, "Branch");

    const status = await getGitStatus(repoDir);
    const userFiles = status.files || [];
    const isClean = userFiles.length === 0;
    const action = payload.action || "check";

    const switchTarget = async () => {
      if (isCommit) {
        const coRes = await executeGit(["checkout", targetRef], repoDir);
        if (!coRes.success) {
          throw new Error(coRes.stderr || `Falha ao alternar para o marco ${targetRef}.`);
        }
      } else {
        await createAndCheckoutBranch(repoDir, targetRef);
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
        console.warn("[GitService] Falha ao arquivar rascunho descartado na lixeira:", err);
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
        listRes.stdout
          .split("\n")
          .find((l) => l.startsWith(stashId)) ||
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
      const patchRes = await executeGit(["stash", "show", "-p", targetStash], repoDir);
      const patch = patchRes.success ? patchRes.stdout || "" : "";

      const numstatRes = await executeGit(["stash", "show", "--numstat", targetStash], repoDir);
      const files: Array<{ path: string; additions?: number; deletions?: number }> = [];
      if (numstatRes.success && numstatRes.stdout) {
        numstatRes.stdout.trim().split("\n").filter(Boolean).forEach((l) => {
          const [add, del, p] = l.split("\t");
          files.push({
            additions: parseInt(add, 10) || 0,
            deletions: parseInt(del, 10) || 0,
            path: p || l,
          });
        });
      }

      let fromBranch = "Principal";
      const listRes = await executeGit(["stash", "list", "--format=%gd|%s|%cI"], repoDir);
      if (listRes.success && listRes.stdout) {
        const line = listRes.stdout.split("\n").find((l) => l.startsWith(targetStash)) || listRes.stdout.split("\n")[0];
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
      console.warn("[GitService] Falha ao mover stash descartado para lixeira:", err);
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

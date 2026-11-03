import { resolveRepoDir } from "../../config/constants.js";
import { clearWorkspaceChanges, loadConfig } from "../../config/storage.js";
import { assertBranchName } from "../../utils/git-validate.js";
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
  ) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, ownerParam);
    if (!(await isGitRepo(repoDir))) {
      throw new Error(`Repositório ${repoName} não está clonado localmente.`);
    }
    const res = await createAndCheckoutBranch(repoDir, branchName, baseBranch);
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

    const branchesData = await getGitBranches(repoDir);
    const currentBranch = branchesData.current || defaultBranch;
    const branchNames = branchesData.branches || [currentBranch];

    let currentStatusFiles: any[] = [];
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

    let repoPRs: any[] = [];
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

    const nodes = [];

    for (const rawName of branchNames) {
      let branch = rawName;
      try {
        branch = assertBranchName(rawName);
      } catch {
        continue;
      }

      const isCurrent = branch === currentBranch;
      const isDefault = branch === defaultBranch;

      let baseHash = "";
      let baseDate = "";
      if (!isDefault) {
        try {
          const baseRes = await executeGit(
            ["merge-base", defaultBranch, branch],
            repoDir,
          );
          if (baseRes.success) {
            baseHash = baseRes.stdout.trim();
            if (baseHash) {
              const bdRes = await executeGit(
                ["log", "-1", "--format=%cI", baseHash],
                repoDir,
              );
              if (bdRes.success) {
                baseDate = bdRes.stdout.trim();
              }
            }
          }
        } catch {}
      }

      // Stashes vinculados a esta versão
      const branchStashes = stashes.filter(
        (s) =>
          s.message.includes(`(${branch} ->`) ||
          s.message.includes(`On ${branch}:`) ||
          (isCurrent && s.id === "stash@{0}"),
      );
      const hasStash = branchStashes.length > 0;

      // Obter último commit
      let lastCommit:
        | {
            hash: string;
            shortHash: string;
            author: string;
            date: string;
            message: string;
          }
        | undefined = undefined;

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

      // Localizar proposta associada
      const pr = repoPRs.find(
        (p: any) => p.branch === branch && p.status !== "DELETED",
      );

      let type: "main" | "proposal" | "draft" = "draft";
      if (isDefault) {
        type = "main";
      } else if (pr) {
        type = "proposal";
      }

      // Descobrir a versão pai (parentBranch) antes do cálculo de ahead/behind
      let parentBranch: string | undefined = undefined;
      if (!isDefault) {
        // 1. Prioridade: verificar se há no git config
        try {
          const cfgParentRes = await executeGit(
            ["config", `branch.${branch}.parent`],
            repoDir,
          );
          if (cfgParentRes.success && cfgParentRes.stdout.trim()) {
            const rawParent = cfgParentRes.stdout.trim();
            if (branchNames.includes(rawParent)) {
              parentBranch = rawParent;
            } else if (/^[0-9a-f]{7,40}$/i.test(rawParent)) {
              // Se foi bifurcada de um commit hash do tronco, o pai é o defaultBranch
              parentBranch = defaultBranch;
            } else {
              parentBranch = rawParent;
            }
          }
        } catch {}

        // 2. Se não achou no config, verificar proposta (PR) associada
        if (!parentBranch && pr?.target_branch) {
          parentBranch = pr.target_branch;
        }

        // 3. Se ainda não achou, checar se o nome sugere herança direta (ex: gov/update-3317-derivada de gov/update-3317)
        // Prioriza o prefixo mais longo para pegar o pai imediato em cadeias profundas
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

        // 4. Se ainda não achou, checar se divergiu de outra branch existente via merge-base
        if (!parentBranch) {
          let bestCandidate: string | null = null;
          let bestTimestamp = 0;

          for (const other of branchNames) {
            if (other === branch || other === defaultBranch) continue;
            try {
              const mbRes = await executeGit(
                ["merge-base", other, branch],
                repoDir,
              );
              if (mbRes.success && mbRes.stdout.trim()) {
                const mbHash = mbRes.stdout.trim();
                if (mbHash && mbHash !== baseHash) {
                  const timeRes = await executeGit(
                    ["log", "-1", "--format=%ct", mbHash],
                    repoDir,
                  );
                  if (timeRes.success) {
                    const ts = parseInt(timeRes.stdout.trim(), 10) || 0;
                    if (ts > bestTimestamp) {
                      bestTimestamp = ts;
                      bestCandidate = other;
                    }
                  }
                }
              }
            } catch {}
          }

          parentBranch = bestCandidate || defaultBranch;
        }
      }

      // Calcular ahead/behind em relação à branch pai ou branch padrão
      let ahead = 0;
      let behind = 0;
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
      }

      // Identifica se foi unida/mergeada à Principal:
      // Apenas se tiver PR com status MERGED ou commit de merge explícito no tronco citando a branch
      const hasMergedPR = repoPRs.some(
        (p: any) => p.branch === branch && p.status === "MERGED",
      );
      let explicitMergeDate = "";
      if (!isDefault && !hasMergedPR) {
        try {
          const mergeLog = await executeGit(
            [
              "log",
              "-1",
              "--merges",
              `--grep=Merge.*${branch}`,
              "--format=%cI",
              defaultBranch,
            ],
            repoDir,
          );
          if (mergeLog.success && mergeLog.stdout.trim()) {
            explicitMergeDate = mergeLog.stdout.trim();
          }
        } catch {}
      }

      const isMerged =
        !isDefault && (hasMergedPR || Boolean(explicitMergeDate));

      let mergedDate = "";
      if (isMerged) {
        if (hasMergedPR) {
          const mergedPR = repoPRs.find(
            (p: any) => p.branch === branch && p.status === "MERGED",
          );
          mergedDate = mergedPR?.merged_at || mergedPR?.updated_at || "";
        }
        if (!mergedDate && explicitMergeDate) {
          mergedDate = explicitMergeDate;
        }
      }

      nodes.push({
        name: branch,
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
        ahead,
        behind,
        isMerged,
        mergedDate,
        baseHash,
        baseDate,
        hasStash,
        stashes: branchStashes,
        uncommittedFiles: isCurrent ? currentStatusFiles : [],
      });
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
    branch: string;
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

    const targetBranch = assertBranchName(payload.branch);
    const status = await getGitStatus(repoDir);
    const userFiles = status.files || [];
    const isClean = userFiles.length === 0;
    const action = payload.action || "check";

    if (action === "check") {
      return {
        canSwitch: isClean,
        hasUncommitted: !isClean,
        changedCount: userFiles.length,
        files: userFiles,
        currentBranch: status.branch || "main",
        targetBranch,
      };
    }

    if (action === "stash") {
      if (!isClean) {
        const fromBranch = status.branch || "desconhecida";
        const stashMsg = `Auto-stash Context OS (${fromBranch} -> ${targetBranch})`;
        await executeGit(["stash", "push", "-u", "-m", stashMsg], repoDir);
      }
      await createAndCheckoutBranch(repoDir, targetBranch);
      workspaceService.invalidateTreeCache(repoName);
      return {
        success: true,
        message: `Alternado para a versão ${targetBranch}. Rascunhos guardados com segurança.`,
        stashed: !isClean,
        branch: targetBranch,
      };
    }

    if (action === "discard") {
      await executeGit(["reset", "--hard", "HEAD"], repoDir);
      await executeGit(["clean", "-fd"], repoDir);
      try {
        clearWorkspaceChanges(repoName);
      } catch {}
      await createAndCheckoutBranch(repoDir, targetBranch);
      workspaceService.invalidateTreeCache(repoName);
      return {
        success: true,
        message: `Alterações descartadas e alternado para a versão ${targetBranch}.`,
        discarded: true,
        branch: targetBranch,
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

    await createAndCheckoutBranch(repoDir, targetBranch);
    workspaceService.invalidateTreeCache(repoName);
    return {
      success: true,
      message: `Alternado para a versão ${targetBranch}.`,
      branch: targetBranch,
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

    const args = ["stash", "drop"];
    if (stashId) {
      args.push(stashId);
    }
    const res = await executeGit(args, repoDir);
    workspaceService.invalidateTreeCache(repoName);
    return {
      success: res.success,
      message: res.success
        ? "Rascunho descartado com sucesso."
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

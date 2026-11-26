import path from "node:path";
import { resolveRepoDir } from "../../config/constants.js";
import { loadConfig } from "../../config/storage.js";
import { executeGit, getActiveBearerToken } from "../../utils/git.js";
import { assertBranchName } from "../../utils/git-validate.js";
import { prWorktreeService } from "./pr-worktree.service.js";
import { prSecurityService } from "./pr-security.service.js";
import { mergePlaintext3Way } from "../../utils/crypto.js";

export interface PRConflictStatus {
  mergeable: boolean;
  behind_by: number;
  ahead_by: number;
  conflicts: Array<{
    path: string;
    is_encrypted: boolean;
  }>;
}

/**
 * Interpreta a saída do `git merge-tree --write-tree --name-only` em múltiplos cenários
 * (content, add/add, modify/delete, rename/delete, binários).
 */
export function parseMergeTreeConflictPaths(stdout: string, stderr: string): string[] {
  const paths = new Set<string>();
  const stdoutLines = (stdout || "").split(/\r?\n/);

  // Com `--write-tree --name-only`, a linha 0 é o OID da árvore resultante e as linhas
  // subsequentes até a primeira linha em branco são os caminhos exatos em conflito.
  if (stdoutLines.length > 1 && /^[0-9a-f]{40}$/i.test(stdoutLines[0].trim())) {
    for (let i = 1; i < stdoutLines.length; i++) {
      const line = stdoutLines[i].trim();
      if (!line) break;
      if (!line.startsWith("CONFLICT ") && !line.startsWith("Auto-merging ")) {
        paths.add(line);
      }
    }
  }

  // Fallback/complemento via linhas CONFLICT (...) em stdout/stderr
  const combined = `${stdout || ""}\n${stderr || ""}`.split(/\r?\n/);
  for (const rawLine of combined) {
    const line = rawLine.trim();
    if (!line.startsWith("CONFLICT")) continue;

    const mergeIn = line.match(/Merge conflict in (.+)$/);
    if (mergeIn?.[1]) {
      paths.add(mergeIn[1].trim());
      continue;
    }

    const modDel = line.match(/^CONFLICT \([^)]+\):\s+(.+?)\s+(?:deleted in|modified in|added in|renamed)/);
    if (modDel?.[1]) {
      paths.add(modDel[1].trim());
      continue;
    }

    const genericIn = line.match(/in (.+)$/);
    if (genericIn?.[1]) {
      paths.add(genericIn[1].trim());
    }
  }

  return Array.from(paths);
}

export class PRConflictsService {
  private resolveRemoteTarget(repoName: string) {
    const cfg = loadConfig();
    const repoObj =
      cfg.repos?.find((r) => r?.name === repoName) ||
      (cfg.active_repo?.name === repoName ? cfg.active_repo : undefined);
    const activeToken = getActiveBearerToken(cfg.token);
    const isRemoteGitHub = Boolean(
      cfg.authenticated &&
        activeToken &&
        repoObj?.full_name &&
        !repoObj?.is_local,
    );
    return { cfg, repoObj, activeToken, isRemoteGitHub };
  }

  private getRepoDir(repoName?: string): string {
    const cfg = loadConfig();
    const activeRepoName = repoName || cfg.active_repo?.name || "local";
    const matchedRepo = cfg.repos?.find((r) => r?.name === activeRepoName);
    const effectiveOwner =
      cfg.active_repo?.name === activeRepoName
        ? cfg.active_repo?.owner
        : matchedRepo?.owner;
    return resolveRepoDir(activeRepoName, effectiveOwner);
  }

  async checkConflicts(
    repoName: string,
    pr: { id: number | string; branch: string; target_branch?: string },
  ): Promise<PRConflictStatus> {
    const repoDir = this.getRepoDir(repoName);
    const branch = pr.branch ? assertBranchName(pr.branch) : "";
    const targetBranch = pr.target_branch
      ? assertBranchName(pr.target_branch)
      : "main";

    if (!branch) {
      return { mergeable: true, behind_by: 0, ahead_by: 0, conflicts: [] };
    }

    // Check commits behind / ahead
    let behind_by = 0;
    let ahead_by = 0;
    const countBehind = await executeGit(
      ["rev-list", "--count", `${branch}..${targetBranch}`],
      repoDir,
    );
    if (countBehind.success && countBehind.stdout) {
      behind_by = parseInt(countBehind.stdout.trim(), 10) || 0;
    }

    const countAhead = await executeGit(
      ["rev-list", "--count", `${targetBranch}..${branch}`],
      repoDir,
    );
    if (countAhead.success && countAhead.stdout) {
      ahead_by = parseInt(countAhead.stdout.trim(), 10) || 0;
    }

    // Run merge-tree to test if clean merge is possible
    const conflicts: Array<{ path: string; is_encrypted: boolean }> = [];
    const mergeTreeRes = await executeGit(
      ["merge-tree", "--write-tree", "--name-only", targetBranch, branch],
      repoDir,
    );

    if (
      !mergeTreeRes.success ||
      mergeTreeRes.stderr.includes("CONFLICT") ||
      mergeTreeRes.stdout.includes("CONFLICT")
    ) {
      const uniqueConflictPaths = parseMergeTreeConflictPaths(
        mergeTreeRes.stdout,
        mergeTreeRes.stderr,
      );
      for (const p of uniqueConflictPaths) {
        conflicts.push({
          path: p,
          is_encrypted: false,
        });
      }
    }

    return {
      mergeable: mergeTreeRes.success && conflicts.length === 0,
      behind_by,
      ahead_by,
      conflicts,
    };
  }

  async getConflictBundle(
    repoName: string,
    pr: { id: number | string; branch: string; target_branch?: string },
    filePath: string,
    userLogin?: string,
  ) {
    const cfg = loadConfig();
    const login = userLogin || cfg.user?.login || 'local_user';
    const repoDir = this.getRepoDir(repoName);
    const branch = assertBranchName(pr.branch);
    const targetBranch = pr.target_branch
      ? assertBranchName(pr.target_branch)
      : "main";

    // Verify clearance
    const clearance = await prSecurityService.resolveDocClearance(
      repoName,
      login,
      filePath,
      branch,
    );
    if (!clearance.allowed) {
      throw new Error(
        `Acesso negado: Você não possui autorização (clearance) para visualizar o documento restrito '${filePath}'.`,
      );
    }

    // Find common merge-base ancestor
    const baseRes = await executeGit(
      ["merge-base", targetBranch, branch],
      repoDir,
    );
    const mergeBaseHash = baseRes.success
      ? (baseRes.stdout || "").trim()
      : targetBranch;

    const baseText = await prSecurityService.readPlainAtRef(
      repoName,
      mergeBaseHash,
      filePath,
      login,
    );
    const oursText = await prSecurityService.readPlainAtRef(
      repoName,
      branch,
      filePath,
      login,
    );
    const theirsText = await prSecurityService.readPlainAtRef(
      repoName,
      targetBranch,
      filePath,
      login,
    );

    const mergeResult = await mergePlaintext3Way(
      baseText,
      oursText,
      theirsText,
      {
        ours: `Esta Proposta (${pr.branch})`,
        base: `Versão Base (${mergeBaseHash.slice(0, 7)})`,
        theirs: `Versão Oficial (${targetBranch})`,
      },
    );

    return {
      filePath,
      hasConflict: mergeResult.hasConflicts,
      hasConflicts: mergeResult.hasConflicts,
      mergedContent: mergeResult.mergedContent,
      merged: mergeResult.mergedContent,
      oursContent: oursText,
      ours: oursText,
      theirsContent: theirsText,
      theirs: theirsText,
      baseContent: baseText,
      base: baseText,
      conflictMarkersCount: mergeResult.conflictCount,
      conflictCount: mergeResult.conflictCount,
    };
  }

  async resolveFileConflict(
    repoName: string,
    pr: { id: number | string; branch: string },
    filePath: string,
    resolvedContent: string,
    userLogin?: string,
  ): Promise<{ success: boolean; commitHash: string }> {
    const cfg = loadConfig();
    const login = userLogin || cfg.user?.login || 'local_user';

    // Clearance check
    const clearance = await prSecurityService.resolveDocClearance(
      repoName,
      login,
      filePath,
      pr.branch,
    );
    if (!clearance.allowed) {
      throw new Error(
        `Acesso negado: Você não possui autorização para resolver conflitos no documento restrito '${filePath}'.`,
      );
    }

    const wtDir = await prWorktreeService.ensurePRWorktree(repoName, pr);

    // Save plaintext file in worktree
    await prWorktreeService.writePlainAtWorktree(
      wtDir,
      filePath,
      resolvedContent,
    );

    // Commit and push
    const commitMsg = `fix(conflict): resolver conflito no arquivo ${filePath} no PR #${pr.id}`;
    const result = await prWorktreeService.commitAndPushWorktree(
      wtDir,
      pr.branch,
      commitMsg,
      login,
      repoName,
    );

    return {
      success: true,
      commitHash: result.commitHash,
    };
  }

  async syncWithTargetBranch(
    repoName: string,
    pr: { id: number | string; branch: string; target_branch?: string },
    userLogin?: string,
  ): Promise<{ success: boolean; message: string; newCommitHash?: string }> {
    const { cfg, activeToken, isRemoteGitHub } = this.resolveRemoteTarget(repoName);
    const _login = userLogin || cfg.user?.login || 'local_user';
    const repoDir = this.getRepoDir(repoName);
    const branch = assertBranchName(pr.branch);
    const targetBranch = pr.target_branch
      ? assertBranchName(pr.target_branch)
      : "main";

    const wtDir = await prWorktreeService.ensurePRWorktree(repoName, pr);

    // Fetch target branch e utiliza origin/<targetBranch> quando disponível no remoto
    let mergeSourceRef = targetBranch;
    if (isRemoteGitHub && activeToken) {
      const fetchRes = await executeGit(
        [
          "fetch",
          "origin",
          `${targetBranch}:refs/remotes/origin/${targetBranch}`,
        ],
        repoDir,
        activeToken,
      );
      if (fetchRes.success) {
        const remoteRefCheck = await executeGit(
          ["rev-parse", "--verify", `refs/remotes/origin/${targetBranch}`],
          repoDir,
        );
        if (remoteRefCheck.success) {
          mergeSourceRef = `origin/${targetBranch}`;
        }
      }
    }

    const mergeRes = await executeGit(
      [
        "-C",
        wtDir,
        "merge",
        mergeSourceRef,
        "-m",
        `chore(sync): atualizar branch do PR #${pr.id} com a versão oficial (${targetBranch})`,
      ],
      repoDir,
    );

    if (!mergeRes.success) {
      const isConflict =
        mergeRes.stderr.includes("CONFLICT") ||
        mergeRes.stdout.includes("CONFLICT");
      await executeGit(["-C", wtDir, "merge", "--abort"], repoDir).catch(
        () => {},
      );
      if (isConflict) {
        throw new Error(
          `Existem conflitos entre a branch do PR e a branch '${targetBranch}'. Utilize a resolução de conflitos.`,
        );
      }
      throw new Error(
        `Falha ao sincronizar branch do PR #${pr.id} com '${targetBranch}': ${mergeRes.stderr || mergeRes.stdout}`,
      );
    }

    const hashRes = await executeGit(
      ["-C", wtDir, "rev-parse", "HEAD"],
      repoDir,
    );
    const newCommitHash = (hashRes.stdout || "").trim();

    // Push updated branch (falha explícita se não sincronizar com o GitHub)
    if (isRemoteGitHub && activeToken) {
      const pushRes = await executeGit(
        ["-C", wtDir, "push", "origin", branch],
        repoDir,
        activeToken,
      );
      if (!pushRes.success) {
        throw new Error(
          `Branch sincronizada localmente (${newCommitHash.slice(0, 7)}), mas falhou ao enviar para o GitHub: ${pushRes.stderr || pushRes.stdout}`,
        );
      }
    }

    return {
      success: true,
      message: `Branch do PR #${pr.id} sincronizada com sucesso a partir de '${targetBranch}'.`,
      newCommitHash,
    };
  }

  async getMergeability(
    repoName: string,
    pr: { id: number | string; branch: string; target_branch?: string },
  ): Promise<PRConflictStatus> {
    return this.checkConflicts(repoName, pr);
  }

  async resolveConflict(
    repoName: string,
    pr: { id: number | string; branch: string },
    filePath: string,
    resolvedContent: string,
    userLogin?: string,
  ) {
    return this.resolveFileConflict(
      repoName,
      pr,
      filePath,
      resolvedContent,
      userLogin,
    );
  }

  async updateFromBase(
    repoName: string,
    pr: { id: number | string; branch: string; target_branch?: string },
    userLogin?: string,
  ) {
    return this.syncWithTargetBranch(repoName, pr, userLogin);
  }
}

export const prConflictsService = new PRConflictsService();

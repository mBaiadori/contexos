import fs from "node:fs";
import path from "node:path";
import {
  executeGit,
  isGitRepo,
  getActiveBearerToken,
  ensureGitIgnore,
  TRANSIENT_INDEX_PATHS,
} from "./git.js";
import { assertGitPath } from "./git-validate.js";

export interface HealOptions {
  token?: string | null;
  unshallowIfNeeded?: boolean;
}

export interface HealResult {
  healed: boolean;
  actions: string[];
}

/**
 * Garante a integridade e saúde do repositório Git local.
 * Desfaz estados travados (merge/rebase pendente), remove arquivos de controle
 * do index, desfaz conflitos residuais em arquivos do sistema e faz unshallow sob demanda.
 */
export async function healRepositoryState(
  repoDir: string,
  options: HealOptions = {},
): Promise<HealResult> {
  const actions: string[] = [];
  if (!repoDir || !(await isGitRepo(repoDir))) {
    return { healed: false, actions };
  }

  const gitDir = path.join(repoDir, ".git");

  // 1. Garante .gitignore com padrões obrigatórios para arquivos transitórios
  try {
    ensureGitIgnore(repoDir);
  } catch {}

  // 1b. Desindexa arquivos transitórios que tenham sido rastreados indevidamente no index do Git
  try {
    const lsTransient = await executeGit(
      ["ls-files", "--", ...TRANSIENT_INDEX_PATHS],
      repoDir,
    );
    if (lsTransient.success && lsTransient.stdout.trim().length > 0) {
      await executeGit(
        ["rm", "--cached", "-r", "--ignore-unmatch", ...TRANSIENT_INDEX_PATHS],
        repoDir,
      ).catch(() => {});
      actions.push("unstaged_transient_files");
    }
  } catch {}

  // 2. Aborta merge travado (.git/MERGE_HEAD)
  if (fs.existsSync(path.join(gitDir, "MERGE_HEAD"))) {
    await executeGit(["merge", "--abort"], repoDir).catch(() => {});
    actions.push("aborted_in_progress_merge");
  }

  // 3. Aborta rebase / cherry-pick travado
  if (
    fs.existsSync(path.join(gitDir, "rebase-merge")) ||
    fs.existsSync(path.join(gitDir, "rebase-apply"))
  ) {
    await executeGit(["rebase", "--abort"], repoDir).catch(() => {});
    actions.push("aborted_in_progress_rebase");
  }
  if (fs.existsSync(path.join(gitDir, "CHERRY_PICK_HEAD"))) {
    await executeGit(["cherry-pick", "--abort"], repoDir).catch(() => {});
    actions.push("aborted_in_progress_cherry_pick");
  }

  // 4. Verifica e limpa caminhos não mesclados (unmerged paths) que travam checkout
  try {
    const unmergedRes = await executeGit(["diff", "--name-only", "--diff-filter=U"], repoDir);
    if (unmergedRes.success && unmergedRes.stdout.trim().length > 0) {
      const conflictingFiles = unmergedRes.stdout
        .trim()
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean);

      for (const f of conflictingFiles) {
        if (f === ".docs.metadata.json" || f === ".gitignore") {
          const safeF = assertGitPath(f);
          await executeGit(["checkout", "--ours", "--", safeF], repoDir).catch(() => {});
          await executeGit(["add", "--", safeF], repoDir).catch(() => {});
          actions.push(`auto_resolved_system_conflict:${f}`);
        }
      }

      // Se ainda houver conflito não resolvido no index, dá reset seguro no index
      const remainingUnmerged = await executeGit(["diff", "--name-only", "--diff-filter=U"], repoDir);
      if (remainingUnmerged.success && remainingUnmerged.stdout.trim().length > 0) {
        await executeGit(["reset", "HEAD"], repoDir).catch(() => {});
        actions.push("reset_corrupted_index");
      }
    }
  } catch {}

  // 6. Unshallow sob demanda se o repositório estiver shallow
  if (options.unshallowIfNeeded !== false) {
    try {
      const isShallowRes = await executeGit(["rev-parse", "--is-shallow-repository"], repoDir);
      if (isShallowRes.success && isShallowRes.stdout.trim() === "true") {
        const activeToken = getActiveBearerToken(options.token || undefined);
        const unshallowRes = await executeGit(
          ["fetch", "--unshallow", "origin"],
          repoDir,
          activeToken || undefined,
        );
        if (unshallowRes.success) {
          actions.push("unshallowed_shallow_repo");
        }
      }
    } catch {}
  }

  return { healed: actions.length > 0, actions };
}

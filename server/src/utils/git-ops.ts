import fs from "node:fs";
import path from "node:path";
import {
  executeGit,
  isGitRepo,
  ensureGitIgnore,
  GitProgressEvent,
  executeGitCommandWithProgress,
} from "./git-core.js";
import { getDefaultBranch, getGitStatus } from "./git-queries.js";
import {
  assertCommitish,
  assertRemoteName,
  assertBranchName,
  assertGitPath,
} from "./git-validate.js";

export async function cloneGitRepo(
  repoDir: string,
  remoteUrl: string,
  token?: string,
  user?: { name?: string; login?: string; email?: string } | null,
  onProgress?: (p: GitProgressEvent) => void,
): Promise<{ success: boolean; message: string }> {
  if (await isGitRepo(repoDir)) {
    return {
      success: true,
      message: "Repositório já está clonado localmente.",
    };
  }

  const cleanRemoteUrl =
    remoteUrl.startsWith("https://") && !remoteUrl.endsWith(".git")
      ? `${remoteUrl}.git`
      : remoteUrl;

  // Diretório residual (sem .git) só é descartado se contiver apenas arquivos gerados automaticamente
  const generated = [
    ".gitignore",
    ".project.config.json",
    ".dictionary.json",
    ".docs.metadata.json",
    ".hidden_files.json",
    ".templates.json",
    ".templates.metadata.json",
    ".github",
  ];
  if (fs.existsSync(repoDir)) {
    const stray = fs.readdirSync(repoDir).filter((n) => n !== ".DS_Store");
    if (!stray.every((n) => generated.includes(n))) {
      return {
        success: false,
        message:
          "A pasta de destino já existe e contém arquivos locais sem repositório Git.",
      };
    }
  }

  const parentDir = path.dirname(repoDir);
  fs.mkdirSync(parentDir, { recursive: true });

  if (fs.existsSync(repoDir)) {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }

  const repoFolderName = path.basename(repoDir);

  const cloneRes = await executeGitCommandWithProgress(
    ["clone", "--progress", cleanRemoteUrl, repoFolderName],
    parentDir,
    token,
    onProgress,
  );

  if (!cloneRes.success || !(await isGitRepo(repoDir))) {
    if (fs.existsSync(repoDir)) {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
    return {
      success: false,
      message: cloneRes.stderr || "Falha ao clonar repositório do GitHub.",
    };
  }

  const publicOrigin = cleanRemoteUrl;
  await executeGit(["remote", "set-url", "origin", publicOrigin], repoDir);

  if (user?.name || user?.login) {
    const authorName = (user.name || user.login || "Contexos") as string;
    const authorEmail = (user.email ||
      `${user.login || "context-os"}@users.noreply.github.com`) as string;
    await executeGit(["config", "user.name", authorName], repoDir);
    await executeGit(["config", "user.email", authorEmail], repoDir);
  }

  ensureGitIgnore(repoDir);

  return {
    success: true,
    message: "Repositório clonado com sucesso para trabalhar localmente.",
  };
}

export async function pullGitRepo(
  repoDir: string,
  branch?: string,
  token?: string,
  onProgress?: (p: GitProgressEvent) => void,
): Promise<{ success: boolean; message: string }> {
  if (!(await isGitRepo(repoDir))) {
    return {
      success: false,
      message: "Repositório não está clonado localmente.",
    };
  }

  const defaultBranch = await getDefaultBranch(repoDir);
  const branchRes = await executeGit(
    ["rev-parse", "--abbrev-ref", "HEAD"],
    repoDir,
  );
  const rawBranch = branchRes.success && branchRes.stdout?.trim() ? branchRes.stdout.trim() : "";
  const activeBranch = branch || (rawBranch && rawBranch !== "HEAD" ? rawBranch : "") || defaultBranch || "main";

  // Verifica se o repositório remoto possui a branch antes de tentar fetch/pull
  const remoteRefCheck = await executeGit(
    ["ls-remote", "--heads", "origin", activeBranch],
    repoDir,
    token,
  );
  const remoteBranchExists =
    remoteRefCheck.success && Boolean(remoteRefCheck.stdout.trim());

  if (!remoteBranchExists) {
    const headCheck = await executeGit(["rev-parse", "--verify", "HEAD"], repoDir);
    if (!headCheck.success) {
      return {
        success: true,
        message: `Repositório remoto em branco. Crie seu primeiro arquivo para inicializar a branch '${activeBranch}'.`,
      };
    }
    return {
      success: true,
      message: `Branch '${activeBranch}' ainda não existe no remoto. Realize um push para criá-la no GitHub.`,
    };
  }

  const fetchRes = await executeGitCommandWithProgress(
    ["fetch", "--progress", "origin", activeBranch],
    repoDir,
    token,
    onProgress,
  );

  if (!fetchRes.success) {
    return {
      success: false,
      message: fetchRes.stderr || "Erro ao buscar atualizações remotas.",
    };
  }

  const pullRes = await executeGitCommandWithProgress(
    ["pull", "--progress", "origin", activeBranch, "--ff-only"],
    repoDir,
    token,
    onProgress,
  );

  if (!pullRes.success) {
    return {
      success: false,
      message:
        "Não foi possível avançar com fast-forward. Existem alterações locais ou histórico divergente.",
    };
  }

  return {
    success: true,
    message: pullRes.stdout?.trim() || "Repositório atualizado com sucesso.",
  };
}

export async function commitChanges(
  repoDir: string,
  message: string,
  files?: string[],
): Promise<{ success: boolean; message: string; commitHash?: string }> {
  const isRepo = await isGitRepo(repoDir);
  if (!isRepo)
    return { success: false, message: "Diretório não é um repositório Git." };

  ensureGitIgnore(repoDir);

  if (Array.isArray(files) && files.length > 0) {
    const validFiles: string[] = [];
    for (const file of files) {
      if (
        file.includes(".docs.metadata.json") ||
        file.includes("workspace_changes.json") ||
        file.includes(".spec-memory/sessions")
      ) {
        continue;
      }
      validFiles.push(assertGitPath(file));
    }
    if (validFiles.length > 0) {
      await executeGit(["add", "--", ...validFiles], repoDir);
    }
  } else {
    await executeGit(["add", "."], repoDir);
  }

  // Garantia pós-staging: desindexa imediatamente arquivos transitórios do sistema caso tenham entrado no index
  try {
    await executeGit(
      [
        "rm",
        "--cached",
        "-r",
        "--ignore-unmatch",
        ".spec-memory/workspace_changes.json",
        ".spec-memory/sessions",
        ".docs.metadata.json",
      ],
      repoDir,
    );
  } catch {}

  const commitRes = await executeGit(["commit", "-m", message], repoDir);

  if (!commitRes.success && !commitRes.stderr.includes("nothing to commit")) {
    return {
      success: false,
      message: commitRes.stderr || "Falha ao executar commit.",
    };
  }

  const hashRes = await executeGit(["rev-parse", "--short", "HEAD"], repoDir);
  return {
    success: true,
    message: commitRes.stdout || "Commit realizado com sucesso.",
    commitHash: hashRes.stdout,
  };
}

export async function createAndCheckoutBranch(
  repoDir: string,
  branchName: string,
  baseBranch?: string,
  displayTitle?: string,
): Promise<{ success: boolean; message: string }> {
  const isRepo = await isGitRepo(repoDir);
  if (!isRepo)
    return { success: false, message: "Diretório não é um repositório Git." };

  const safeName = assertBranchName(branchName.trim().replace(/\s+/g, "-"));

  // Destrava arquivos transitórios de controle interno (.spec-memory/workspace_changes.json)
  // que possam colidir durante o checkout se já tiverem sido commitados em alguma branch
  const wsChangesPath = path.join(repoDir, ".spec-memory", "workspace_changes.json");
  let wsChangesBackup: string | null = null;
  if (fs.existsSync(wsChangesPath)) {
    try {
      wsChangesBackup = fs.readFileSync(wsChangesPath, "utf-8");
      fs.unlinkSync(wsChangesPath);
    } catch {}
  }

  try {
    // Verifica se a branch já existe localmente
    const branchExistsRes = await executeGit(
      ["rev-parse", "--verify", `refs/heads/${safeName}`],
      repoDir,
    );

    if (branchExistsRes.success) {
      if (baseBranch) {
        return {
          success: false,
          message: `A versão '${safeName}' já existe. Escolha outro nome.`,
        };
      }
      const checkRes = await executeGit(["checkout", safeName], repoDir);
      if (!checkRes.success) {
        return {
          success: false,
          message:
            checkRes.stderr || `Erro ao alternar para a branch '${safeName}'.`,
        };
      }
      return { success: true, message: `Trocou para a branch '${safeName}'.` };
    }

    // Identifica a branch de origem antes da criação
    let currentBranchBefore = "";
    try {
      const curRes = await executeGit(["branch", "--show-current"], repoDir);
      if (curRes.success) {
        currentBranchBefore = curRes.stdout.trim();
      }
    } catch {}

    const safeStartPoint = baseBranch
      ? /^[0-9a-f]{7,40}$/i.test(baseBranch.trim())
        ? assertCommitish(baseBranch.trim(), "Commit base")
        : assertBranchName(baseBranch.trim(), "Branch base")
      : undefined;

    const effectiveParent =
      safeStartPoint && !/^[0-9a-f]{7,40}$/i.test(safeStartPoint)
        ? safeStartPoint
        : currentBranchBefore || (await getDefaultBranch(repoDir));

    const args = safeStartPoint
      ? ["checkout", "-b", safeName, safeStartPoint]
      : ["checkout", "-b", safeName];

    const createRes = await executeGit(args, repoDir);
    if (createRes.success) {
      // Persiste no .git/config a origem de onde a branch foi bifurcada e título se fornecido
      try {
        await executeGit(
          ["config", `branch.${safeName}.parent`, effectiveParent],
          repoDir,
        );
        if (displayTitle?.trim()) {
          await executeGit(
            ["config", `branch.${safeName}.title`, displayTitle.trim()],
            repoDir,
          );
        }
      } catch {}

      return {
        success: true,
        message: `Branch '${safeName}' criada com sucesso a partir de '${safeStartPoint || effectiveParent}'.`,
      };
    }

    return {
      success: false,
      message: createRes.stderr || "Erro ao criar branch.",
    };
  } finally {
    if (wsChangesBackup && !fs.existsSync(wsChangesPath)) {
      try {
        fs.writeFileSync(wsChangesPath, wsChangesBackup, "utf-8");
      } catch {}
    }
  }
}

export async function mergeGitBranch(
  repoDir: string,
  sourceBranch: string,
  targetBranch?: string,
  customMessage?: string,
): Promise<{
  success: boolean;
  message: string;
  commitHash?: string;
  hasConflicts?: boolean;
  conflictFiles?: string[];
}> {
  const isRepo = await isGitRepo(repoDir);
  if (!isRepo) {
    return { success: false, message: "Diretório não é um repositório Git." };
  }

  const safeSource = assertBranchName(sourceBranch.trim(), "Branch de origem");
  const status = await getGitStatus(repoDir);
  if (status.files && status.files.length > 0) {
    return {
      success: false,
      message:
        "Existem alterações não salvas no workspace. Salve um commit, guarde no stash ou descarte antes de fazer o merge.",
    };
  }

  let currentBranch = status.branch;
  if (targetBranch && targetBranch.trim() && targetBranch.trim() !== currentBranch) {
    const safeTarget = assertBranchName(targetBranch.trim(), "Branch de destino");
    const coRes = await executeGit(["checkout", safeTarget], repoDir);
    if (!coRes.success) {
      return {
        success: false,
        message: coRes.stderr || `Não foi possível alternar para '${safeTarget}' antes do merge.`,
      };
    }
    currentBranch = safeTarget;
  }

  if (!currentBranch || currentBranch === "HEAD") {
    return {
      success: false,
      message:
        "Você está em um commit avulso (HEAD desacoplado). Alterne para uma branch antes de fazer o merge.",
    };
  }

  if (currentBranch === safeSource) {
    return {
      success: false,
      message: "A branch de origem e a branch de destino são a mesma.",
    };
  }

  const mergeMsg =
    customMessage?.trim() || `Merge branch '${safeSource}' into ${currentBranch}`;

  const mergeRes = await executeGit(
    ["merge", "--no-ff", safeSource, "-m", mergeMsg],
    repoDir,
  );

  if (!mergeRes.success) {
    // Coleta arquivos em conflito antes de abortar para manter o repositório íntegro
    let conflictFiles: string[] = [];
    try {
      const diffUnmerged = await executeGit(
        ["diff", "--name-only", "--diff-filter=U"],
        repoDir,
      );
      if (diffUnmerged.success && diffUnmerged.stdout.trim()) {
        conflictFiles = diffUnmerged.stdout
          .trim()
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    } catch {}

    await executeGit(["merge", "--abort"], repoDir).catch(() => {});

    const conflictSuffix =
      conflictFiles.length > 0
        ? ` Arquivos em conflito: ${conflictFiles.join(", ")}.`
        : "";
    return {
      success: false,
      hasConflicts: true,
      conflictFiles,
      message: `Conflito ao mesclar '${safeSource}' em '${currentBranch}'. O merge foi cancelado automaticamente para preservar o workspace.${conflictSuffix}`,
    };
  }

  const headRes = await executeGit(["rev-parse", "HEAD"], repoDir);
  return {
    success: true,
    commitHash: headRes.stdout.trim(),
    message: `Branch '${safeSource}' mesclada em '${currentBranch}' com sucesso.`,
  };
}

export async function syncGit(
  repoDir: string,
  remote: string = "origin",
  branch: string = "main",
): Promise<{
  success: boolean;
  message: string;
  previousHead?: string;
  currentHead?: string;
  newCommitsCount?: number;
}> {
  const isRepo = await isGitRepo(repoDir);
  if (!isRepo)
    return { success: false, message: "Diretório não é um repositório Git." };

  const safeRemote = assertRemoteName(remote);
  const safeBranch = assertBranchName(branch);

  // Garante a nomenclatura correta da branch local
  await executeGit(["branch", "-M", safeBranch], repoDir).catch(() => {});

  const prevHeadRes = await executeGit(["rev-parse", "HEAD"], repoDir);
  const previousHead = prevHeadRes.success
    ? prevHeadRes.stdout.trim()
    : undefined;
  const hasLocalCommits = prevHeadRes.success;

  // Verifica se o remoto já possui a branch
  const remoteRefCheck = await executeGit(
    ["ls-remote", "--heads", safeRemote, safeBranch],
    repoDir,
  );
  const remoteBranchExists =
    remoteRefCheck.success && Boolean(remoteRefCheck.stdout.trim());

  let pullRes = { success: true, stdout: "", stderr: "" };

  // 1. Pull apenas se a branch remota de fato já existir
  if (remoteBranchExists) {
    await executeGit(["fetch", safeRemote], repoDir);

    pullRes = await executeGit(
      [
        "pull",
        safeRemote,
        safeBranch,
        "--allow-unrelated-histories",
        "--no-edit",
      ],
      repoDir,
    );
    if (!pullRes.success) {
      pullRes = await executeGit(
        ["pull", safeRemote, safeBranch, "--rebase"],
        repoDir,
      );
    }
  }

  // 2. Push apenas se houver commits locais
  let pushRes = { success: true, stdout: "", stderr: "" };
  if (hasLocalCommits) {
    pushRes = await executeGit(
      ["push", "-u", safeRemote, safeBranch],
      repoDir,
    );
  } else if (!remoteBranchExists) {
    return {
      success: true,
      message: `Repositório remoto em branco pronto. Crie seu primeiro arquivo ou documento para publicar na branch '${safeBranch}'.`,
      previousHead,
    };
  }

  const currHeadRes = await executeGit(["rev-parse", "HEAD"], repoDir);
  const currentHead = currHeadRes.success
    ? currHeadRes.stdout.trim()
    : undefined;

  let newCommitsCount = 0;
  if (previousHead && currentHead && previousHead !== currentHead) {
    const countRes = await executeGit(
      ["rev-list", "--count", `${previousHead}..${currentHead}`],
      repoDir,
    );
    if (countRes.success) {
      newCommitsCount = parseInt(countRes.stdout.trim(), 10) || 0;
    }
  }

  const msgParts: string[] = [];
  if (remoteBranchExists) {
    if (pullRes.success) {
      msgParts.push(`Pull: ${pullRes.stdout || "Atualizado com sucesso"}`);
    } else if (pullRes.stderr) {
      msgParts.push(`Pull Aviso: ${pullRes.stderr}`);
    }
  }

  if (hasLocalCommits) {
    if (pushRes.success) {
      msgParts.push(`Push: ${pushRes.stdout || "Enviado com sucesso"}`);
    } else if (pushRes.stderr) {
      msgParts.push(`Push Aviso: ${pushRes.stderr}`);
    }
  }

  return {
    success: (hasLocalCommits ? pushRes.success : true) && (remoteBranchExists ? pullRes.success : true),
    message: msgParts.join(" | ") || (hasLocalCommits ? "Sincronizado" : "Pronto"),
    previousHead,
    currentHead,
    newCommitsCount,
  };
}

export async function rollbackToCommit(
  repoDir: string,
  targetCommitHash: string,
  commitTitle?: string,
  options?: { force?: boolean },
): Promise<{ success: boolean; message: string; newCommitHash?: string }> {
  const isRepo = await isGitRepo(repoDir);
  if (!isRepo) {
    return { success: false, message: "Diretório não é um repositório Git." };
  }

  // 1. Verify target commit
  const safeHash = assertCommitish(targetCommitHash, "Target commit hash");
  const checkRes = await executeGit(["cat-file", "-t", safeHash], repoDir);
  if (!checkRes.success || checkRes.stdout !== "commit") {
    return {
      success: false,
      message: `Revisão ${safeHash} inválida ou não encontrada.`,
    };
  }

  // 2. Prevenir perda acidental de alterações não commitadas (C5)
  if (!options?.force) {
    const status = await getGitStatus(repoDir);
    if (!status.isClean) {
      return {
        success: false,
        message:
          "Existem alterações não commitadas no repositório. Faça commit ou use force para sobrescrever.",
      };
    }
  }

  // 3. Checkout current branch (detect active default or branch)
  let activeBranch = await getDefaultBranch(repoDir);
  const branchRes = await executeGit(["branch", "--show-current"], repoDir);
  if (branchRes.success && branchRes.stdout.trim()) {
    activeBranch = branchRes.stdout.trim();
  }
  await executeGit(["checkout", activeBranch], repoDir).catch(() => {});

  // 3. Check if target commit is already HEAD
  const headRes = await executeGit(["rev-parse", "HEAD"], repoDir);
  const targetFullRes = await executeGit(["rev-parse", safeHash], repoDir);
  if (
    headRes.success &&
    targetFullRes.success &&
    headRes.stdout.trim() === targetFullRes.stdout.trim()
  ) {
    return {
      success: false,
      message: "Esta versão já é a versão ativa mais recente.",
    };
  }

  // 4. Discard any unstaged changes in repo
  await executeGit(["reset", "--hard", "HEAD"], repoDir);

  // 5. Restore tree of targetCommitHash (safe rollback preserving history)
  const treeRes = await executeGit(
    ["read-tree", "-u", "--reset", safeHash],
    repoDir,
  );
  if (!treeRes.success) {
    await executeGit(["checkout", safeHash, "--", "."], repoDir);
  }

  // 6. Get short hash of target
  const shortTargetRes = await executeGit(
    ["rev-parse", "--short", safeHash],
    repoDir,
  );
  const shortTarget = shortTargetRes.stdout || safeHash.slice(0, 7);

  const cleanTitle = commitTitle ? `: ${commitTitle.slice(0, 60)}` : "";
  const commitMsg = `Reversão segura: restaurar versão para ${shortTarget}${cleanTitle}`;

  const commitRes = await executeGit(["commit", "-m", commitMsg], repoDir);
  if (!commitRes.success && !commitRes.stderr.includes("nothing to commit")) {
    return {
      success: false,
      message: commitRes.stderr || "Falha ao executar commit de reversão.",
    };
  }

  const newHashRes = await executeGit(
    ["rev-parse", "--short", "HEAD"],
    repoDir,
  );
  return {
    success: true,
    message: `Revertido com sucesso para a revisão ${shortTarget}.`,
    newCommitHash: newHashRes.stdout || shortTarget,
  };
}

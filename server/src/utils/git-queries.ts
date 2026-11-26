import fs from "node:fs";
import path from "node:path";
import {
  assertCommitish,
  assertBranchName,
  assertGitPath,
} from "./git-validate.js";
import { executeGit, isGitRepo, isTransientGitPath } from "./git-core.js";

export interface GitFileStatus {
  path: string;
  status: "M" | "A" | "D" | "U" | "R" | "C" | "??";
  staged: boolean;
}

export interface GitStatusResult {
  isRepo: boolean;
  branch: string;
  tracking?: string;
  ahead: number;
  behind: number;
  isClean: boolean;
  files: GitFileStatus[];
  systemFiles: GitFileStatus[];
  remoteUrl?: string;
}

export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
}

export async function getDefaultBranch(repoDir: string): Promise<string> {
  const isRepo = await isGitRepo(repoDir);
  if (!isRepo) return "main";

  // 1. Tenta ler refs/remotes/origin/HEAD (branch padrão oficial do remoto, se clonado)
  try {
    const headRes = await executeGit(["symbolic-ref", "refs/remotes/origin/HEAD"], repoDir);
    if (headRes.success && headRes.stdout.trim()) {
      const ref = headRes.stdout.trim();
      const branch = ref.replace(/^refs\/remotes\/[^/]+\//, "");
      if (branch && branch !== ref) return branch;
    }
  } catch {}

  // 2. Consulta refs locais diretamente para convenções canônicas universais (main, master, develop)
  try {
    const refsRes = await executeGit(
      ["for-each-ref", "--format=%(refname:short)", "refs/heads"],
      repoDir
    );
    if (refsRes.success && refsRes.stdout.trim()) {
      const branches = refsRes.stdout.split("\n").map((b) => b.trim()).filter(Boolean);
      if (branches.includes("main")) return "main";
      if (branches.includes("master")) return "master";
      if (branches.includes("develop")) return "develop";
    }
  } catch {}

  // 3. Consulta HEAD simbólico local (ex: repo recém-inicializado sem commits ou com branch única personalizada)
  try {
    const symHead = await executeGit(["symbolic-ref", "--short", "HEAD"], repoDir);
    if (symHead.success && symHead.stdout.trim()) {
      const branch = symHead.stdout.trim();
      if (branch && !branch.startsWith("gov/") && !branch.startsWith("fix/") && !branch.startsWith("feat/")) {
        return branch;
      }
    }
  } catch {}

  return "main";
}

export async function getGitStatus(repoDir: string): Promise<GitStatusResult> {
  const isRepo = await isGitRepo(repoDir);
  if (!isRepo) {
    return {
      isRepo: false,
      branch: "none",
      ahead: 0,
      behind: 0,
      isClean: true,
      files: [],
      systemFiles: [],
    };
  }

  // Current branch
  const branchRes = await executeGit(["rev-parse", "--abbrev-ref", "HEAD"], repoDir);
  const rawBranch = branchRes.success && branchRes.stdout?.trim() ? branchRes.stdout.trim() : "";
  const branch = rawBranch && rawBranch !== "HEAD" ? rawBranch : (await getDefaultBranch(repoDir));

  // Remote URL
  const remoteRes = await executeGit(["remote", "get-url", "origin"], repoDir);
  const remoteUrl = remoteRes.success
    ? remoteRes.stdout.replace(/x-access-token:[^@]+@/, "")
    : undefined;

  // Status porcelain with -z so paths are never C-quoted or octal-escaped, and all untracked files expanded individually
  const statusRes = await executeGit(
    ["-c", "core.quotepath=false", "status", "--porcelain=v1", "-z", "-b", "-uall"],
    repoDir,
    undefined,
    { trimStdout: false },
  );
  const entries = (statusRes.stdout || "").split("\0");

  let ahead = 0;
  let behind = 0;
  let tracking: string | undefined;
  const files: GitFileStatus[] = [];

  for (let i = 0; i < entries.length; i++) {
    const line = entries[i];
    if (!line) continue;

    if (line.startsWith("## ")) {
      const branchInfo = line.substring(3);
      if (branchInfo.includes("...")) {
        const parts = branchInfo.split("...");
        const right = parts[1] || "";
        tracking = right.split(" ")[0];
        const aheadMatch = right.match(/ahead (\d+)/);
        const behindMatch = right.match(/behind (\d+)/);
        if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
        if (behindMatch) behind = parseInt(behindMatch[1], 10);
      }
      continue;
    }

    if (line.length < 4) continue;
    const indexCode = line[0];
    const workCode = line[1];
    const filePath = line.substring(3);

    // In -z mode, renames and copies emit an extra NUL-terminated original path right after the new path
    if (indexCode === "R" || indexCode === "C" || workCode === "R" || workCode === "C") {
      i++;
    }

    if (!filePath) continue;

    const isStaged = indexCode !== " " && indexCode !== "?";
    let statusCode: GitFileStatus["status"] = "M";

    if (indexCode === "?" && workCode === "?") {
      statusCode = "??";
    } else if (indexCode === "A" || workCode === "A") {
      statusCode = "A";
    } else if (indexCode === "D" || workCode === "D") {
      statusCode = "D";
    } else if (indexCode === "R" || workCode === "R") {
      statusCode = "R";
    } else if (indexCode === "C" || workCode === "C") {
      statusCode = "C";
    } else {
      statusCode = "M";
    }

    files.push({
      path: filePath,
      status: statusCode,
      staged: isStaged,
    });
  }

  const visibleFiles = files.filter((f) => {
    const clean = f.path.replace(/\\/g, "/");
    return (
      !isTransientGitPath(clean) &&
      !clean.endsWith("/.DS_Store") &&
      clean !== ".DS_Store"
    );
  });

  return {
    isRepo: true,
    branch,
    tracking,
    ahead,
    behind,
    isClean: visibleFiles.length === 0,
    files: visibleFiles,
    systemFiles: [],
    remoteUrl,
  };
}

export async function getGitLog(
  repoDir: string,
  limit: number = 20,
): Promise<GitCommitInfo[]> {
  const isRepo = await isGitRepo(repoDir);
  if (!isRepo) return [];

  const format = "%H|%h|%an|%ad|%s";
  const logRes = await executeGit(
    ["log", `-n${Number(limit) || 20}`, "--date=short", `--pretty=format:${format}`],
    repoDir,
  );

  if (!logRes.success || !logRes.stdout) return [];

  const lines = logRes.stdout.split("\n").filter(Boolean);
  return lines.map((line) => {
    const [hash, shortHash, author, date, ...msgParts] = line.split("|");
    return {
      hash: hash || "",
      shortHash: shortHash || "",
      author: author || "Desconhecido",
      date: date || "",
      message: msgParts.join("|") || "",
    };
  });
}

export async function getGitBranches(
  repoDir: string,
): Promise<{ current: string; branches: string[]; localBranches?: string[] }> {
  const isRepo = await isGitRepo(repoDir);
  if (!isRepo)
    return { current: "main", branches: ["main"], localBranches: ["main"] };

  // Identifica a branch atual de forma explícita (ou "HEAD" quando em detached HEAD)
  let current = "main";
  try {
    const curRes = await executeGit(["branch", "--show-current"], repoDir);
    if (curRes.success && curRes.stdout.trim()) {
      current = curRes.stdout.trim();
    } else {
      const headRes = await executeGit(["rev-parse", "--abbrev-ref", "HEAD"], repoDir);
      if (headRes.success && headRes.stdout.trim() === "HEAD") {
        current = "HEAD";
      } else {
        current = await getDefaultBranch(repoDir);
      }
    }
  } catch {}

  // Lista todas as branches (locais e remotas do GitHub)
  const res = await executeGit(["branch", "-a"], repoDir);
  if (!res.success)
    return { current, branches: [current], localBranches: [current] };

  const lines = res.stdout.split("\n").filter(Boolean);
  const branchSet = new Set<string>();
  const localSet = new Set<string>();
  if (current && current !== "HEAD") {
    branchSet.add(current);
    localSet.add(current);
  }

  for (const rawLine of lines) {
    const isCurrent = rawLine.startsWith("*");
    const cleanLine = rawLine.replace("*", "").trim();
    if (
      !cleanLine ||
      cleanLine.includes("->") ||
      cleanLine.startsWith("(") ||
      cleanLine.includes("HEAD detached")
    ) {
      continue; // Ignora ponteiros HEAD simbólicos ou linhas de detached HEAD
    }

    const isRemote =
      cleanLine.startsWith("remotes/") || cleanLine.startsWith("origin/");
    let name = cleanLine;
    if (name.startsWith("remotes/origin/")) {
      name = name.replace("remotes/origin/", "");
    } else if (name.startsWith("remotes/")) {
      const parts = name.split("/");
      parts.shift(); // remove "remotes"
      parts.shift(); // remove remote name
      name = parts.join("/");
    } else if (name.startsWith("origin/")) {
      name = name.replace("origin/", "");
    }

    if (name && name !== "HEAD") {
      branchSet.add(name);
      if (!isRemote || isCurrent) {
        localSet.add(name);
      }
    }
  }

  const branches = Array.from(branchSet);
  const localBranches = Array.from(localSet);
  return {
    current,
    branches: branches.length > 0 ? branches : ["main"],
    localBranches: localBranches.length > 0 ? localBranches : ["main"],
  };
}

export async function getGitBlame(
  repoDir: string,
  filePath: string,
): Promise<any> {
  const isRepo = await isGitRepo(repoDir);
  if (!isRepo) return { success: false, blame: [] };

  const cleanPath = filePath.trim().replace(/^\/+/, "");
  assertGitPath(cleanPath);
  const blameRes = await executeGit(
    ["blame", "--line-porcelain", "--", cleanPath],
    repoDir,
  );

  if (!blameRes.success) {
    return { success: false, blame: [], message: blameRes.stderr };
  }

  return {
    success: true,
    raw: blameRes.stdout,
  };
}

export async function getGitDiff(
  repoDir: string,
  filePath?: string,
): Promise<{ diff: string }> {
  const isRepo = await isGitRepo(repoDir);
  if (!isRepo) return { diff: "" };

  const cleanPath = filePath ? filePath.trim().replace(/^\/+/, "") : "";
  if (cleanPath) {
    assertGitPath(cleanPath);
  }
  const pathArgs = cleanPath ? ["--", cleanPath] : [];

  // 1. Try git diff HEAD (covers both staged and unstaged modifications against last commit)
  let diffRes = await executeGit(["diff", "HEAD", ...pathArgs], repoDir);
  let baseDiff = (diffRes.success && diffRes.stdout) ? diffRes.stdout : "";

  if (!baseDiff) {
    // 2. Try working tree diff
    diffRes = await executeGit(["diff", ...pathArgs], repoDir);
    if (diffRes.success && diffRes.stdout) {
      baseDiff = diffRes.stdout;
    }
  }

  if (!baseDiff) {
    // 3. Try cached/staged diff
    diffRes = await executeGit(["diff", "--cached", ...pathArgs], repoDir);
    if (diffRes.success && diffRes.stdout) {
      baseDiff = diffRes.stdout;
    }
  }

  // 4. If filePath is untracked, read the file content and format as added lines
  if (cleanPath) {
    if (baseDiff) return { diff: baseDiff };

    const fullPath = path.join(repoDir, cleanPath);
    if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");
        const diffHeader = `--- /dev/null\n+++ b/${cleanPath}\n@@ -0,0 +1,${lines.length} @@\n`;
        const diffBody = lines.map((line) => `+${line}`).join("\n");
        return { diff: diffHeader + diffBody };
      } catch {}
    }
  } else {
    // When no specific file requested, append any untracked files to the overall diff
    try {
      const statusRes = await executeGit(
        ["-c", "core.quotepath=false", "status", "--porcelain=v1", "-z", "-uall"],
        repoDir,
        undefined,
        { trimStdout: false },
      );
      if (statusRes.success && statusRes.stdout) {
        const entries = statusRes.stdout.split("\0");
        const untracked: string[] = [];
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (!entry || entry.length < 4) continue;
          const idx = entry[0];
          const wrk = entry[1];
          if (idx === "R" || idx === "C" || wrk === "R" || wrk === "C") {
            i++;
            continue;
          }
          if (entry.startsWith("?? ")) {
            untracked.push(entry.substring(3));
          }
        }

        let extraDiff = "";
        for (const uPath of untracked) {
          const fullPath = path.join(repoDir, uPath);
          if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              const lines = content.split("\n");
              extraDiff += `--- /dev/null\n+++ b/${uPath}\n@@ -0,0 +1,${lines.length} @@\n` + lines.map((l) => `+${l}`).join("\n") + "\n";
            } catch {}
          }
        }
        if (extraDiff) {
          return { diff: baseDiff ? `${baseDiff}\n${extraDiff}` : extraDiff };
        }
      }
    } catch {}
    if (baseDiff) return { diff: baseDiff };
  }

  return { diff: "" };
}

export async function getFileGitLog(
  repoDir: string,
  filePath: string,
  limit: number = 30,
): Promise<GitCommitInfo[]> {
  const isRepo = await isGitRepo(repoDir);
  if (!isRepo) return [];

  const cleanPath = filePath.trim().replace(/^\/+/, "");
  assertGitPath(cleanPath);
  const format = "%H|%h|%an|%ad|%s";
  const logRes = await executeGit(
    ["log", `-n${Number(limit) || 30}`, "--follow", "--date=short", `--pretty=format:${format}`, "--", cleanPath],
    repoDir,
  );

  if (!logRes.success || !logRes.stdout) return [];

  const lines = logRes.stdout.split("\n").filter(Boolean);
  return lines.map((line) => {
    const [hash, shortHash, author, date, ...msgParts] = line.split("|");
    return {
      hash: hash || "",
      shortHash: shortHash || "",
      author: author || "Desconhecido",
      date: date || "",
      message: msgParts.join("|") || "",
    };
  });
}

export async function getFileContentAtCommit(
  repoDir: string,
  filePath: string,
  commitHash: string,
): Promise<{ success: boolean; content: string; error?: string }> {
  const isRepo = await isGitRepo(repoDir);
  if (!isRepo)
    return { success: false, content: "", error: "Repositório não encontrado" };

  const cleanPath = filePath.trim().replace(/^\/+/, "");
  const cleanHash = commitHash.trim();
  assertCommitish(cleanHash);
  assertGitPath(cleanPath);

  const showRes = await executeGit(
    ["show", `${cleanHash}:${cleanPath}`],
    repoDir,
  );

  if (!showRes.success) {
    return {
      success: false,
      content: "",
      error: showRes.stderr || "Versão não encontrada",
    };
  }

  return { success: true, content: showRes.stdout };
}

export async function getFileBlameDetails(
  repoDir: string,
  filePath: string,
): Promise<{
  success: boolean;
  blame: Array<{
    line: number;
    author: string;
    date: string;
    commit: string;
    content: string;
  }>;
}> {
  const isRepo = await isGitRepo(repoDir);
  if (!isRepo) return { success: false, blame: [] };

  const cleanPath = filePath.trim().replace(/^\/+/, "");
  assertGitPath(cleanPath);
  const blameRes = await executeGit(
    ["blame", "--date=short", "-e", "-l", "--", cleanPath],
    repoDir,
  );

  if (!blameRes.success || !blameRes.stdout) {
    return { success: false, blame: [] };
  }

  const lines = blameRes.stdout.split("\n").filter(Boolean);
  const result: Array<{
    line: number;
    author: string;
    date: string;
    commit: string;
    content: string;
  }> = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx];
    const match = rawLine.match(
      /^([0-9a-fA-F]+)\s+\(<([^>]+)>\s+([0-9\-]+)\s+(\d+)\)\s?(.*)$/,
    );
    if (match) {
      result.push({
        commit: match[1].slice(0, 7),
        author: match[2].split("@")[0],
        date: match[3],
        line: parseInt(match[4], 10),
        content: match[5] || "",
      });
    } else {
      result.push({
        commit: "HEAD",
        author: "Autor",
        date: "",
        line: idx + 1,
        content: rawLine,
      });
    }
  }

  return { success: true, blame: result };
}

export interface RemoteUpdateCheckResult {
  hasUpdates: boolean;
  localHash: string;
  remoteHash?: string;
  branch?: string;
  behindCount?: number;
  aheadCount?: number;
  error?: string;
}

export async function checkRemoteGitUpdates(
  repoDir: string,
  remoteBranch?: string,
): Promise<RemoteUpdateCheckResult> {
  const isRepo = await isGitRepo(repoDir);
  if (!isRepo) {
    return { hasUpdates: false, localHash: "" };
  }

  const headRes = await executeGit(["rev-parse", "HEAD"], repoDir);
  const localHash = headRes.stdout.trim();
  if (!localHash) {
    return { hasUpdates: false, localHash: "" };
  }

  const remoteRes = await executeGit(["remote", "get-url", "origin"], repoDir);
  if (!remoteRes.success || !remoteRes.stdout.trim()) {
    return { hasUpdates: false, localHash };
  }

  let branch = remoteBranch;
  if (!branch) {
    const branchRes = await executeGit(
      ["rev-parse", "--abbrev-ref", "HEAD"],
      repoDir,
    );
    branch = branchRes.stdout?.trim() || "main";
  }
  assertBranchName(branch);

  const lsRes = await executeGit(
    ["ls-remote", "origin", `refs/heads/${branch}`],
    repoDir,
  );
  if (!lsRes.success || !lsRes.stdout.trim()) {
    return { hasUpdates: false, localHash, branch, error: lsRes.stderr };
  }

  const parts = lsRes.stdout.trim().split(/\s+/);
  const remoteHash = parts[0]?.trim();

  if (!remoteHash) {
    return { hasUpdates: false, localHash, branch };
  }

  if (remoteHash.toLowerCase() === localHash.toLowerCase()) {
    return {
      hasUpdates: false,
      localHash,
      remoteHash,
      branch,
    };
  }

  // If the remote commit is already an ancestor of HEAD, local is simply ahead (unpushed commits).
  const ancestorRes = await executeGit(
    ["merge-base", "--is-ancestor", remoteHash, "HEAD"],
    repoDir,
  );
  if (ancestorRes.success) {
    return {
      hasUpdates: false,
      localHash,
      remoteHash,
      branch,
    };
  }

  // Fetch the remote branch to accurately count commits behind.
  await executeGit(["fetch", "origin", branch], repoDir);
  const behindRes = await executeGit(
    ["rev-list", "--count", "HEAD..FETCH_HEAD"],
    repoDir,
  );
  const behindCount = Number.parseInt(behindRes.stdout.trim(), 10);
  const hasUpdates = Number.isFinite(behindCount) ? behindCount > 0 : false;

  return {
    hasUpdates,
    localHash,
    remoteHash,
    branch,
  };
}

export async function compareGitBranches(
  repoDir: string,
  baseBranch: string,
  headBranch: string,
): Promise<{
  baseBranch: string;
  headBranch: string;
  commits: Array<{
    hash: string;
    shortHash: string;
    author: string;
    date: string;
    message: string;
  }>;
  files: Array<{
    path: string;
    status: string;
    additions: number;
    deletions: number;
    diff: string;
    oldContent: string;
    newContent: string;
  }>;
}> {
  const isRepo = await isGitRepo(repoDir);
  if (!isRepo) {
    return { baseBranch, headBranch, commits: [], files: [] };
  }

  const safeBase = assertBranchName(baseBranch.trim(), "Versão base");
  const safeHead = assertBranchName(headBranch.trim(), "Versão comparada");
  const range = `${safeBase}...${safeHead}`;

  const [logRes, numstatRes, nameStatusRes, mergeBaseRes] = await Promise.all([
    executeGit(
      ["log", `${safeBase}..${safeHead}`, "-n", "100", "--format=%H|%h|%an|%cI|%s"],
      repoDir,
    ),
    executeGit(
      ["-c", "core.quotepath=false", "diff", "--numstat", "-z", range],
      repoDir,
      undefined,
      { trimStdout: false },
    ),
    executeGit(
      ["-c", "core.quotepath=false", "diff", "--name-status", "-z", range],
      repoDir,
      undefined,
      { trimStdout: false },
    ),
    executeGit(["merge-base", safeBase, safeHead], repoDir),
  ]);
  const baseRef =
    mergeBaseRes.success && mergeBaseRes.stdout.trim()
      ? mergeBaseRes.stdout.trim()
      : safeBase;

  const commits: Array<{
    hash: string;
    shortHash: string;
    author: string;
    date: string;
    message: string;
  }> = [];
  if (logRes.success && logRes.stdout.trim()) {
    for (const line of logRes.stdout.trim().split("\n").filter(Boolean)) {
      const [hash, shortHash, author, date, ...msgParts] = line.split("|");
      commits.push({
        hash: hash || "",
        shortHash: shortHash || (hash || "").slice(0, 7),
        author: author || "Sistema",
        date: date || "",
        message: msgParts.join("|") || "Checkpoint",
      });
    }
  }

  const statusMap = new Map<string, string>();
  if (nameStatusRes.success && nameStatusRes.stdout) {
    const tokens = nameStatusRes.stdout.split("\0");
    for (let i = 0; i < tokens.length; i++) {
      const st = tokens[i];
      if (!st) continue;
      if (st.startsWith("R") || st.startsWith("C")) {
        i++; // skip old path
        const newPath = tokens[++i];
        if (newPath) statusMap.set(newPath, st);
      } else {
        const filePath = tokens[++i];
        if (filePath) statusMap.set(filePath, st);
      }
    }
  }

  const statsMap = new Map<string, { additions: number; deletions: number }>();
  if (numstatRes.success && numstatRes.stdout) {
    const tokens = numstatRes.stdout.split("\0");
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token) continue;
      const [addStr, delStr, ...pathParts] = token.split("\t");
      let filePath = pathParts.join("\t");
      if (filePath === "") {
        i++; // skip old path in -z rename/copy record
        filePath = tokens[++i] || "";
      }
      if (!filePath) continue;
      statsMap.set(filePath, {
        additions: parseInt(addStr, 10) || 0,
        deletions: parseInt(delStr, 10) || 0,
      });
    }
  }

  const allPaths = Array.from(new Set([...statusMap.keys(), ...statsMap.keys()])).filter((p) => {
    const clean = p.replace(/\\/g, "/");
    return !isTransientGitPath(clean) && !clean.endsWith("/.DS_Store") && clean !== ".DS_Store";
  });
  const files = await Promise.all(
    allPaths.map(async (filePath) => {
      const st = statusMap.get(filePath) || "M";
      const mappedStatus = st.startsWith("A")
        ? "ADDED"
        : st.startsWith("D")
          ? "DELETED"
          : "MODIFIED";
      let diffText = "";
      let oldContent = "";
      let newContent = "";
      try {
        const [diffRes, oldRes, newRes] = await Promise.all([
          executeGit(["diff", range, "--", filePath], repoDir),
          mappedStatus !== "ADDED"
            ? executeGit(["show", `${baseRef}:${filePath}`], repoDir)
            : Promise.resolve({ success: false, stdout: "" }),
          mappedStatus !== "DELETED"
            ? executeGit(["show", `${safeHead}:${filePath}`], repoDir)
            : Promise.resolve({ success: false, stdout: "" }),
        ]);
        if (diffRes.success && diffRes.stdout) diffText = diffRes.stdout;
        if (oldRes.success && oldRes.stdout) oldContent = oldRes.stdout;
        if (newRes.success && newRes.stdout) newContent = newRes.stdout;
      } catch {}
      const stats = statsMap.get(filePath) || { additions: 0, deletions: 0 };
      return {
        path: filePath,
        status: mappedStatus,
        additions: stats.additions,
        deletions: stats.deletions,
        diff: diffText,
        oldContent,
        newContent,
      };
    }),
  );

  return {
    baseBranch: safeBase,
    headBranch: safeHead,
    commits,
    files,
  };
}

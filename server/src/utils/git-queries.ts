import fs from "node:fs";
import path from "node:path";
import { isPathHidden, loadHiddenFiles, isSystemPath } from "./hidden-files.js";
import {
  assertCommitish,
  assertBranchName,
  assertGitPath,
} from "./git-validate.js";
import { executeGit, isGitRepo } from "./git-core.js";

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
      const parts = ref.split("/");
      const branch = parts[parts.length - 1];
      if (branch) return branch;
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
  const branch = branchRes.stdout || (await getDefaultBranch(repoDir));

  // Remote URL
  const remoteRes = await executeGit(["remote", "get-url", "origin"], repoDir);
  const remoteUrl = remoteRes.success
    ? remoteRes.stdout.replace(/x-access-token:[^@]+@/, "")
    : undefined;

  // Status porcelain with all untracked files expanded individually
  const statusRes = await executeGit(
    ["status", "--porcelain=v1", "-b", "-uall"],
    repoDir,
  );
  const lines = statusRes.stdout.split("\n").filter(Boolean);

  let ahead = 0;
  let behind = 0;
  let tracking: string | undefined;
  const files: GitFileStatus[] = [];

  for (const line of lines) {
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

    const indexCode = line[0];
    const workCode = line[1];
    const filePath = line.substring(3).trim();

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
    } else {
      statusCode = "M";
    }

    files.push({
      path: filePath,
      status: statusCode,
      staged: isStaged,
    });
  }

  const hiddenList = loadHiddenFiles(repoDir);
  const visibleFiles = files.filter((f) => !isPathHidden(f.path, hiddenList));
  const systemFiles = files.filter((f) => isSystemPath(f.path));

  return {
    isRepo: true,
    branch,
    tracking,
    ahead,
    behind,
    isClean: visibleFiles.length === 0,
    files: visibleFiles,
    systemFiles,
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

  // Identifica a branch atual de forma explícita
  let current = "main";
  try {
    const curRes = await executeGit(["branch", "--show-current"], repoDir);
    if (curRes.success && curRes.stdout.trim()) {
      current = curRes.stdout.trim();
    }
  } catch {}

  // Lista todas as branches (locais e remotas do GitHub)
  const res = await executeGit(["branch", "-a"], repoDir);
  if (!res.success)
    return { current, branches: [current], localBranches: [current] };

  const lines = res.stdout.split("\n").filter(Boolean);
  const branchSet = new Set<string>();
  const localSet = new Set<string>();
  if (current) {
    branchSet.add(current);
    localSet.add(current);
  }

  for (const rawLine of lines) {
    const isCurrent = rawLine.startsWith("*");
    const cleanLine = rawLine.replace("*", "").trim();
    if (!cleanLine || cleanLine.includes("->")) continue; // Ignora ponteiros HEAD simbólicos

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

export interface WhatsNewItem {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
}

export interface WhatsNewFile {
  path: string;
  status: "A" | "M" | "D";
  statusLabel: string;
  additions: number;
  deletions: number;
}

export interface WhatsNewProposal {
  id: string | number;
  title: string;
  author?: string;
  commitHash?: string;
}

export interface WhatsNewSummary {
  hasNewUpdates: boolean;
  latestHash: string;
  lastSeenHash?: string;
  totalNewCommits: number;
  commits: WhatsNewItem[];
  files: WhatsNewFile[];
  proposals: WhatsNewProposal[];
  summaryMessage: string;
}

export async function getWhatsNewSummary(
  repoDir: string,
  lastSeenHash?: string,
): Promise<WhatsNewSummary> {
  const emptyResult: WhatsNewSummary = {
    hasNewUpdates: false,
    latestHash: "",
    lastSeenHash,
    totalNewCommits: 0,
    commits: [],
    files: [],
    proposals: [],
    summaryMessage: "Nenhuma nova atualização encontrada.",
  };

  const isRepo = await isGitRepo(repoDir);
  if (!isRepo) return emptyResult;

  const headRes = await executeGit(["rev-parse", "HEAD"], repoDir);
  if (!headRes.success || !headRes.stdout.trim()) {
    return emptyResult;
  }
  const currentHead = headRes.stdout.trim();

  // If lastSeenHash equals currentHead, there are no unread updates
  if (lastSeenHash && lastSeenHash.trim() === currentHead) {
    return {
      ...emptyResult,
      latestHash: currentHead,
      lastSeenHash: currentHead,
      summaryMessage: "Todas as novidades já foram visualizadas.",
    };
  }

  // Check if repo has at least 1 commit
  const totalCommitsRes = await executeGit(
    ["rev-list", "--count", "HEAD"],
    repoDir,
  );
  const totalCount = totalCommitsRes.success
    ? parseInt(totalCommitsRes.stdout.trim(), 10)
    : 0;
  if (totalCount === 0) return emptyResult;

  // Determine git log / diff revision range
  let cleanLastSeen = "";
  let isValidLastSeen = false;

  if (lastSeenHash && lastSeenHash.trim().length >= 6) {
    try {
      assertCommitish(lastSeenHash.trim());
      cleanLastSeen = lastSeenHash.trim();
      const checkHash = await executeGit(
        ["cat-file", "-e", `${cleanLastSeen}^{commit}`],
        repoDir,
      );
      if (checkHash.success) {
        isValidLastSeen = true;
      }
    } catch {
      isValidLastSeen = false;
    }
  }

  // If no lastSeenHash was provided (first time opening the repo),
  // baseline is established at current HEAD with 0 unread novidades
  if (!lastSeenHash || !isValidLastSeen) {
    return {
      ...emptyResult,
      hasNewUpdates: false,
      latestHash: currentHead,
      lastSeenHash: currentHead,
      totalNewCommits: 0,
      commits: [],
      files: [],
      proposals: [],
      summaryMessage: "Repositório sincronizado. Nenhuma nova atualização recente encontrada.",
    };
  }

  // 1. Get Commits in Range (only what was pulled/merged after lastSeenHash)
  const format = "%H|%h|%an|%ad|%s";
  const logRes = await executeGit(
    ["log", "-n", "50", "--date=short", `--pretty=format:${format}`, `${cleanLastSeen}..HEAD`],
    repoDir,
  );
  const commits: WhatsNewItem[] = [];
  const proposals: WhatsNewProposal[] = [];
  const seenProposals = new Set<string>();

  if (logRes.success && logRes.stdout) {
    const lines = logRes.stdout.split("\n").filter(Boolean);
    for (const line of lines) {
      const [hash, shortHash, author, date, ...msgParts] = line.split("|");
      const message = msgParts.join("|") || "";
      commits.push({
        hash: hash || "",
        shortHash: shortHash || "",
        author: author || "Equipe",
        date: date || "",
        message,
      });

      // Detect PR / Proposal references in commit message
      const prMatch =
        message.match(/(?:#|PR\s*#?|Proposta\s*#?)(\d+)/i) ||
        message.match(/pull request #(\d+)/i);
      if (prMatch) {
        const prId = prMatch[1];
        if (!seenProposals.has(prId)) {
          seenProposals.add(prId);
          proposals.push({
            id: prId,
            title: message,
            author,
            commitHash: shortHash,
          });
        }
      }
    }
  }

  // 2. Get Changed Files in Range
  const filesMap = new Map<string, WhatsNewFile>();

  const numstatArgs = isValidLastSeen
    ? ["diff", "--numstat", `${cleanLastSeen}..HEAD`]
    : ["log", "-n", "15", "--numstat", '--pretty=', "HEAD"];
  const nameStatusArgs = isValidLastSeen
    ? ["diff", "--name-status", `${cleanLastSeen}..HEAD`]
    : ["log", "-n", "15", "--name-status", '--pretty=', "HEAD"];

  const numstatRes = await executeGit(numstatArgs, repoDir);

  if (numstatRes.success && numstatRes.stdout) {
    const lines = numstatRes.stdout.split("\n").filter(Boolean);
    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length >= 3) {
        const adds = parseInt(parts[0], 10) || 0;
        const dels = parseInt(parts[1], 10) || 0;
        let filePath = parts[2].trim();
        // Handle rename notation like "{src => 01-conceitos-do-nodejs/src}/todos.spec.js" or "old => new"
        if (filePath.includes("=>")) {
          if (filePath.includes("{") && filePath.includes("}")) {
            filePath = filePath
              .replace(/\{[^=>]*=>\s*([^}]+)\}/, "$1")
              .replace(/\/\//g, "/");
          } else {
            const renameParts = filePath.split("=>");
            filePath = (renameParts[1] || renameParts[0]).trim();
          }
        }
        if (filePath) {
          const existing = filesMap.get(filePath);
          if (existing) {
            existing.additions += adds;
            existing.deletions += dels;
          } else {
            filesMap.set(filePath, {
              path: filePath,
              status: "M",
              statusLabel: "Documento Atualizado",
              additions: adds,
              deletions: dels,
            });
          }
        }
      }
    }
  }

  const nameStatusRes = await executeGit(nameStatusArgs, repoDir);

  if (nameStatusRes.success && nameStatusRes.stdout) {
    const lines = nameStatusRes.stdout.split("\n").filter(Boolean);
    for (const line of lines) {
      const parts = line.trim().split(/\t|\s{2,}/);
      if (parts.length >= 2) {
        const rawStatus = parts[0][0]; // A, M, D, R
        const filePath = (
          rawStatus === "R" && parts.length >= 3 ? parts[2] : parts[1] || ""
        ).trim();
        if (!filePath) continue;

        const existing = filesMap.get(filePath) || {
          path: filePath,
          status: "M",
          statusLabel: "Documento Atualizado",
          additions: 0,
          deletions: 0,
        };

        if (rawStatus === "A") {
          existing.status = "A";
          existing.statusLabel = "Novo Documento";
        } else if (rawStatus === "D") {
          existing.status = "D";
          existing.statusLabel = "Documento Removido";
        } else {
          existing.status = "M";
          existing.statusLabel = "Documento Atualizado";
        }
        filesMap.set(filePath, existing);
      }
    }
  }

  const hiddenList = loadHiddenFiles(repoDir);
  const files = Array.from(filesMap.values()).filter(
    (f) => !isPathHidden(f.path, hiddenList),
  );

  const hasNewUpdates = commits.length > 0;
  const summaryMessage = hasNewUpdates
    ? `${commits.length} nova(s) publicação(ões) e ${files.length} documento(s) atualizados pela equipe.`
    : "Nenhuma alteração recente encontrada.";

  return {
    hasNewUpdates,
    latestHash: currentHead,
    lastSeenHash,
    totalNewCommits: commits.length,
    commits,
    files,
    proposals,
    summaryMessage,
  };
}

export async function getWhatsNewFileDiff(
  repoDir: string,
  filePath: string,
  lastSeenHash?: string,
): Promise<{ diff: string }> {
  const isRepo = await isGitRepo(repoDir);
  if (!isRepo) return { diff: "" };

  const cleanPath = filePath.trim().replace(/^\/+/, "");
  assertGitPath(cleanPath);

  let cleanLastSeen = "";
  let isValidLastSeen = false;
  if (lastSeenHash && lastSeenHash.trim().length >= 6) {
    try {
      assertCommitish(lastSeenHash.trim());
      cleanLastSeen = lastSeenHash.trim();
      const checkHash = await executeGit(
        ["cat-file", "-e", `${cleanLastSeen}^{commit}`],
        repoDir,
      );
      if (checkHash.success) {
        isValidLastSeen = true;
      }
    } catch {
      isValidLastSeen = false;
    }
  }

  if (isValidLastSeen && cleanLastSeen) {
    const diffRes = await executeGit(
      ["diff", `${cleanLastSeen}..HEAD`, "--", cleanPath],
      repoDir,
    );
    if (diffRes.success && diffRes.stdout) {
      return { diff: diffRes.stdout };
    }
  }

  // Fallback: show the patch from the latest commit that modified this file
  const logShow = await executeGit(
    ["log", "-n", "1", "-p", "HEAD", "--", cleanPath],
    repoDir,
  );
  if (logShow.success && logShow.stdout) {
    return { diff: logShow.stdout };
  }

  return { diff: "" };
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
      const statusRes = await executeGit(["status", "--porcelain=v1", "-uall"], repoDir);
      if (statusRes.success && statusRes.stdout) {
        const untracked = statusRes.stdout
          .split("\n")
          .filter((l) => l.startsWith("?? "))
          .map((l) => l.substring(3).trim());

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

  const hasUpdates = remoteHash.toLowerCase() !== localHash.toLowerCase();

  return {
    hasUpdates,
    localHash,
    remoteHash,
    branch,
  };
}

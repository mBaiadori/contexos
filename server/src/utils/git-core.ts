import fs from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { vaultService, VAULT_KEYS } from "../modules/vault/vault.service.js";
import { loadConfig } from "../config/storage.js";
import {
  assertCommitish,
  assertRemoteName,
  assertBranchName,
  assertGitPath,
} from "./git-validate.js";

const execFileAsync = promisify(execFile);

export interface GitProgressEvent {
  stage: string;
  percent: number;
  message?: string;
}

export function parseGitProgress(line: string): GitProgressEvent | null {
  const match = line.match(/(Receiving objects|Resolving deltas|Compressing objects|Counting objects|Updating files):\s+(\d+)%/i);
  if (match) {
    const rawStage = match[1];
    const percent = parseInt(match[2], 10);
    let stageLabel = rawStage;
    if (/receiving/i.test(rawStage)) stageLabel = "Recebendo objetos";
    else if (/resolving/i.test(rawStage)) stageLabel = "Resolvendo deltas";
    else if (/compressing/i.test(rawStage)) stageLabel = "Comprimindo";
    else if (/counting/i.test(rawStage)) stageLabel = "Contando objetos";
    else if (/updating/i.test(rawStage)) stageLabel = "Atualizando arquivos";
    return {
      stage: stageLabel,
      percent,
      message: line.trim(),
    };
  }
  return null;
}

export function buildGitEnv(token?: string): {
  env: NodeJS.ProcessEnv;
  activeToken: string | null;
  base64Token: string;
} {
  const activeToken = getActiveBearerToken(token);
  const gitEnv: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
  };

  let base64Token = "";
  if (activeToken) {
    base64Token = Buffer.from(`x-access-token:${activeToken}`).toString("base64");
    gitEnv.GIT_CONFIG_COUNT = "1";
    gitEnv.GIT_CONFIG_KEY_0 = "http.extraHeader";
    gitEnv.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${base64Token}`;
  }

  const gitBin = resolveGitBinary();
  if (gitBin !== "git") {
    const gitDir = path.dirname(path.dirname(gitBin));
    const cmdDir = path.join(gitDir, "cmd");
    const usrBinDir = path.join(gitDir, "usr", "bin");
    const existingPath = gitEnv.PATH || gitEnv.Path || "";
    gitEnv.PATH = `${cmdDir}${path.delimiter}${usrBinDir}${path.delimiter}${existingPath}`;
    gitEnv.Path = gitEnv.PATH;
  }

  return { env: gitEnv, activeToken, base64Token };
}

export function redactTokens(
  text: string,
  activeToken: string | null,
  base64Token: string,
): string {
  let safe = text;
  if (activeToken) {
    safe = safe.replaceAll(activeToken, "[REDACTED_TOKEN]");
  }
  if (base64Token) {
    safe = safe.replaceAll(base64Token, "[REDACTED_TOKEN]");
  }
  return safe;
}

export type GitExecutionHook = (args: string[], cwd: string) => void;
let gitExecutionHook: GitExecutionHook | null = null;
export function setGitExecutionHook(hook: GitExecutionHook | null): void {
  gitExecutionHook = hook;
}

/**
 * Localiza o executável do Git, priorizando o MinGit embutido no pacote do Electron (Windows)
 */
export function resolveGitBinary(): string {
  const resourcesDir = process.env.CONTEXT_OS_RESOURCES || (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesDir) {
    const candidates = [
      path.join(resourcesDir, "git", "cmd", "git.exe"),
      path.join(resourcesDir, "git", "bin", "git.exe"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return c;
      }
    }
  }

  if (process.platform === "win32") {
    const devCandidates = [
      path.resolve(process.cwd(), "desktop", "resources", "git-win", "cmd", "git.exe"),
      path.resolve(process.cwd(), "resources", "git-win", "cmd", "git.exe"),
      path.resolve(process.cwd(), "..", "desktop", "resources", "git-win", "cmd", "git.exe"),
    ];
    for (const dev of devCandidates) {
      if (fs.existsSync(dev)) {
        return dev;
      }
    }
  }

  return "git";
}

export function executeGitCommandWithProgress(
  args: string[],
  cwd: string,
  token?: string,
  onProgress?: (p: GitProgressEvent) => void,
  timeoutMs: number = 60000,
): Promise<{ stdout: string; stderr: string; success: boolean }> {
  if (gitExecutionHook) {
    try {
      gitExecutionHook(args, cwd);
    } catch {}
  }
  return new Promise((resolve) => {
    const finalArgs = [...args];
    const { env, activeToken, base64Token } = buildGitEnv(token);

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const gitBin = resolveGitBinary();
    const child = spawn(gitBin, finalArgs, {
      cwd,
      shell: false,
      env,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {}
    }, timeoutMs);

    const handleData = (chunk: Buffer) => {
      const str = chunk.toString();
      const lines = str.split(/[\r\n]+/);
      for (const line of lines) {
        if (!line.trim()) continue;
        const progress = parseGitProgress(line);
        if (progress && onProgress) {
          onProgress(progress);
        }
      }
    };

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
      handleData(data);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      let safeStdout = stdout;
      let safeStderr = stderr;
      if (activeToken) {
        safeStdout = safeStdout.replaceAll(activeToken, "[REDACTED_TOKEN]");
        safeStderr = safeStderr.replaceAll(activeToken, "[REDACTED_TOKEN]");
      }
      if (base64Token) {
        safeStdout = safeStdout.replaceAll(base64Token, "[REDACTED_TOKEN]");
        safeStderr = safeStderr.replaceAll(base64Token, "[REDACTED_TOKEN]");
      }
      if (timedOut) {
        safeStderr += `\nOperação Git abortada por timeout após ${timeoutMs}ms.`;
      }
      resolve({
        stdout: safeStdout.trim(),
        stderr: safeStderr.trim(),
        success: !timedOut && code === 0,
      });
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      const isMissingGit = err.code === "ENOENT" || err.message?.includes("ENOENT");
      const errorMsg = isMissingGit
        ? "Git não encontrado no sistema operacional. Instale o Git para Windows (https://git-scm.com) e reinicie o aplicativo."
        : err.message;
      resolve({
        stdout,
        stderr: errorMsg,
        success: false,
      });
    });
  });
}

/**
 * Obtém o Bearer Token ativo do cofre nativo de senhas ou configuração
 */
export function getActiveBearerToken(explicitToken?: string): string | null {
  if (explicitToken === "local_mode") {
    return null;
  }
  if (explicitToken && typeof explicitToken === "string" && explicitToken.trim() && explicitToken !== "local_mode") {
    return explicitToken.trim();
  }
  try {
    const vaultToken = vaultService.getSecret(VAULT_KEYS.GITHUB_TOKEN);
    if (vaultToken && vaultToken.trim() && vaultToken !== "local_mode") {
      return vaultToken.trim();
    }
  } catch {}
  try {
    const cfg = loadConfig();
    if (cfg?.token && cfg.token.trim() && cfg.token !== "local_mode") {
      return cfg.token.trim();
    }
    if (Array.isArray(cfg?.accounts) && cfg.accounts.length > 0) {
      const active = cfg.accounts.find((a: any) => a.isActive && a.token);
      if (active?.token && active.token.trim() && active.token !== "local_mode") {
        return active.token.trim();
      }
      const firstWithToken = cfg.accounts.find((a: any) => a.token && a.token.trim() && a.token !== "local_mode");
      if (firstWithToken?.token) {
        return firstWithToken.token.trim();
      }
    }
  } catch {}
  return null;
}

/**
 * Executa comandos git diretamente via execFile sem invocação de shell (/bin/sh),
 * imune a injeção de comandos, expansão de crases, $(...) e caracteres especiais.
 */
export async function executeGit(
  args: string[],
  cwd: string,
  explicitToken?: string,
  options: { timeout?: number; maxBuffer?: number } = {},
): Promise<{ stdout: string; stderr: string; success: boolean }> {
  if (gitExecutionHook) {
    try {
      gitExecutionHook(args, cwd);
    } catch {}
  }
  const { env, activeToken, base64Token } = buildGitEnv(explicitToken);

  try {
    const gitBin = resolveGitBinary();
    const { stdout, stderr } = await execFileAsync(gitBin, args, {
      cwd,
      shell: false,
      maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
      timeout: options.timeout || 30000,
      env,
    });

    return {
      stdout: redactTokens(stdout, activeToken, base64Token).trim(),
      stderr: redactTokens(stderr, activeToken, base64Token).trim(),
      success: true,
    };
  } catch (error: any) {
    const stdout = error.stdout
      ? redactTokens(String(error.stdout), activeToken, base64Token).trim()
      : "";
    const stderr = error.stderr
      ? redactTokens(String(error.stderr), activeToken, base64Token).trim()
      : redactTokens(error.message || String(error), activeToken, base64Token).trim();
    return {
      stdout,
      stderr,
      success: false,
    };
  }
}

export async function callGitHubAPI(
  endpoint: string,
  token?: string,
  method: string = "GET",
  data: any = null,
  requestOptions?: { silentStatuses?: number[]; timeoutMs?: number },
): Promise<{ statusCode: number; data: any }> {
  const url = endpoint.startsWith("http://") || endpoint.startsWith("https://")
    ? endpoint
    : `https://api.github.com${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`URL de destino inválida para a API Git: ${url}`);
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Destino da API Git não autorizado para envio de credenciais Bearer: requer HTTPS");
  }

  const allowedHosts = new Set(["api.github.com", "raw.githubusercontent.com", "github.com"]);
  const cfg = loadConfig() as Record<string, any>;
  if (cfg?.github_enterprise_api_url) {
    try {
      const entUrl = new URL(cfg.github_enterprise_api_url);
      allowedHosts.add(entUrl.hostname.toLowerCase());
    } catch {}
  }
  if (process.env.GITHUB_ENTERPRISE_HOST) {
    allowedHosts.add(process.env.GITHUB_ENTERPRISE_HOST.toLowerCase());
  }

  if (!allowedHosts.has(parsedUrl.hostname.toLowerCase())) {
    throw new Error("Destino da API Git não autorizado para envio de credenciais Bearer");
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Context-OS-Spec-Driven",
  };

  const activeToken = getActiveBearerToken(token);
  if (activeToken) {
    headers["Authorization"] = `Bearer ${activeToken}`;
  }

  const timeoutMs = requestOptions?.timeoutMs ?? 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const options: RequestInit = {
    method,
    headers,
    signal: controller.signal,
  };

  if (data && (method === "POST" || method === "PUT" || method === "PATCH")) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(data);
  }

  try {
    const res = await fetch(url, options);
    clearTimeout(timer);
    let resData: any = {};
    const text = await res.text();
    try {
      resData = text ? JSON.parse(text) : {};
    } catch {
      resData = { message: text };
    }
    const oauthScopes = res.headers.get("x-oauth-scopes");
    const acceptedScopes = res.headers.get("x-accepted-oauth-scopes");

    const isProtection404 = res.status === 404 && endpoint.includes("/branches/") && endpoint.includes("/protection");
    const isSilenced = requestOptions?.silentStatuses?.includes(res.status) || isProtection404;

    if (res.status >= 400 && !isSilenced) {
      console.warn(`[GitHub API ${res.status}] ${method} ${url}:`, {
        error: resData,
        oauthScopes,
        acceptedScopes,
      });
    }
    return {
      statusCode: res.status,
      data: resData,
    };
  } catch (err: any) {
    clearTimeout(timer);
    const isTimeout = err.name === "AbortError" || err.message?.includes("aborted");
    if (isTimeout) {
      console.warn(`[GitHub API Timeout] ${method} ${url} excedeu ${timeoutMs}ms.`);
      return {
        statusCode: 504,
        data: { message: `Tempo limite de conexão com o GitHub excedido (${timeoutMs}ms)` },
      };
    }
    return {
      statusCode: 500,
      data: { message: err.message || "Erro de conexão com o GitHub" },
    };
  }
}

export const callGitProviderAPI = callGitHubAPI;

export async function applyBranchProtection(
  repoFullName: string,
  branch: string,
  token: string,
  requiredApprovals: number = 1,
): Promise<{ statusCode: number; data: any }> {
  const endpoint = `/repos/${repoFullName}/branches/${branch}/protection`;
  const body = {
    required_status_checks: null,
    enforce_admins: true,
    required_pull_request_reviews: {
      dismiss_stale_reviews: true,
      require_code_owner_reviews: false,
      required_approving_review_count: requiredApprovals,
    },
    restrictions: null,
  };

  return await callGitHubAPI(endpoint, token, "PUT", body);
}

export async function checkBranchProtection(
  repoFullName: string,
  branch: string,
  token: string,
): Promise<{ isProtected: boolean; details?: string }> {
  if (!token || !repoFullName) {
    return { isProtected: false };
  }
  try {
    const endpoint = `/repos/${repoFullName}/branches/${branch}/protection`;
    const res = await callGitHubAPI(endpoint, token, "GET", null, { silentStatuses: [404] });
    if (res.statusCode === 200) {
      return { isProtected: true, details: "Proteção ativa no GitHub" };
    }
    return { isProtected: false, details: "Sem proteção ativa" };
  } catch (e: any) {
    return { isProtected: false, details: e.message || "Não foi possível verificar" };
  }
}

export async function isGitRepo(repoDir: string): Promise<boolean> {
  if (!fs.existsSync(repoDir)) return false;
  const gitDir = path.join(repoDir, ".git");
  return fs.existsSync(gitDir);
}

export function ensureGitIgnore(repoDir: string): void {
  const gitignorePath = path.join(repoDir, ".gitignore");
  const requiredPatterns = [
    ".DS_Store",
    "node_modules/",
    "*.log",
    ".env",
    ".docs.metadata.json",
    ".spec-memory/workspace_changes.json",
    ".spec-memory/sessions/",
  ];

  const systemPatternsToUnignore = [
    ".templates/",
    ".hidden_files.json",
    ".dictionary.json",
    ".templates.json",
    ".templates.metadata.json",
    ".project.config.json",
    ".spec-memory/",
    ".skills/",
    ".agents/",
    ".tools/",
  ];

  let currentContent = "";
  if (fs.existsSync(gitignorePath)) {
    try {
      currentContent = fs.readFileSync(gitignorePath, "utf-8");
    } catch {
      currentContent = "";
    }
  }

  let lines = currentContent.split("\n").map((l) => l.trim()).filter((l) => {
    return l && !systemPatternsToUnignore.includes(l) && l !== "# Context OS Internal Metadata";
  });

  for (const pattern of requiredPatterns) {
    if (!lines.includes(pattern)) {
      lines.push(pattern);
    }
  }

  const newContent = lines.join("\n") + "\n";
  if (newContent !== currentContent) {
    try {
      fs.writeFileSync(gitignorePath, newContent, "utf-8");
    } catch (e) {
      console.warn(`[Git] Falha ao atualizar .gitignore em ${repoDir}:`, e);
    }
  }
}

export async function ensureGitRepo(
  repoDir: string,
  _user?: { name?: string; login?: string; email?: string } | null,
  _remoteUrl?: string,
  _token?: string,
  _repoName?: string,
  _pullLatest: boolean = false,
): Promise<{ success: boolean; message: string }> {
  if (await isGitRepo(repoDir)) {
    return { success: true, message: "Repositório pronto." };
  }
  return { success: false, message: "Repositório não está clonado localmente." };
}

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveRepoDir } from '../../config/constants.js';
import { loadConfig, recordChange } from '../../config/storage.js';
import { CustomToolDefinition, ProjectToolsManifest } from './skills.types.js';
import { ToolResult } from '../ai/tools/tool.types.js';
import { safeFetch } from '../../utils/ssrf-guard.js';
import { runIsolatedScript } from './script-runner.js';
import { writeJsonAtomic, writeTextAtomic } from '../../utils/atomic-write.js';

const execFileAsync = promisify(execFile);

export interface ToolApprovalRecord {
  hash: string;
  approved_at: string;
  approved_by: string;
}

/**
 * Calcula o hash SHA-256 canônico de uma ferramenta para controle de aprovação e integridade.
 */
export function computeToolHash(tool: CustomToolDefinition): string {
  const canonicalData = {
    name: tool.name,
    handler_type: tool.handler_type,
    handler_code: tool.handler_code || '',
    handler_config: tool.handler_config || {},
    parameters: tool.parameters || {},
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonicalData)).digest('hex');
}

interface ApprovalChallenge {
  toolId: string;
  expectedHash: string;
  expiresAt: number;
}

const activeApprovalChallenges = new Map<string, ApprovalChallenge>();

export function createApprovalChallenge(toolId: string, expectedHash: string): string {
  const challengeId = crypto.randomBytes(24).toString('hex');
  activeApprovalChallenges.set(challengeId, {
    toolId,
    expectedHash,
    expiresAt: Date.now() + 60_000, // 60 segundos
  });
  return challengeId;
}

export function consumeApprovalChallenge(challengeId: string | undefined, toolId: string, providedHash: string): boolean {
  if (!challengeId) return false;
  const challenge = activeApprovalChallenges.get(challengeId);
  if (!challenge) return false;

  // Single-use: limpa imediatamente
  activeApprovalChallenges.delete(challengeId);

  if (Date.now() > challenge.expiresAt) return false;
  if (challenge.toolId !== toolId) return false;

  const bExpected = Buffer.from(challenge.expectedHash);
  const bProvided = Buffer.from(providedHash);
  if (bExpected.length !== bProvided.length) return false;

  return crypto.timingSafeEqual(bExpected, bProvided);
}

export const ALLOWED_CLI_BINARIES = new Set([
  'git',
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'cargo',
  'go',
  'docker',
  'rg',
  'grep',
  'diff',
  'patch',
  'tree',
  'echo',
  'cat',
  'ls',
  'find',
  'wc',
]);

export const FORBIDDEN_INTERPRETERS = new Set([
  'bash',
  'sh',
  'zsh',
  'csh',
  'ksh',
  'python',
  'python3',
  'node',
  'deno',
  'bun',
  'perl',
  'ruby',
  'eval',
  'cmd',
  'cmd.exe',
  'powershell',
  'powershell.exe',
  'pwsh',
  'osascript',
]);

function resolveExecutable(binName: string): string {
  const trimmed = binName.trim();
  if (path.isAbsolute(trimmed) && fs.existsSync(trimmed)) {
    return trimmed;
  }

  const searchPaths = [
    '/bin',
    '/usr/bin',
    '/usr/local/bin',
    '/opt/homebrew/bin',
    ...(process.env.PATH ? process.env.PATH.split(':') : []),
  ];

  for (const dir of searchPaths) {
    if (!dir) continue;
    const candidate = path.join(dir, trimmed);
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {}
  }

  return trimmed;
}

function getSafeRepo(repoName?: string): string {
  if (repoName) return repoName.replace(/[^a-zA-Z0-9_-]/g, '') || 'local';
  const cfg = loadConfig();
  return (cfg.active_repo?.name || 'local').replace(/[^a-zA-Z0-9_-]/g, '') || 'local';
}

export class CustomToolsService {
  private getRepoDir(repoName: string): string {
    const cfg = loadConfig();
    const safeName = getSafeRepo(repoName);
    const effectiveOwner = cfg.active_repo?.name === safeName ? cfg.active_repo?.owner : undefined;
    return resolveRepoDir(safeName, effectiveOwner);
  }

  private getToolsDir(repoName: string): string {
    return path.join(this.getRepoDir(repoName), '.tools');
  }

  private getManifestPath(repoName: string): string {
    return path.join(this.getToolsDir(repoName), 'tools.manifest.json');
  }

  /**
   * Caminho para persistência isolada de aprovações de ferramentas (fora dos repositórios)
   */
  private getApprovalsStoragePath(): string {
    const home = process.env.HOME || os.homedir();
    const configDir = path.join(home, '.context-os');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    return path.join(configDir, 'tool-approvals.json');
  }

  private loadApprovals(): Record<string, ToolApprovalRecord> {
    const p = this.getApprovalsStoragePath();
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      } catch {}
    }
    return {};
  }

  private saveApprovals(approvals: Record<string, ToolApprovalRecord>): void {
    const p = this.getApprovalsStoragePath();
    writeJsonAtomic(p, approvals, 2);
  }

  public isToolApproved(
    repoName: string,
    tool: CustomToolDefinition
  ): { approved: boolean; currentHash: string; approvedHash?: string } {
    const currentHash = computeToolHash(tool);
    const safeRepo = getSafeRepo(repoName);
    const key = `${safeRepo}:${tool.id || tool.name}`;
    const approvals = this.loadApprovals();
    const record = approvals[key];

    if (!record) {
      return { approved: false, currentHash };
    }

    const approved = record.hash === currentHash;
    return {
      approved,
      currentHash,
      approvedHash: record.hash,
    };
  }

  public approveTool(
    repoName: string,
    toolId: string,
    expectedHash: string,
    approvedBy?: string
  ): void {
    const safeRepo = getSafeRepo(repoName);
    const key = `${safeRepo}:${toolId}`;
    const approvals = this.loadApprovals();
    const systemUser = os.userInfo().username || 'operator';
    const resolvedUser =
      approvedBy && approvedBy !== 'user'
        ? approvedBy
        : `operator:${systemUser}`;
    approvals[key] = {
      hash: expectedHash,
      approved_at: new Date().toISOString(),
      approved_by: resolvedUser,
    };
    this.saveApprovals(approvals);
  }

  public revokeToolApproval(repoName: string, toolId: string): void {
    const safeRepo = getSafeRepo(repoName);
    const key = `${safeRepo}:${toolId}`;
    const approvals = this.loadApprovals();
    delete approvals[key];
    this.saveApprovals(approvals);
  }

  public getProjectManifest(repoName: string): ProjectToolsManifest {
    const manifestPath = this.getManifestPath(repoName);
    if (fs.existsSync(manifestPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (Array.isArray(data.tools)) {
          return data;
        }
      } catch (e) {
        console.warn(`[CustomToolsService] Erro ao ler ${manifestPath}:`, e);
      }
    }

    return {
      version: '1.0.0',
      project_repo: getSafeRepo(repoName),
      tools: [],
    };
  }

  private saveManifest(repoName: string, manifest: ProjectToolsManifest) {
    const toolsDir = this.getToolsDir(repoName);
    if (!fs.existsSync(toolsDir)) {
      fs.mkdirSync(toolsDir, { recursive: true });
    }
    const manifestPath = this.getManifestPath(repoName);
    writeJsonAtomic(manifestPath, manifest, 2);
  }

  public getProjectTools(repoName: string): CustomToolDefinition[] {
    const manifest = this.getProjectManifest(repoName);
    return manifest.tools || [];
  }

  public getProjectTool(repoName: string, idOrName: string): CustomToolDefinition | null {
    const tools = this.getProjectTools(repoName);
    return (
      tools.find(
        (t) =>
          t.id === idOrName ||
          t.name.toLowerCase() === idOrName.toLowerCase()
      ) || null
    );
  }

  public saveCustomTool(
    repoName: string,
    toolData: Partial<CustomToolDefinition> & { name: string; description: string }
  ): { success: boolean; tool: CustomToolDefinition } {
    const safeRepo = getSafeRepo(repoName);
    const manifest = this.getProjectManifest(safeRepo);

    const toolName = toolData.name.trim().replace(/[^a-zA-Z0-9_]/g, '_');
    const toolId = toolData.id || toolName.toLowerCase().replace(/_/g, '-');
    const now = new Date().toISOString();

    const existingIndex = manifest.tools.findIndex(
      (t: CustomToolDefinition) => t.id === toolId || t.name.toLowerCase() === toolName.toLowerCase()
    );

    const cleanTool: CustomToolDefinition = {
      id: toolId,
      name: toolName,
      title: toolData.title || toolData.name,
      description: toolData.description,
      category: toolData.category || 'utility',
      parameters: toolData.parameters || {
        type: 'object',
        properties: {},
        required: [],
      },
      handler_type: toolData.handler_type || 'javascript',
      handler_code: toolData.handler_code || '',
      handler_config: toolData.handler_config || {},
      is_active: toolData.is_active !== undefined ? toolData.is_active : true,
      source: 'project',
      created_at: existingIndex >= 0 ? manifest.tools[existingIndex].created_at : now,
      updated_at: now,
    };

    if (existingIndex >= 0) {
      manifest.tools[existingIndex] = cleanTool;
    } else {
      manifest.tools.push(cleanTool);
    }

    this.saveManifest(safeRepo, manifest);

    // Persist tool folder for ease of inspection
    const toolDir = path.join(this.getToolsDir(safeRepo), toolId);
    if (!fs.existsSync(toolDir)) {
      fs.mkdirSync(toolDir, { recursive: true });
    }
    writeJsonAtomic(path.join(toolDir, 'tool.json'), cleanTool, 2);
    if (cleanTool.handler_type === 'javascript' && cleanTool.handler_code) {
      writeTextAtomic(path.join(toolDir, 'handler.js'), cleanTool.handler_code);
    }

    recordChange(
      safeRepo,
      `.tools/${toolId}/tool.json`,
      existingIndex >= 0 ? 'MODIFIED' : 'ADDED',
      '',
      JSON.stringify(cleanTool, null, 2)
    );

    return { success: true, tool: cleanTool };
  }

  public deleteCustomTool(repoName: string, toolId: string): { success: boolean; message: string } {
    const safeRepo = getSafeRepo(repoName);
    const manifest = this.getProjectManifest(safeRepo);

    manifest.tools = manifest.tools.filter((t: CustomToolDefinition) => t.id !== toolId && t.name !== toolId);
    this.saveManifest(safeRepo, manifest);
    this.revokeToolApproval(safeRepo, toolId);

    const toolDir = path.join(this.getToolsDir(safeRepo), toolId);
    if (fs.existsSync(toolDir)) {
      try {
        fs.rmSync(toolDir, { recursive: true, force: true });
      } catch {}
    }

    recordChange(safeRepo, `.tools/${toolId}`, 'DELETED', '', '');

    return { success: true, message: `Ferramenta customizada '${toolId}' removida com sucesso.` };
  }

  /**
   * Executa a ferramenta customizada com segurança de acordo com o handler_type,
   * exigindo aprovação prévia do usuário baseada em hash SHA-256.
   */
  public async executeCustomTool(
    tool: CustomToolDefinition,
    args: Record<string, any>,
    context: { repoName: string; filePath?: string }
  ): Promise<ToolResult> {
    try {
      // 1. Verificação de aprovação explícita
      const approvalCheck = this.isToolApproved(context.repoName, tool);
      if (!approvalCheck.approved) {
        return {
          success: false,
          error: `A ferramenta customizada '${tool.name}' não possui aprovação explícita do usuário para a versão atual (hash ${approvalCheck.currentHash.slice(0, 8)}). É necessária aprovação antes da execução.`,
        };
      }

      // 2. Despacho por handler com isolamento estrito
      if (tool.handler_type === 'javascript') {
        return await this.executeJavaScriptHandler(tool, args, context);
      } else if (tool.handler_type === 'http') {
        return await this.executeHttpHandler(tool, args, context);
      } else if (tool.handler_type === 'shell') {
        return await this.executeShellHandler(tool, args, context);
      }

      return {
        success: false,
        error: `Tipo de handler desconhecido: ${tool.handler_type}`,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: `Falha na execução da ferramenta customizada '${tool.name}': ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async executeJavaScriptHandler(
    tool: CustomToolDefinition,
    args: Record<string, any>,
    context: { repoName: string; filePath?: string }
  ): Promise<ToolResult> {
    const code = tool.handler_code || '';
    if (!code.trim()) {
      return {
        success: false,
        error: `A ferramenta '${tool.name}' não possui código JavaScript de execução configurado.`,
      };
    }

    const safeRepoDir = resolveRepoDir(getSafeRepo(context.repoName));

    const result = await runIsolatedScript({
      code,
      args,
      context,
      safeRepoDir,
      timeoutMs: 15000,
    });

    if (result && typeof result === 'object') {
      const resObj = result as Record<string, unknown>;
      if ('success' in resObj || 'data' in resObj) {
        return {
          success: resObj.success !== undefined ? Boolean(resObj.success) : true,
          data: resObj.data !== undefined ? (resObj.data as Record<string, unknown>) : resObj,
          error: typeof resObj.error === 'string' ? resObj.error : undefined,
        };
      }
    }

    return {
      success: true,
      data: result as Record<string, unknown>,
    };
  }

  private async executeHttpHandler(
    tool: CustomToolDefinition,
    args: Record<string, any>,
    context: { repoName: string; filePath?: string }
  ): Promise<ToolResult> {
    const config = tool.handler_config || {};
    const rawUrl = config.url;
    if (!rawUrl) {
      return { success: false, error: `URL HTTP não configurada para a ferramenta '${tool.name}'.` };
    }

    // SSRF Guard com IP Pinning determinístico (A4): elimina TOCTOU e DNS Rebinding
    const method = config.method || 'POST';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(config.headers || {}),
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (method !== 'GET') {
      fetchOptions.body = JSON.stringify({
        args,
        context,
        tool: tool.name,
      });
    }

    const response = await safeFetch(rawUrl, fetchOptions);
    const contentType = response.headers.get('content-type') || '';
    let responseData: unknown = null;

    if (contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status} ${response.statusText}: ${JSON.stringify(responseData)}`,
      };
    }

    return {
      success: true,
      data: responseData as Record<string, unknown>,
    };
  }

  private async executeShellHandler(
    tool: CustomToolDefinition,
    args: Record<string, any>,
    context: { repoName: string; filePath?: string }
  ): Promise<ToolResult> {
    const config = tool.handler_config || {};

    // Rejeição estrita de comandos em formato legado (string arbitrária de shell)
    if (config.command && !config.executable) {
      return {
        success: false,
        error: `Configuração legada não segura detectada. Ferramentas shell devem especificar 'executable' e 'args' para execução segura sem shell.`,
      };
    }

    const executable = (config.executable || '').trim();
    if (!executable) {
      return { success: false, error: `Executável shell não configurado para a ferramenta '${tool.name}'.` };
    }

    const baseBin = path.basename(executable).toLowerCase();
    const baseBinNoExt = baseBin.replace(/\.exe$/, '');

    if (FORBIDDEN_INTERPRETERS.has(baseBin) || FORBIDDEN_INTERPRETERS.has(baseBinNoExt)) {
      return {
        success: false,
        error: `Execução bloqueada: o executável '${executable}' é um interpretador de comandos não permitido.`,
      };
    }

    if (!ALLOWED_CLI_BINARIES.has(baseBin) && !ALLOWED_CLI_BINARIES.has(baseBinNoExt)) {
      return {
        success: false,
        error: `Execução bloqueada: o binário '${executable}' não está na lista de utilitários permitidos.`,
      };
    }

    // Substituição estruturada de parâmetros em array, sem invocação de shell
    const rawArgs = Array.isArray(config.args) ? config.args : [];
    const finalArgs = rawArgs.map((argTemplate) => {
      let replaced = argTemplate;
      for (const [key, val] of Object.entries(args)) {
        replaced = replaced.replaceAll(`{{${key}}}`, String(val ?? ''));
      }
      return replaced;
    });

    const safeRepoDir = resolveRepoDir(getSafeRepo(context.repoName));
    if (!fs.existsSync(safeRepoDir)) {
      fs.mkdirSync(safeRepoDir, { recursive: true });
    }
    const resolvedBin = resolveExecutable(executable);

    const { stdout, stderr } = await execFileAsync(resolvedBin, finalArgs, {
      cwd: safeRepoDir,
      shell: false,
      timeout: 20000,
      maxBuffer: 1024 * 1024 * 2,
      env: {
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
        HOME: process.env.HOME || '',
        USER: process.env.USER || '',
      },
    });

    return {
      success: true,
      data: {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        executable,
        args: finalArgs,
      },
    };
  }
}

export const customToolsService = new CustomToolsService();

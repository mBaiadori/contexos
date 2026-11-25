import { spawn, execFile, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { IAgentProvider, ProviderCapabilities, ProviderId, ProviderMessage, ProviderMode, ProviderModelOption, ProviderSessionConfig, ProviderStatus, ProviderStreamEvent, ChatMediaAttachment } from './provider.types.js';
import type { ToolCallExecutionRecord } from '../tools/tool.types.js';
import { materializeAttachmentsForCli } from './media-attachments.js';
import { PROJECTS_DIR, resolveRepoDir } from '../../../config/constants.js';
import { loadConfig } from '../../../config/storage.js';
import { validateCliExecutable } from '../../../utils/cli-validate.js';

const FALLBACK_AGY_MODELS: ProviderModelOption[] = [
  { id: 'gemini-4-neon-low', name: 'Gemini 4 Neon', badge: 'Low' },
  { id: 'gemini-4-neon-medium', name: 'Gemini 4 Neon', badge: 'Medium' },
  { id: 'gemini-4-neon-high', name: 'Gemini 4 Neon', badge: 'High' },
  { id: 'gemini-4-neon-xhigh', name: 'Gemini 4 Neon', badge: 'XHigh' },
  { id: 'gemini-4-carbon-low', name: 'Gemini 4 Carbon', badge: 'Low' },
  { id: 'gemini-4-carbon-medium', name: 'Gemini 4 Carbon', badge: 'Medium' },
  { id: 'gemini-4-carbon-high', name: 'Gemini 4 Carbon', badge: 'High' },
  { id: 'gemini-4-argon-low', name: 'Gemini 4 Argon', badge: 'Low' },
  { id: 'gemini-4-argon-medium', name: 'Gemini 4 Argon', badge: 'Medium' },
  { id: 'gemini-4-argon-high', name: 'Gemini 4 Argon', badge: 'High' },
  { id: 'gemini-4-hydrogen-low', name: 'Gemini 4 Hydrogen', badge: 'Low' },
  { id: 'gemini-4-hydrogen-medium', name: 'Gemini 4 Hydrogen', badge: 'Medium' },
  { id: 'gemini-4-hydrogen-high', name: 'Gemini 4 Hydrogen', badge: 'High' },
  { id: 'gemini-4-hydrogen-xhigh', name: 'Gemini 4 Hydrogen', badge: 'XHigh' },
  { id: 'gemini-3.8-flash-low', name: 'Gemini 3.8 Flash', badge: 'Low' },
  { id: 'gemini-3.8-flash-medium', name: 'Gemini 3.8 Flash', badge: 'Medium' },
  { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash', badge: 'High' },
  { id: 'claude-opus-5-5-low', name: 'Claude Opus 5.5', badge: 'Low' },
  { id: 'claude-opus-5-5-medium', name: 'Claude Opus 5.5', badge: 'Medium' },
  { id: 'claude-opus-5-5-high', name: 'Claude Opus 5.5', badge: 'High' },
  { id: 'claude-sonnet-5-5-low', name: 'Claude Sonnet 5.5', badge: 'Low' },
  { id: 'claude-sonnet-5-5-medium', name: 'Claude Sonnet 5.5', badge: 'Medium' },
  { id: 'claude-sonnet-5-5-high', name: 'Claude Sonnet 5.5', badge: 'High' },
  { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B', badge: 'Medium' },
];

interface ActiveProcessSession {
  config: ProviderSessionConfig;
  process?: ChildProcess;
  outputBuffer: string;
  isWaitingApproval: boolean;
  approvalPrompt?: string;
  onEvent?: (event: ProviderStreamEvent) => void;
}

export class AntigravityAdapter implements IAgentProvider {
  readonly id: ProviderId = 'antigravity';
  readonly name = 'Google Antigravity Agent (agy)';
  readonly description = 'Execução de tarefas via agente local Antigravity com acesso ao workspace e ferramentas nativas';
  readonly mode: ProviderMode = 'connected';

  readonly capabilities: ProviderCapabilities = {
    supportsTools: true,
    supportsStreaming: true,
    supportsApprovals: true,
    supportsLocalFileSystem: true,
    supportsTerminalExecution: true,
  };

  private activeSessions = new Map<string, ActiveProcessSession>();
  private cachedModels: { items: ProviderModelOption[]; fetchedAt: number } | null = null;

  private async listModels(cliCommand: string): Promise<ProviderModelOption[]> {
    const now = Date.now();
    if (this.cachedModels && now - this.cachedModels.fetchedAt < 5 * 60 * 1000) {
      return this.cachedModels.items;
    }

    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        execFile(
          cliCommand,
          ['models'],
          {
            timeout: 4000,
            env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
          },
          (err, out) => {
            if (err) reject(err);
            else resolve(out);
          }
        );
      });
      const parsed: ProviderModelOption[] = [];
      for (const rawLine of stdout.split(/\r?\n/)) {
        // Strip ANSI escape sequences and spinner fragments
        const clean = rawLine.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏\s]+/, '').trim();
        if (!clean || clean.startsWith('Fetching')) continue;
        const match = clean.match(/^([a-z0-9._-]+)(?:\t+|\s{2,})(.+)$/i);
        if (!match) continue;
        const id = match[1].trim();
        const fullLabel = match[2].trim();
        const badgeMatch = fullLabel.match(/\(([^)]+)\)\s*$/);
        const badge = badgeMatch ? badgeMatch[1] : undefined;
        const name = badgeMatch ? fullLabel.replace(/\s*\([^)]+\)\s*$/, '').trim() : fullLabel;
        parsed.push({ id, name, badge });
      }
      if (parsed.length > 0) {
        this.cachedModels = { items: parsed, fetchedAt: now };
        return parsed;
      }
    } catch {
      // Fallback silencioso para lista conhecida quando offline/timeout
    }
    return FALLBACK_AGY_MODELS;
  }

  /**
   * Identifica o executável ou comando do Antigravity verificando caminhos reais
   */
  private resolveCliCommand(): { command: string; argsPrefix: string[]; available: boolean } {
    const cfg = loadConfig();
    const customPath = cfg.settings?.antigravity_cli_path || process.env.ANTIGRAVITY_CLI_PATH;

    if (customPath) {
      const val = validateCliExecutable(customPath, ['agy', 'antigravity']);
      if (val.valid && val.realPath) {
        return { command: val.realPath, argsPrefix: [], available: true };
      }
    }

    // Possíveis locais conhecidos do binário agy
    const possiblePaths = [
      path.join(process.env.HOME || '', '.local/bin/agy'),
      '/usr/local/bin/agy',
      '/opt/homebrew/bin/agy',
      path.join(process.env.HOME || '', '.antigravity/antigravity/bin/agy'),
      path.join(process.env.HOME || '', '.antigravity-ide/antigravity-ide/bin/agy'),
    ];

    for (const p of possiblePaths) {
      const val = validateCliExecutable(p, ['agy', 'antigravity']);
      if (val.valid && val.realPath) {
        return { command: val.realPath, argsPrefix: ['--dangerously-skip-permissions', '-p'], available: true };
      }
    }

    return { command: 'agy', argsPrefix: ['--dangerously-skip-permissions', '-p'], available: false };
  }

  async getStatus(): Promise<ProviderStatus> {
    const cli = this.resolveCliCommand();
    const geminiDir = path.join(process.env.HOME || '', '.gemini');
    const hasGeminiEnv = fs.existsSync(geminiDir);
    const models = cli.available ? await this.listModels(cli.command) : FALLBACK_AGY_MODELS;

    return {
      id: this.id,
      name: this.name,
      description: this.description,
      mode: this.mode,
      isAvailable: cli.available,
      isAuthenticated: hasGeminiEnv,
      statusMessage: cli.available
        ? `CLI do Antigravity pronta (${cli.command})`
        : 'CLI do Antigravity (agy) não localizada no PATH. Configure o caminho em Configurações.',
      capabilities: this.capabilities,
      models,
    };
  }

  async startSession(config: ProviderSessionConfig): Promise<void> {
    this.activeSessions.set(config.sessionId, {
      config,
      outputBuffer: '',
      isWaitingApproval: false,
    });
  }

  async sendMessage(
    sessionId: string,
    message: string,
    onEvent: (event: ProviderStreamEvent) => void,
    options?: {
      history?: ProviderMessage[];
      briefing?: string;
      contextPointers?: string[];
      attachments?: ChatMediaAttachment[];
    }
  ): Promise<{ reply: string; toolCalls?: ToolCallExecutionRecord[] }> {
    const cli = this.resolveCliCommand();

    if (!cli.available) {
      const errMsg = `⚠️ O executável da CLI do Antigravity ('agy') não foi localizado no seu sistema.\n\nPara resolver:\n1. Verifique se a CLI está instalada no seu terminal ou defina o caminho em 'Configurações > Antigravity CLI Path'.\n2. Ou selecione **Claude Code** ou **Direct API** no seletor de provedor acima para continuar conversando.`;
      
      onEvent({
        type: 'token',
        provider: this.id,
        sessionId,
        text: errMsg,
        timestamp: Date.now(),
      });

      onEvent({
        type: 'done',
        provider: this.id,
        sessionId,
        data: { reply: errMsg },
        timestamp: Date.now(),
      });

      return { reply: errMsg };
    }

    let session = this.activeSessions.get(sessionId);
    if (!session) {
      const targetPath = resolveRepoDir('local');
      session = {
        config: { sessionId, repoName: 'local', projectPath: targetPath },
        outputBuffer: '',
        isWaitingApproval: false,
      };
      this.activeSessions.set(sessionId, session);
    }

    session.onEvent = onEvent;
    session.outputBuffer = '';
    session.isWaitingApproval = false;

    const targetCwd = session.config.projectPath || resolveRepoDir(session.config.repoName || 'local');
    if (!fs.existsSync(targetCwd)) {
      fs.mkdirSync(targetCwd, { recursive: true });
    }

    const { promptBlock: mediaPromptBlock } = materializeAttachmentsForCli(sessionId, options?.attachments);

    const formattedPrompt = [
      options?.contextPointers && options.contextPointers.length > 0
        ? `[DIRETRIZES DE CONTEXTO DO PROJETO]\n${options.contextPointers.join('\n')}\n`
        : '',
      options?.briefing ? `[MEMÓRIA / HANDOFF]\n${options.briefing}\n` : '',
      mediaPromptBlock,
      `[INSTRUÇÃO DO USUÁRIO]\n${message}`,
    ].filter(Boolean).join('\n\n');

    onEvent({
      type: 'start',
      provider: this.id,
      sessionId,
      data: { cwd: targetCwd, command: cli.command },
      timestamp: Date.now(),
    });

    return new Promise<{ reply: string; toolCalls?: ToolCallExecutionRecord[] }>((resolve, reject) => {
      let finalReply = '';

      try {
        const cfg = loadConfig();
        const effort = cfg.settings?.agent_effort || 'medium';
        const model = cfg.settings?.agent_model;

        const spawnArgs: string[] = ['--dangerously-skip-permissions'];
        // Model IDs from `agy models` already encode their effort suffix (e.g. -medium, -high, -xhigh).
        // Passing --effort alongside an effort-suffixed --model causes `agy` to reject with a conflict error.
        const hasEmbeddedEffort = Boolean(model && /-(low|medium|high|xhigh|max)$/i.test(model));
        if (effort && !hasEmbeddedEffort) {
          spawnArgs.push('--effort', effort);
        }
        if (model) {
          spawnArgs.push('--model', model);
        }
        spawnArgs.push('-p', formattedPrompt);

        const safeEnv: NodeJS.ProcessEnv = {
          PATH: process.env.PATH || '',
          HOME: process.env.HOME || '',
          USER: process.env.USER || '',
          LANG: process.env.LANG || 'en_US.UTF-8',
          PAGER: 'cat',
          FORCE_COLOR: '0',
          CONTEXT_OS_PROJECT_ROOT: targetCwd,
        };

        // Dispara o processo diretamente sem shell intermediário para evitar falha de parse de strings
        const child = spawn(cli.command, spawnArgs, {
          cwd: targetCwd,
          env: safeEnv,
        });

        session!.process = child;

        child.stdout?.on('data', (chunk: Buffer) => {
          const text = chunk.toString('utf-8');
          session!.outputBuffer += text;
          finalReply += text;

          // Detecta pedidos de aprovação comuns de CLI (y/n, confirm, allow)
          const lowerText = text.toLowerCase();
          if (
            lowerText.includes('(y/n)') || 
            lowerText.includes('[y/n]') || 
            lowerText.includes('[y/n]?') || 
            lowerText.includes('deseja continuar') || 
            lowerText.includes('do you want to proceed') ||
            lowerText.includes('approve?')
          ) {
            session!.isWaitingApproval = true;
            session!.approvalPrompt = text.trim();
            onEvent({
              type: 'approval_request',
              provider: this.id,
              sessionId,
              approvalPrompt: text.trim(),
              timestamp: Date.now(),
            });
          } else {
            onEvent({
              type: 'token',
              provider: this.id,
              sessionId,
              text,
              timestamp: Date.now(),
            });
          }
        });

        child.stderr?.on('data', (chunk: Buffer) => {
          const errText = chunk.toString('utf-8');
          onEvent({
            type: 'token',
            provider: this.id,
            sessionId,
            text: `\n[Log]: ${errText}`,
            timestamp: Date.now(),
          });
        });

        child.on('error', (err) => {
          const errMessage = `Erro ao executar o comando '${cli.command}': ${err.message}`;
          onEvent({
            type: 'error',
            provider: this.id,
            sessionId,
            data: errMessage,
            timestamp: Date.now(),
          });
          resolve({ reply: errMessage });
        });

        child.on('close', (code) => {
          session!.process = undefined;
          session!.isWaitingApproval = false;

          const cleanReply = finalReply
            .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
            .trim();

          onEvent({
            type: 'done',
            provider: this.id,
            sessionId,
            data: { exitCode: code, fullOutput: session!.outputBuffer },
            timestamp: Date.now(),
          });

          resolve({
            reply: cleanReply || (code === 0 ? 'Tarefa executada com sucesso pelo Antigravity.' : `Processo finalizado com código ${code}`),
          });
        });
      } catch (err: unknown) {
        const errMessage = `Falha ao iniciar processo: ${err instanceof Error ? err.message : String(err)}`;
        onEvent({
          type: 'error',
          provider: this.id,
          sessionId,
          data: errMessage,
          timestamp: Date.now(),
        });
        resolve({ reply: errMessage });
      }
    });
  }

  async sendApproval(sessionId: string, approved: boolean, customInput?: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.process || !session.process.stdin) {
      throw new Error(`Nenhum processo ativo aguardando aprovação para a sessão ${sessionId}`);
    }

    const payload = customInput ? `${customInput}\n` : (approved ? 'y\n' : 'n\n');
    session.process.stdin.write(payload);
    session.isWaitingApproval = false;
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      if (session.process) {
        session.process.kill('SIGTERM');
      }
      this.activeSessions.delete(sessionId);
    }
  }
}

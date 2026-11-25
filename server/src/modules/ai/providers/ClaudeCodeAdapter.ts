import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { IAgentProvider, ProviderCapabilities, ProviderId, ProviderMessage, ProviderMode, ProviderModelOption, ProviderSessionConfig, ProviderStatus, ProviderStreamEvent } from './provider.types.js';
import { PROJECTS_DIR, resolveRepoDir } from '../../../config/constants.js';
import { loadConfig } from '../../../config/storage.js';
import { validateCliExecutable } from '../../../utils/cli-validate.js';

interface ActiveProcessSession {
  config: ProviderSessionConfig;
  process?: ChildProcess;
  outputBuffer: string;
  isWaitingApproval: boolean;
  approvalPrompt?: string;
  onEvent?: (event: ProviderStreamEvent) => void;
}

const CLAUDE_CLI_MODELS: ProviderModelOption[] = [
  { id: 'sonnet', name: 'Claude Sonnet', badge: 'Padrão' },
  { id: 'opus', name: 'Claude Opus', badge: 'Avançado' },
  { id: 'haiku', name: 'Claude Haiku', badge: 'Rápido' },
];

export class ClaudeCodeAdapter implements IAgentProvider {
  readonly id: ProviderId = 'claude-code';
  readonly name = 'Claude Code CLI';
  readonly description = 'Execução de tarefas e agentes via Claude Code CLI instalado localmente';
  readonly mode: ProviderMode = 'connected';

  readonly capabilities: ProviderCapabilities = {
    supportsTools: true,
    supportsStreaming: true,
    supportsApprovals: true,
    supportsLocalFileSystem: true,
    supportsTerminalExecution: true,
  };

  private activeSessions = new Map<string, ActiveProcessSession>();

  private resolveCliPath(): string | null {
    const cfg = loadConfig();
    const customPath = (cfg.settings as any)?.claude_cli_path || process.env.CLAUDE_CLI_PATH;
    if (customPath) {
      const val = validateCliExecutable(customPath, ['claude']);
      if (val.valid && val.realPath) {
        return val.realPath;
      }
    }

    const possiblePaths = [
      path.join(process.env.HOME || '', '.local/bin/claude'),
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
    ];

    for (const p of possiblePaths) {
      const val = validateCliExecutable(p, ['claude']);
      if (val.valid && val.realPath) {
        return val.realPath;
      }
    }
    return null;
  }

  async getStatus(): Promise<ProviderStatus> {
    const cliPath = this.resolveCliPath();
    const isAvailable = Boolean(cliPath);

    return {
      id: this.id,
      name: this.name,
      description: this.description,
      mode: this.mode,
      isAvailable,
      isAuthenticated: isAvailable,
      statusMessage: isAvailable ? `Claude CLI localizado em ${cliPath}` : 'Claude CLI não localizado em ~/.local/bin/claude',
      capabilities: this.capabilities,
      models: CLAUDE_CLI_MODELS,
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
    }
  ): Promise<{ reply: string; toolCalls?: any[] }> {
    const cliPath = this.resolveCliPath();
    if (!cliPath) {
      const errMsg = 'Claude CLI não está instalado ou não foi encontrado em ~/.local/bin/claude.';
      onEvent({
        type: 'error',
        provider: this.id,
        sessionId,
        data: errMsg,
        timestamp: Date.now(),
      });
      throw new Error(errMsg);
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

    const formattedPrompt = [
      options?.contextPointers && options.contextPointers.length > 0
        ? `[DIRETRIZES DE CONTEXTO DO PROJETO]\n${options.contextPointers.join('\n')}\n`
        : '',
      options?.briefing ? `[MEMÓRIA / HANDOFF]\n${options.briefing}\n` : '',
      `[INSTRUÇÃO DO USUÁRIO]\n${message}`,
    ].filter(Boolean).join('\n\n');

    onEvent({
      type: 'start',
      provider: this.id,
      sessionId,
      data: { cwd: targetCwd, command: cliPath },
      timestamp: Date.now(),
    });

    return new Promise<{ reply: string; toolCalls?: any[] }>((resolve, reject) => {
      let finalReply = '';

      try {
        const cfg = loadConfig();
        const claudeModel = (cfg.settings as any)?.claude_model;
        const spawnArgs: string[] = [];
        if (claudeModel) {
          spawnArgs.push('--model', claudeModel);
        }
        // Usa -p (print/non-interactive prompt) para execução segura
        spawnArgs.push('-p', formattedPrompt);

        const child = spawn(cliPath, spawnArgs, {
          cwd: targetCwd,
          env: {
            ...process.env,
            PAGER: 'cat',
            FORCE_COLOR: '0',
          },
        });

        session!.process = child;

        child.stdout?.on('data', (chunk: Buffer) => {
          const text = chunk.toString('utf-8');
          session!.outputBuffer += text;
          finalReply += text;

          onEvent({
            type: 'token',
            provider: this.id,
            sessionId,
            text,
            timestamp: Date.now(),
          });
        });

        child.stderr?.on('data', (chunk: Buffer) => {
          const errText = chunk.toString('utf-8');
          onEvent({
            type: 'token',
            provider: this.id,
            sessionId,
            text: `\n[Claude Log]: ${errText}`,
            timestamp: Date.now(),
          });
        });

        child.on('error', (err) => {
          onEvent({
            type: 'error',
            provider: this.id,
            sessionId,
            data: `Falha ao iniciar processo Claude Code: ${err.message}`,
            timestamp: Date.now(),
          });
          reject(err);
        });

        child.on('close', (code) => {
          session!.process = undefined;
          session!.isWaitingApproval = false;

          onEvent({
            type: 'done',
            provider: this.id,
            sessionId,
            data: { exitCode: code, fullOutput: session!.outputBuffer },
            timestamp: Date.now(),
          });

          resolve({
            reply: finalReply.trim() || `Processo finalizado com código ${code}`,
          });
        });
      } catch (err: any) {
        onEvent({
          type: 'error',
          provider: this.id,
          sessionId,
          data: err?.message || String(err),
          timestamp: Date.now(),
        });
        reject(err);
      }
    });
  }

  async sendApproval(sessionId: string, approved: boolean, customInput?: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.process || !session.process.stdin) {
      throw new Error(`Nenhum processo ativo para a sessão ${sessionId}`);
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

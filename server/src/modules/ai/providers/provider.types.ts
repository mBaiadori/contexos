export type ProviderMode = 'direct' | 'connected';

export type ProviderId = 'direct-api' | 'antigravity' | 'claude-code' | 'aider' | string;

export interface ProviderMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type StreamEventType = 
  | 'start'
  | 'token'
  | 'tool_call'
  | 'tool_result'
  | 'approval_request'
  | 'status'
  | 'error'
  | 'stream_telemetry'
  | 'done';

export interface ProviderStreamEvent {
  type: StreamEventType;
  provider: ProviderId;
  sessionId?: string;
  data?: any;
  text?: string;
  toolName?: string;
  toolArgs?: any;
  approvalPrompt?: string;
  timestamp?: number;
}

export interface ProviderCapabilities {
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsApprovals: boolean;
  supportsLocalFileSystem: boolean;
  supportsTerminalExecution: boolean;
}

export interface ProviderModelOption {
  id: string;
  name: string;
  badge?: string;
}

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  description: string;
  mode: ProviderMode;
  isAvailable: boolean;
  isAuthenticated: boolean;
  statusMessage?: string;
  capabilities: ProviderCapabilities;
  models?: ProviderModelOption[];
}

export interface ProviderSessionConfig {
  sessionId: string;
  repoName: string;
  projectPath: string;
  contextPointers?: string[];
  systemPrompt?: string;
}

export interface IAgentProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly description: string;
  readonly mode: ProviderMode;
  readonly capabilities: ProviderCapabilities;

  /**
   * Verifica se a ferramenta/CLI está instalada e disponível no sistema
   */
  getStatus(): Promise<ProviderStatus>;

  /**
   * Inicia uma sessão no diretório de projeto especificado
   */
  startSession(config: ProviderSessionConfig): Promise<void>;

  /**
   * Envia uma mensagem/tarefa para o provedor com streaming de eventos
   */
  sendMessage(
    sessionId: string,
    message: string,
    onEvent: (event: ProviderStreamEvent) => void,
    options?: {
      history?: ProviderMessage[];
      briefing?: string;
      contextPointers?: string[];
      content?: string;
    }
  ): Promise<{ reply: string; toolCalls?: any[] }>;

  /**
   * Responde a uma solicitação de aprovação interativa (y/n ou resposta textual)
   */
  sendApproval(sessionId: string, approved: boolean, customInput?: string): Promise<void>;

  /**
   * Interrompe a execução atual ou encerra a sessão
   */
  stopSession(sessionId: string): Promise<void>;
}

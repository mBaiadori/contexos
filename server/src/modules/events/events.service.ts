import fs from 'node:fs';
import { FastifyReply } from 'fastify';
import { PROJECTS_DIR } from '../../config/constants.js';

type Client = {
  reply: FastifyReply;
};

class EventsService {
  private clients: Set<Client> = new Set();
  private maxClients = 30;
  private nativeWatcher: fs.FSWatcher | null = null;
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor() {
    this.initWatcher();
  }

  public getMaxClients(): number {
    return this.maxClients;
  }

  public getClientCount(): number {
    return this.clients.size;
  }

  public addClient(reply: FastifyReply): Client {
    if (this.clients.size >= this.maxClients) {
      throw new Error('Limite máximo de conexões de eventos simultâneas atingido (30).');
    }
    const client: Client = { reply };
    this.clients.add(client);
    return client;
  }

  public removeClient(client: Client): void {
    this.clients.delete(client);
  }

  public broadcast(eventType: string, data: any = {}): void {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const msg = `event: ${eventType}\ndata: ${payload}\n\n`;

    for (const client of this.clients) {
      try {
        client.reply.raw.write(msg);
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  public closeAll(): void {
    for (const client of this.clients) {
      try {
        client.reply.raw.end();
        client.reply.raw.destroy();
        client.reply.raw.socket?.destroy();
      } catch {}
    }
    this.clients.clear();
    if (this.nativeWatcher) {
      try {
        this.nativeWatcher.close();
      } catch {}
      this.nativeWatcher = null;
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  private isIgnored(relPath: string): boolean {
    const normalized = relPath.replace(/\\/g, '/');
    const basename = normalized.split('/').pop() || '';
    return (
      basename === '.docs.metadata.json' ||
      basename === '.dictionary.json' ||
      basename === '.templates.json' ||
      basename === '.templates.metadata.json' ||
      basename === '.hidden_files.json' ||
      basename === '.project.config.json' ||
      basename === '.workspace_changes.json' ||
      basename === '.prs.json' ||
      basename === '.gitignore' ||
      basename === '.gitattributes' ||
      basename === '.DS_Store' ||
      normalized.includes('/.git/') ||
      normalized.includes('/.git') ||
      normalized.startsWith('.git/') ||
      normalized.startsWith('.git') ||
      normalized.includes('/.rag/') ||
      normalized.startsWith('.rag') ||
      normalized.includes('/.sessions/') ||
      normalized.startsWith('.sessions') ||
      normalized.includes('/.clone-tmp-') ||
      normalized.startsWith('.clone-tmp-') ||
      normalized.includes('/node_modules/') ||
      normalized.startsWith('node_modules/') ||
      normalized === 'node_modules' ||
      normalized.includes('/.next/') ||
      normalized.startsWith('.next/') ||
      normalized === '.next' ||
      normalized.includes('/dist/') ||
      normalized.startsWith('dist/') ||
      normalized === 'dist' ||
      normalized.includes('/build/') ||
      normalized.startsWith('build/') ||
      normalized === 'build' ||
      normalized.includes('/.turbo/') ||
      normalized.includes('/coverage/') ||
      normalized.includes('/.venv/') ||
      normalized.includes('/venv/') ||
      normalized.includes('/vendor/') ||
      normalized.endsWith('.DS_Store')
    );
  }

  private initWatcher(): void {
    if (!fs.existsSync(PROJECTS_DIR)) {
      try {
        fs.mkdirSync(PROJECTS_DIR, { recursive: true });
      } catch {}
    }

    try {
      // Usa fs.watch nativo com suporte recursivo do SO (FSEvents no macOS / ReadDirectoryChangesW no Windows)
      // Consome apenas 1 descritor de arquivo para toda a árvore de diretórios, exatamente como o VS Code e Electron.
      this.nativeWatcher = fs.watch(
        PROJECTS_DIR,
        { recursive: true, persistent: false },
        (eventType, filename) => {
          if (!filename) return;
          const relPath = String(filename);
          if (this.isIgnored(relPath)) return;

          const existingTimer = this.debounceTimers.get(relPath);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }

          const timer = setTimeout(() => {
            this.debounceTimers.delete(relPath);
            this.broadcast('refresh', {
              timestamp: Date.now(),
              file: relPath,
              action: eventType,
            });
            this.broadcast('file_changed', {
              timestamp: Date.now(),
              file: relPath,
              action: eventType,
            });
          }, 150);

          this.debounceTimers.set(relPath, timer);
        },
      );

      this.nativeWatcher.on('error', (err: unknown) => {
        console.warn('[Events] Aviso no file watcher:', (err as any)?.code || err);
      });
    } catch (err) {
      console.warn('[Events] Não foi possível iniciar o file watcher nativo:', err);
    }
  }
}

export const eventsService = new EventsService();

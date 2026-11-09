import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

interface KeyringEntryInstance {
  getPassword(): string | null;
  setPassword(password: string): void;
  deletePassword(): void;
}

interface KeyringEntryConstructor {
  new (service: string, account: string): KeyringEntryInstance;
}

let KeyringEntry: KeyringEntryConstructor | null = null;
let keyringInitAttempted = false;

function getKeyringEntryClass(): KeyringEntryConstructor | null {
  if (keyringInitAttempted) return KeyringEntry;
  keyringInitAttempted = true;
  try {
    let req: NodeRequire | null = null;
    if (typeof require !== 'undefined') {
      req = require;
    } else {
      req = createRequire(import.meta.url);
    }
    if (req) {
      try {
        const mod = req('@napi-rs/keyring') as { Entry?: KeyringEntryConstructor; default?: { Entry?: KeyringEntryConstructor } };
        KeyringEntry = mod?.Entry || mod?.default?.Entry || null;
      } catch {
        // Tenta resolver a partir de locais conhecidos no Electron empacotado e workspaces
        const resources = (process as any).resourcesPath || process.env.CONTEXT_OS_RESOURCES || '';
        const candidatePaths = [
          path.join(resources, 'app.asar.unpacked', 'node_modules', '@napi-rs/keyring'),
          path.join(resources, 'node_modules', '@napi-rs/keyring'),
          path.resolve(process.cwd(), 'desktop', 'node_modules', '@napi-rs/keyring'),
          path.resolve(process.cwd(), 'server', 'node_modules', '@napi-rs/keyring'),
          path.resolve(process.cwd(), 'node_modules', '@napi-rs/keyring'),
        ];
        for (const candidate of candidatePaths) {
          try {
            if (fs.existsSync(candidate)) {
              const mod = req(candidate) as { Entry?: KeyringEntryConstructor; default?: { Entry?: KeyringEntryConstructor } };
              KeyringEntry = mod?.Entry || mod?.default?.Entry || null;
              if (KeyringEntry) break;
            }
          } catch {}
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[VaultService] Módulo nativo @napi-rs/keyring não disponível:', msg);
  }
  return KeyringEntry;
}

export const VAULT_KEYS = {
  GITHUB_TOKEN: 'github_token',
  AI_API_KEY: 'ai_api_key',
  NOTIFICATION_EMAIL_KEY: 'notification_email_key',
  NOTIFICATION_SMTP_CONFIG: 'notification_smtp_config',
  NOTIFICATION_WEBHOOK_SECRET: 'notification_webhook_secret',
} as const;

export type VaultKey = typeof VAULT_KEYS[keyof typeof VAULT_KEYS] | string;

export class VaultService {
  private readonly serviceName = 'ContextOS';
  private readonly fallbackStore = new Map<string, string>();

  /**
   * Obtém um segredo armazenado no cofre nativo do Sistema Operacional (Keychain/DPAPI/SecretService)
   */
  getSecret(key: VaultKey): string | null {
    const Entry = getKeyringEntryClass();
    if (Entry) {
      try {
        const entry = new Entry(this.serviceName, key);
        const secret = entry.getPassword();
        if (secret) return secret;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[VaultService] Aviso ao ler segredo '${key}' do cofre nativo:`, msg);
      }
    }
    return this.fallbackStore.get(key) || null;
  }

  /**
   * Salva um segredo no cofre nativo do Sistema Operacional
   */
  setSecret(key: VaultKey, secret: string): boolean {
    const trimmed = secret?.trim() || '';
    if (!trimmed) {
      return this.deleteSecret(key);
    }
    const Entry = getKeyringEntryClass();
    if (Entry) {
      try {
        const entry = new Entry(this.serviceName, key);
        entry.setPassword(trimmed);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[VaultService] Aviso ao gravar segredo '${key}' no cofre nativo:`, msg);
      }
    }
    this.fallbackStore.set(key, trimmed);
    return true;
  }

  /**
   * Alias de conveniência para setSecret
   */
  saveSecret(key: VaultKey, secret: string): boolean {
    return this.setSecret(key, secret);
  }

  /**
   * Remove um segredo do cofre nativo do Sistema Operacional
   */
  deleteSecret(key: VaultKey): boolean {
    const Entry = getKeyringEntryClass();
    if (Entry) {
      try {
        const entry = new Entry(this.serviceName, key);
        entry.deletePassword();
      } catch {
        // Ignora erro se item não existir
      }
    }
    this.fallbackStore.delete(key);
    return true;
  }

  /**
   * Verifica se o segredo existe e possui valor não vazio no cofre do SO
   */
  hasSecret(key: VaultKey): boolean {
    const val = this.getSecret(key);
    return Boolean(val && val.length > 0);
  }
}

export const vaultService = new VaultService();


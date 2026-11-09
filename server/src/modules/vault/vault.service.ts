import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { BASE_DIR } from '../../config/constants.js';

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
  // No macOS, a chamada direta ao SecKeychain via @napi-rs/keyring em aplicativos ad-hoc ou dev
  // gera prompts repetitivos e intrusivos do Keychain Access. Usamos o cofre seguro AES-256-GCM.
  if (process.platform === 'darwin') {
    return null;
  }

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
        const resources = (process as unknown as { resourcesPath?: string }).resourcesPath || process.env.CONTEXT_OS_RESOURCES || '';
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

/**
 * Cofre Seguro Criptografado com AES-256-GCM
 * Garante armazenamento persistente, sem falhas de permissão e sem prompts intrusivos no macOS.
 */
class EncryptedFileVault {
  private cache: Map<string, string> = new Map();
  private loaded = false;

  private getVaultPath(): string {
    const dir = process.env.CONTEXT_OS_USER_DATA || BASE_DIR || process.cwd();
    return path.join(dir, '.vault.enc');
  }

  private getKey(): Buffer {
    const user = os.userInfo?.()?.username || process.env.USER || 'default';
    const host = os.hostname?.() || 'localhost';
    return crypto.scryptSync(`context-os-vault:${user}:${host}`, 'context-os-salt-2026', 32);
  }

  private encrypt(plainText: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.getKey(), iv);
    const enc = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  private decrypt(cipherTextBase64: string): string | null {
    try {
      const buf = Buffer.from(cipherTextBase64, 'base64');
      if (buf.length < 28) return null;
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const enc = buf.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.getKey(), iv);
      decipher.setAuthTag(tag);
      return decipher.update(enc) + decipher.final('utf8');
    } catch {
      return null;
    }
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const vPath = this.getVaultPath();
      if (fs.existsSync(vPath)) {
        const raw = fs.readFileSync(vPath, 'utf8');
        const jsonStr = this.decrypt(raw);
        if (jsonStr) {
          const parsed = JSON.parse(jsonStr);
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'string') this.cache.set(k, v);
          }
        }
      }
    } catch {
      // Ignora erro de leitura e inicia vazio
    }
  }

  private save(): void {
    try {
      const vPath = this.getVaultPath();
      const parentDir = path.dirname(vPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      const data: Record<string, string> = {};
      for (const [k, v] of this.cache.entries()) {
        data[k] = v;
      }
      const encrypted = this.encrypt(JSON.stringify(data));
      fs.writeFileSync(vPath, encrypted, 'utf8');
    } catch {
      // Fallback em memória permanece íntegro
    }
  }

  get(key: string): string | null {
    this.load();
    return this.cache.get(key) || null;
  }

  set(key: string, val: string): void {
    this.load();
    this.cache.set(key, val);
    this.save();
  }

  delete(key: string): void {
    this.load();
    this.cache.delete(key);
    this.save();
  }
}

export class VaultService {
  private readonly serviceName = 'ContextOS';
  private readonly fileVault = new EncryptedFileVault();

  /**
   * Obtém um segredo armazenado no cofre nativo do Sistema Operacional (Keychain/DPAPI/SecretService)
   * ou no cofre local criptografado AES-256-GCM.
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
    return this.fileVault.get(key);
  }

  /**
   * Salva um segredo no cofre do Sistema Operacional
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
    this.fileVault.set(key, trimmed);
    return true;
  }

  /**
   * Alias de conveniência para setSecret
   */
  saveSecret(key: VaultKey, secret: string): boolean {
    return this.setSecret(key, secret);
  }

  /**
   * Remove um segredo do cofre
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
    this.fileVault.delete(key);
    return true;
  }

  /**
   * Verifica se o segredo existe e possui valor não vazio no cofre
   */
  hasSecret(key: VaultKey): boolean {
    const val = this.getSecret(key);
    return Boolean(val && val.length > 0);
  }
}

export const vaultService = new VaultService();



import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas
export const SESSION_TTL_SEC = SESSION_TTL_MS / 1000; // 43.200 segundos

let activeSessionToken: string | null = null;
let sessionExpiresAt: number = 0;

function getTokenStoragePath(): string {
  const home = process.env.CONTEXT_OS_USER_DATA || process.env.HOME || os.homedir();
  const dir = path.join(home, '.context-os');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return path.join(dir, 'session-token');
}

/**
 * Gera e persiste um novo token de sessão local com TTL de 12 horas.
 */
export function rotateSessionToken(): string {
  const now = Date.now();
  const newToken = crypto.randomBytes(32).toString('hex');
  activeSessionToken = newToken;
  sessionExpiresAt = now + SESSION_TTL_MS;

  // Persiste em disco com 0600 para integração com CLI/Desktop se necessário
  try {
    const tokenPath = getTokenStoragePath();
    fs.writeFileSync(tokenPath, newToken, { mode: 0o600, encoding: 'utf-8' });
  } catch (e) {
    // Não bloqueia caso o sistema de arquivos esteja protegido
  }

  return activeSessionToken;
}

/**
 * Retorna o token de sessão local ativo com TTL de 12 horas.
 */
export function getSessionToken(): string {
  const now = Date.now();
  if (activeSessionToken && now < sessionExpiresAt) {
    return activeSessionToken;
  }

  return rotateSessionToken();
}

export type TokenValidationResult = {
  valid: boolean;
  reason?: 'missing' | 'invalid' | 'expired';
};

/**
 * Validação de token com retorno de motivo (missing | invalid | expired)
 * e renovação deslizante (sliding window).
 */
export function validateSessionToken(candidate?: string | null): TokenValidationResult {
  if (!candidate || typeof candidate !== 'string') {
    return { valid: false, reason: 'missing' };
  }

  // Garante que a sessão inicial foi inicializada
  if (!activeSessionToken) {
    getSessionToken();
  }

  if (!activeSessionToken) {
    return { valid: false, reason: 'invalid' };
  }

  const candBuf = Buffer.from(candidate);
  const curBuf = Buffer.from(activeSessionToken);

  if (candBuf.length !== curBuf.length) {
    return { valid: false, reason: 'invalid' };
  }

  const isMatch = crypto.timingSafeEqual(candBuf, curBuf);
  if (!isMatch) {
    return { valid: false, reason: 'invalid' };
  }

  const now = Date.now();
  if (now > sessionExpiresAt) {
    return { valid: false, reason: 'expired' };
  }

  // Renovação deslizante
  sessionExpiresAt = now + SESSION_TTL_MS;
  return { valid: true };
}

/**
 * Validação simplificada em tempo constante para compatibilidade backward.
 */
export function isValidSessionToken(candidate?: string | null): boolean {
  return validateSessionToken(candidate).valid;
}

/**
 * Funções auxiliares para simulação em testes.
 */
export function _setSessionExpiryForTesting(timestamp: number): void {
  sessionExpiresAt = timestamp;
}

export function _resetSessionForTesting(): void {
  activeSessionToken = null;
  sessionExpiresAt = 0;
}

/**
 * Validação estrita do header Host para proteção contra ataques de DNS Rebinding.
 */
export function isValidHostHeader(hostHeader?: string): boolean {
  if (!hostHeader) return false; // Requisições HTTP legítimas exigem cabeçalho Host
  const clean = hostHeader.trim().toLowerCase();

  // Remove porta (ex: localhost:4100 -> localhost)
  let hostname = clean;
  if (clean.startsWith('[')) {
    // IPv6 ex: [::1]:4100
    const closeIdx = clean.indexOf(']');
    if (closeIdx > 0) {
      hostname = clean.substring(0, closeIdx + 1);
    }
  } else {
    hostname = clean.split(':')[0];
  }

  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

/**
 * Parser leve e nativo de cookies do HTTP request que preserva caracteres '=' nos valores.
 */
export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  const parts = cookieHeader.split(';');

  for (const part of parts) {
    const trimmed = part.trim();
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const rawKey = trimmed.substring(0, idx).trim();
    const rawVal = trimmed.substring(idx + 1).trim();
    if (rawKey) {
      try {
        cookies[rawKey] = decodeURIComponent(rawVal);
      } catch {
        cookies[rawKey] = rawVal;
      }
    }
  }

  return cookies;
}


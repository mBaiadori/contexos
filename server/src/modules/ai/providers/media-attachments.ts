import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChatMediaAttachment } from './provider.types.js';

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB
const MEDIA_ROOT_DIR = path.join(os.tmpdir(), 'contexos-chat-media');
const CLEANUP_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

const MIME_EXT_MAP: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.weba',
  'audio/mp4': '.m4a',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'application/json': '.json',
};

export interface MaterializedAttachment {
  name: string;
  mimeType: string;
  size: number;
  filePath: string;
}

function sanitizeFilename(rawName: string, mimeType: string, index: number): string {
  const base = path.basename(rawName || '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const extFromMime = MIME_EXT_MAP[mimeType.toLowerCase()] || '';
  if (!base || base === '.' || base === '..') {
    return `attachment-${index + 1}${extFromMime || '.bin'}`;
  }
  const hasExt = path.extname(base).length > 0;
  return hasExt ? base : `${base}${extFromMime}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cleanupOldMediaDirs(): void {
  try {
    if (!fs.existsSync(MEDIA_ROOT_DIR)) return;
    const now = Date.now();
    for (const entry of fs.readdirSync(MEDIA_ROOT_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(MEDIA_ROOT_DIR, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > CLEANUP_MAX_AGE_MS) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
      } catch {
        // ignore individual cleanup errors
      }
    }
  } catch {
    // ignore cleanup errors
  }
}

/**
 * Valida e normaliza a lista de anexos recebida pela API.
 */
export function normalizeAttachments(attachments?: ChatMediaAttachment[]): ChatMediaAttachment[] {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  const valid: ChatMediaAttachment[] = [];

  for (const item of attachments.slice(0, MAX_ATTACHMENTS)) {
    if (!item || typeof item.dataBase64 !== 'string' || !item.dataBase64.trim()) continue;
    const cleanBase64 = item.dataBase64.replace(/^data:[^;]+;base64,/, '').trim();
    const estimatedBytes = Math.floor((cleanBase64.length * 3) / 4);
    if (estimatedBytes <= 0 || estimatedBytes > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Anexo "${item.name || 'sem nome'}" excede o limite de 20 MB.`);
    }
    valid.push({
      id: item.id || `att-${Date.now()}-${valid.length}`,
      name: item.name || `attachment-${valid.length + 1}`,
      mimeType: item.mimeType || 'application/octet-stream',
      size: item.size || estimatedBytes,
      dataBase64: cleanBase64,
    });
  }

  return valid;
}

/**
 * Grava anexos em diretório temporário isolado e retorna o bloco de instruções
 * com os caminhos absolutos para que CLIs locais (agy / claude) possam lê-los.
 */
export function materializeAttachmentsForCli(
  sessionId: string,
  attachments?: ChatMediaAttachment[]
): { savedFiles: MaterializedAttachment[]; promptBlock: string } {
  const normalized = normalizeAttachments(attachments);
  if (normalized.length === 0) {
    return { savedFiles: [], promptBlock: '' };
  }

  cleanupOldMediaDirs();

  const safeSession = (sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
  const turnDir = path.join(MEDIA_ROOT_DIR, `${safeSession}-${Date.now()}`);
  fs.mkdirSync(turnDir, { recursive: true });

  const savedFiles: MaterializedAttachment[] = [];

  normalized.forEach((att, idx) => {
    const safeName = sanitizeFilename(att.name, att.mimeType, idx);
    const targetPath = path.join(turnDir, `${idx + 1}-${safeName}`);
    const buffer = Buffer.from(att.dataBase64, 'base64');
    fs.writeFileSync(targetPath, buffer);
    savedFiles.push({
      name: att.name,
      mimeType: att.mimeType,
      size: buffer.length,
      filePath: targetPath,
    });
  });

  const lines = savedFiles.map(
    (f) => `- ${f.name} (${f.mimeType}, ${formatBytes(f.size)}): ${f.filePath}`
  );

  const promptBlock = [
    '[MÍDIAS / ARQUIVOS ANEXADOS PELO USUÁRIO]',
    ...lines,
    'Use sua ferramenta de leitura de arquivo (read_file / Read) nos caminhos acima para inspecionar as imagens, PDFs ou mídias anexadas antes de responder.',
  ].join('\n');

  return { savedFiles, promptBlock };
}

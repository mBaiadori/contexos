import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolveRepoDir } from "../../config/constants.js";

export interface AuditRecord {
  index: number;
  timestamp: string;
  eventType: string;
  user: string;
  payload: unknown;
  contentHash: string;
  prevHash: string;
  hash: string;
}

export interface RecordAuditEventInput {
  eventType: string;
  user: string;
  payload: unknown;
}

export interface AuditChainVerificationResult {
  valid: boolean;
  totalEntries: number;
  brokenIndex?: number;
  error?: string;
}

const GENESIS_PREV_HASH = "0".repeat(64);

function computeHash(
  index: number,
  timestamp: string,
  eventType: string,
  user: string,
  prevHash: string,
  contentHash: string,
): string {
  const data = `${index}:${timestamp}:${eventType}:${user}:${prevHash}:${contentHash}`;
  return crypto.createHash("sha256").update(data).digest("hex");
}

function getAuditFilePath(projectRootOrName: string): string {
  let projectDir = projectRootOrName;
  if (!projectDir || !path.isAbsolute(projectDir)) {
    projectDir = resolveRepoDir(projectRootOrName || "local");
  }
  const memoryDir = path.join(projectDir, ".audit");
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }
  return path.join(memoryDir, "audit-chain.jsonl");
}

const writeQueues = new Map<string, Promise<unknown>>();

async function internalRecordAuditEvent(
  projectRootOrName: string,
  input: RecordAuditEventInput,
): Promise<AuditRecord> {
  const filePath = getAuditFilePath(projectRootOrName);

  let prevHash = GENESIS_PREV_HASH;
  let nextIndex = 0;

  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
    if (lines.length > 0) {
      try {
        const lastRecord: AuditRecord = JSON.parse(lines[lines.length - 1]);
        prevHash = lastRecord.hash;
        nextIndex = lastRecord.index + 1;
      } catch {}
    }
  }

  const timestamp = new Date().toISOString();
  const contentHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(input.payload || {}))
    .digest("hex");

  const hash = computeHash(
    nextIndex,
    timestamp,
    input.eventType,
    input.user,
    prevHash,
    contentHash,
  );

  const record: AuditRecord = {
    index: nextIndex,
    timestamp,
    eventType: input.eventType,
    user: input.user,
    payload: input.payload,
    contentHash,
    prevHash,
    hash,
  };

  fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf-8");
  return record;
}

/**
 * Registra um evento na trilha de auditoria encadeada com SHA-256 (com serialização garantida)
 */
export async function recordAuditEvent(
  projectRootOrName: string,
  input: RecordAuditEventInput,
): Promise<AuditRecord> {
  const key = projectRootOrName || "local";
  const currentQueue = writeQueues.get(key) || Promise.resolve();

  const nextOperation = currentQueue.then(() =>
    internalRecordAuditEvent(projectRootOrName, input),
  );

  writeQueues.set(
    key,
    nextOperation.catch(() => {}),
  );
  return nextOperation;
}

/**
 * Valida a integridade criptográfica de toda a trilha de auditoria
 */
export function verifyAuditChain(
  projectRootOrName: string,
): AuditChainVerificationResult {
  const filePath = getAuditFilePath(projectRootOrName);
  if (!fs.existsSync(filePath)) {
    return { valid: true, totalEntries: 0 };
  }

  const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
  let expectedPrevHash = GENESIS_PREV_HASH;

  for (let i = 0; i < lines.length; i++) {
    try {
      const record: AuditRecord = JSON.parse(lines[i]);

      if (record.index !== i) {
        return {
          valid: false,
          totalEntries: lines.length,
          brokenIndex: i,
          error: `Índice incorreto no registro ${i}: esperado ${i}, obtido ${record.index}`,
        };
      }

      if (record.prevHash !== expectedPrevHash) {
        return {
          valid: false,
          totalEntries: lines.length,
          brokenIndex: i,
          error: `Encadeamento quebrado no registro ${i}: prevHash divergente`,
        };
      }

      const expectedContentHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(record.payload || {}))
        .digest("hex");

      if (record.contentHash !== expectedContentHash) {
        return {
          valid: false,
          totalEntries: lines.length,
          brokenIndex: i,
          error: `Adulteração de payload detectada no registro ${i}: hash do conteúdo divergente`,
        };
      }

      const expectedHash = computeHash(
        record.index,
        record.timestamp,
        record.eventType,
        record.user,
        record.prevHash,
        record.contentHash,
      );

      if (record.hash !== expectedHash) {
        return {
          valid: false,
          totalEntries: lines.length,
          brokenIndex: i,
          error: `Hash do registro ${i} foi adulterado`,
        };
      }

      expectedPrevHash = record.hash;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        valid: false,
        totalEntries: lines.length,
        brokenIndex: i,
        error: `Erro ao decodificar JSON do registro ${i}: ${msg}`,
      };
    }
  }

  return { valid: true, totalEntries: lines.length };
}

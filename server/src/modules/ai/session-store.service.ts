import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { BASE_DIR, resolveRepoDir } from '../../config/constants.js';
import { loadConfig } from '../../config/storage.js';
import type { RawTurnTelemetryRecord, SessionDataRecord, SessionEventRecord } from './ai.service.js';

const require = createRequire(import.meta.url);

export type ImportConflictStrategy = 'merge' | 'keep_local' | 'overwrite';

export interface ImportSummary {
  success: boolean;
  addedSessions: number;
  mergedSessions: number;
  overwrittenSessions: number;
  skippedSessions: number;
  addedEvents: number;
  totalImportedSessions: number;
}

export interface SessionListItem {
  session_id: string;
  title?: string;
  repo: string;
  path: string;
  event_count: number;
  created_at: string;
  updated_at: string;
  timestamp: number;
  model: string;
  author: Record<string, unknown>;
  preview: string;
  metrics: {
    rounds: number;
    total_tokens: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_cost_usd: number;
    event_count?: number;
    turns_count?: number;
  };
  telemetry_turns: RawTurnTelemetryRecord[];
}

interface SessionRow {
  session_id: string;
  title?: string | null;
  repo: string;
  path: string;
  created_at: string;
  updated_at: string;
  author_json: string | null;
  model: string;
  metrics_json: string | null;
  preview: string | null;
  event_count?: number;
}

interface EventRow {
  event_id: string;
  session_id: string;
  seq: number;
  role: string;
  text: string;
  timestamp: string;
}

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'utf-8');

function sanitizeEvents(events: SessionEventRecord[]): SessionEventRecord[] {
  return events.map((ev) => {
    const cleanText = typeof ev.text === 'string' ? ev.text : String(ev.content || '');
    return {
      ...ev,
      text: cleanText,
    };
  });
}

function deterministicEventId(sessionId: string, seq: number, timestamp: string, role: string, text: string): string {
  return crypto
    .createHash('sha256')
    .update(`${sessionId}|${seq}|${timestamp}|${role}|${text}`)
    .digest('hex')
    .slice(0, 32);
}

function parseTimestampMs(val?: string | number): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const t = new Date(val).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function buildPreview(events: Array<{ role: string; text: string }>): string {
  const firstUser = events.find((e) => e.role === 'user');
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const raw = (firstUser?.text || lastEvent?.text || '').trim();
  if (!raw) return 'Conversa com Copilot';
  return raw.length > 90 ? `${raw.slice(0, 90)}...` : raw;
}

function computeMetrics(events: Array<{ text: string }>, telemetryTurns: RawTurnTelemetryRecord[]) {
  const rounds = Math.ceil(events.length / 2);
  const approxTokens = events.reduce((acc, ev) => acc + Math.ceil((ev.text?.length || 0) / 4), 0);
  const totalPromptTokens = telemetryTurns.reduce((acc, t) => acc + (t.metrics?.prompt_tokens || 0), 0);
  const totalCompletionTokens = telemetryTurns.reduce((acc, t) => acc + (t.metrics?.completion_tokens || 0), 0);
  const totalTokens = totalPromptTokens + totalCompletionTokens || approxTokens;
  const totalCostUsd = telemetryTurns.reduce((acc, t) => acc + (t.metrics?.cost_usd || 0), 0);

  return {
    rounds,
    total_tokens: totalTokens,
    prompt_tokens: totalPromptTokens,
    completion_tokens: totalCompletionTokens,
    total_cost_usd: totalCostUsd,
    event_count: events.length,
    turns_count: telemetryTurns.length,
  };
}

let sharedSqlJsPromise: Promise<SqlJsStatic> | null = null;

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sharedSqlJsPromise) {
    const localWasmPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sql-wasm.wasm');
    const wasmPath = fs.existsSync(localWasmPath)
      ? localWasmPath
      : require.resolve('sql.js/dist/sql-wasm.wasm');
    const buf = fs.readFileSync(wasmPath);
    const wasmBinary = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    sharedSqlJsPromise = initSqlJs({ wasmBinary });
  }
  return sharedSqlJsPromise;
}

function queryAll<T = Record<string, unknown>>(db: Database, sql: string, params: unknown[] = []): T[] {
  const stmt = db.prepare(sql);
  try {
    if (params.length > 0) stmt.bind(params as (string | number | Uint8Array | null)[]);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    return rows;
  } finally {
    stmt.free();
  }
}

function queryOne<T = Record<string, unknown>>(db: Database, sql: string, params: unknown[] = []): T | undefined {
  const rows = queryAll<T>(db, sql, params);
  return rows[0];
}

function runStmt(db: Database, sql: string, params: unknown[] = []): number {
  const stmt = db.prepare(sql);
  try {
    stmt.run(params as (string | number | Uint8Array | null)[]);
    return db.getRowsModified();
  } finally {
    stmt.free();
  }
}

/**
 * Armazena sessões de chat, mensagens e telemetria em SQLite (`sql.js` / WASM),
 * compatível com Node 20 (Electron) e Node 24+, com migração automática de `.sessions/*.json`,
 * exportação nativa `.sqlite` e importação com merge transacional.
 */
export class SessionStoreService {
  private SQL: SqlJsStatic | null = null;
  private db: Database | null = null;
  private initPromise: Promise<void> | null = null;
  private dbPath: string;
  private migratedRepos = new Set<string>();

  constructor(customDbPath?: string) {
    this.dbPath = customDbPath || path.join(BASE_DIR, 'sessions.db');
  }

  async init(): Promise<void> {
    if (this.db) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        this.SQL = await loadSqlJs();
        fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
        if (fs.existsSync(this.dbPath)) {
          const fileBuffer = fs.readFileSync(this.dbPath);
          this.db = new this.SQL.Database(fileBuffer);
        } else {
          this.db = new this.SQL.Database();
        }
        this.initSchema(this.db);
        this.persistToDisk();
      })();
    }
    return this.initPromise;
  }

  private getDb(): Database {
    if (!this.db) {
      throw new Error('SessionStoreService não inicializado. Chame init() antes de usar.');
    }
    return this.db;
  }

  private persistToDisk(): void {
    if (!this.db) return;
    const data = this.db.export();
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    const tmpPath = `${this.dbPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, Buffer.from(data));
    fs.renameSync(tmpPath, this.dbPath);
  }

  private initSchema(db: Database): void {
    db.run(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS chat_sessions (
        session_id TEXT PRIMARY KEY,
        title TEXT,
        repo TEXT NOT NULL,
        path TEXT NOT NULL DEFAULT 'Global',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        author_json TEXT,
        model TEXT NOT NULL DEFAULT 'gemini',
        metrics_json TEXT,
        preview TEXT
      );

      CREATE TABLE IF NOT EXISTS chat_events (
        event_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_telemetry (
        turn_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
        timestamp TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS migrated_repos (
        repo TEXT PRIMARY KEY,
        migrated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_repo_updated
        ON chat_sessions(repo, updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_events_session_seq
        ON chat_events(session_id, timestamp ASC, seq ASC);

      CREATE INDEX IF NOT EXISTS idx_telemetry_session
        ON chat_telemetry(session_id, timestamp ASC);
    `);

    const cols = queryAll<{ name: string }>(db, 'PRAGMA table_info(chat_sessions)');
    if (!cols.some((c) => c.name === 'title')) {
      db.run('ALTER TABLE chat_sessions ADD COLUMN title TEXT');
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }

  resolveEffectiveRepo(repoName?: string): string {
    const cfg = loadConfig();
    return repoName && repoName !== 'local' && repoName !== 'default'
      ? repoName
      : cfg.active_repo?.name || 'default';
  }

  migrateLegacyRepoSessions(repoName: string): void {
    const resolvedRepo = this.resolveEffectiveRepo(repoName);
    if (this.migratedRepos.has(resolvedRepo)) return;

    const db = this.getDb();
    const already = queryOne(db, 'SELECT 1 AS ok FROM migrated_repos WHERE repo = ?', [resolvedRepo]);
    if (already) {
      this.migratedRepos.add(resolvedRepo);
      return;
    }

    const sessionsDir = path.join(resolveRepoDir(resolvedRepo), '.sessions');
    let importedAny = false;
    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.json'));
      if (files.length > 0) {
        db.run('BEGIN TRANSACTION');
        try {
          for (const f of files) {
            try {
              const raw = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf-8')) as SessionDataRecord;
              const sessionId = raw.session_id || f.replace(/\.json$/, '');
              this.upsertLegacySessionTx(db, resolvedRepo, sessionId, raw);
              importedAny = true;
            } catch {
              // Ignora arquivos legados corrompidos
            }
          }
          runStmt(db, 'INSERT OR REPLACE INTO migrated_repos (repo, migrated_at) VALUES (?, ?)', [
            resolvedRepo,
            new Date().toISOString(),
          ]);
          db.run('COMMIT');
        } catch (err) {
          db.run('ROLLBACK');
          throw err;
        }
        if (importedAny) this.persistToDisk();
        this.migratedRepos.add(resolvedRepo);
        return;
      }
    }

    runStmt(db, 'INSERT OR REPLACE INTO migrated_repos (repo, migrated_at) VALUES (?, ?)', [
      resolvedRepo,
      new Date().toISOString(),
    ]);
    this.persistToDisk();
    this.migratedRepos.add(resolvedRepo);
  }

  private upsertLegacySessionTx(db: Database, repo: string, sessionId: string, raw: SessionDataRecord): void {
    const events = sanitizeEvents(Array.isArray(raw.events) ? raw.events : []);
    const telemetry = Array.isArray(raw.telemetry_turns) ? raw.telemetry_turns : [];
    const now = new Date().toISOString();
    const createdAt = raw.created_at || events[0]?.timestamp || now;
    const updatedAt = raw.updated_at || events[events.length - 1]?.timestamp || createdAt;
    const metrics = raw.metrics || computeMetrics(events, telemetry);
    const preview = buildPreview(events);

    runStmt(
      db,
      `INSERT OR IGNORE INTO chat_sessions (
        session_id, repo, path, created_at, updated_at, author_json, model, metrics_json, preview
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        repo,
        raw.path || 'Global',
        createdAt,
        updatedAt,
        JSON.stringify(raw.author || { name: 'Developer', role: 'Developer' }),
        raw.model || 'gemini',
        JSON.stringify(metrics),
        preview,
      ]
    );

    events.forEach((ev, idx) => {
      const ts = ev.timestamp || createdAt;
      const evId = deterministicEventId(sessionId, idx + 1, ts, ev.role || 'user', ev.text || '');
      runStmt(
        db,
        `INSERT OR IGNORE INTO chat_events (event_id, session_id, seq, role, text, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [evId, sessionId, idx + 1, ev.role || 'user', ev.text || '', ts]
      );
    });

    for (const turn of telemetry) {
      if (!turn?.turn_id) continue;
      runStmt(
        db,
        `INSERT OR IGNORE INTO chat_telemetry (turn_id, session_id, timestamp, payload_json)
         VALUES (?, ?, ?, ?)`,
        [turn.turn_id, sessionId, turn.timestamp || updatedAt, JSON.stringify(turn)]
      );
    }
  }

  appendEvent(
    repoName: string,
    filePath: string,
    sessionId: string,
    role: string,
    text: string,
    metadata?: { model?: string; author?: string },
    telemetryTurn?: RawTurnTelemetryRecord
  ): void {
    const resolvedRepo = this.resolveEffectiveRepo(repoName);
    this.migrateLegacyRepoSessions(resolvedRepo);

    const db = this.getDb();
    const now = new Date().toISOString();

    db.run('BEGIN TRANSACTION');
    try {
      const existing = queryOne<Pick<SessionRow, 'session_id' | 'path' | 'model'>>(
        db,
        'SELECT session_id, path, model FROM chat_sessions WHERE session_id = ?',
        [sessionId]
      );

      if (!existing) {
        runStmt(
          db,
          `INSERT INTO chat_sessions (
            session_id, repo, path, created_at, updated_at, author_json, model, metrics_json, preview
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sessionId,
            resolvedRepo,
            filePath || 'Global',
            now,
            now,
            JSON.stringify({ name: metadata?.author || 'Developer', role: 'Developer' }),
            metadata?.model || 'gemini',
            JSON.stringify({ rounds: 0, total_tokens: 0, total_cost_usd: 0, event_count: 0, turns_count: 0 }),
            buildPreview([{ role, text }]),
          ]
        );
      } else {
        const nextModel = metadata?.model || existing.model;
        const nextPath = filePath && (!existing.path || existing.path === 'Global') ? filePath : existing.path;
        runStmt(db, 'UPDATE chat_sessions SET updated_at = ?, model = ?, path = ? WHERE session_id = ?', [
          now,
          nextModel,
          nextPath,
          sessionId,
        ]);
      }

      const maxSeqRow = queryOne<{ max_seq: number }>(
        db,
        'SELECT COALESCE(MAX(seq), 0) AS max_seq FROM chat_events WHERE session_id = ?',
        [sessionId]
      );
      const nextSeq = Number(maxSeqRow?.max_seq || 0) + 1;

      runStmt(
        db,
        `INSERT INTO chat_events (event_id, session_id, seq, role, text, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), sessionId, nextSeq, role, text, now]
      );

      if (telemetryTurn?.turn_id) {
        runStmt(
          db,
          `INSERT INTO chat_telemetry (turn_id, session_id, timestamp, payload_json)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(turn_id) DO UPDATE SET
             timestamp = excluded.timestamp,
             payload_json = excluded.payload_json`,
          [telemetryTurn.turn_id, sessionId, telemetryTurn.timestamp || now, JSON.stringify(telemetryTurn)]
        );
      }

      this.recalculateSessionSummaryTx(db, sessionId);
      db.run('COMMIT');
      this.persistToDisk();
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }
  }

  private recalculateSessionSummaryTx(db: Database, sessionId: string): void {
    const events = queryAll<{ role: string; text: string; timestamp: string }>(
      db,
      'SELECT role, text, timestamp FROM chat_events WHERE session_id = ? ORDER BY timestamp ASC, seq ASC',
      [sessionId]
    );

    const telemetryRows = queryAll<{ payload_json: string }>(
      db,
      'SELECT payload_json FROM chat_telemetry WHERE session_id = ? ORDER BY timestamp ASC',
      [sessionId]
    );

    const telemetryTurns: RawTurnTelemetryRecord[] = [];
    for (const r of telemetryRows) {
      try {
        telemetryTurns.push(JSON.parse(r.payload_json));
      } catch {}
    }

    const metrics = computeMetrics(events, telemetryTurns);
    const preview = buildPreview(events);
    const lastTs = events.length > 0 ? events[events.length - 1].timestamp : new Date().toISOString();

    runStmt(db, 'UPDATE chat_sessions SET metrics_json = ?, preview = ?, updated_at = ? WHERE session_id = ?', [
      JSON.stringify(metrics),
      preview,
      lastTs,
      sessionId,
    ]);
  }

  getChatHistory(repoName: string, sessionId?: string): { session?: SessionDataRecord | null; sessions: SessionListItem[] } {
    const resolvedRepo = this.resolveEffectiveRepo(repoName);
    this.migrateLegacyRepoSessions(resolvedRepo);

    if (sessionId) {
      const detail = this.getSessionDetails(resolvedRepo, sessionId);
      if (detail) {
        const listItem: SessionListItem = {
          session_id: detail.session_id,
          title: detail.title,
          repo: resolvedRepo,
          path: detail.path,
          event_count: detail.events.length,
          created_at: detail.created_at,
          updated_at: detail.updated_at,
          timestamp: parseTimestampMs(detail.updated_at),
          model: detail.model,
          author: detail.author,
          preview: buildPreview(detail.events),
          metrics: detail.metrics || computeMetrics(detail.events, detail.telemetry_turns),
          telemetry_turns: detail.telemetry_turns,
        };
        return { session: detail, sessions: [listItem] };
      }
    }

    const db = this.getDb();
    const rows = queryAll<SessionRow>(
      db,
      `SELECT
        s.session_id,
        s.title,
        s.repo,
        s.path,
        s.created_at,
        s.updated_at,
        s.author_json,
        s.model,
        s.metrics_json,
        s.preview,
        (SELECT COUNT(*) FROM chat_events e WHERE e.session_id = s.session_id) AS event_count
      FROM chat_sessions s
      WHERE s.repo = ?
      ORDER BY s.updated_at DESC`,
      [resolvedRepo]
    );

    const sessions: SessionListItem[] = rows.map((row) => {
      let author: Record<string, unknown> = { name: 'Developer' };
      let metrics: SessionListItem['metrics'] = { rounds: 0, total_tokens: 0, total_cost_usd: 0 };
      try {
        if (row.author_json) author = JSON.parse(row.author_json);
      } catch {}
      try {
        if (row.metrics_json) metrics = JSON.parse(row.metrics_json);
      } catch {}

      return {
        session_id: row.session_id,
        title: row.title || undefined,
        repo: row.repo,
        path: row.path || 'Global',
        event_count: Number(row.event_count ?? metrics.event_count ?? 0),
        created_at: row.created_at,
        updated_at: row.updated_at,
        timestamp: parseTimestampMs(row.updated_at) || parseTimestampMs(row.created_at),
        model: row.model || 'AI Assistant',
        author,
        preview: row.preview || 'Conversa com Copilot',
        metrics,
        telemetry_turns: [],
      };
    });

    return { sessions };
  }

  getSessionDetails(repoName: string, sessionId?: string): SessionDataRecord | null {
    if (!sessionId) return null;
    const resolvedRepo = this.resolveEffectiveRepo(repoName);
    this.migrateLegacyRepoSessions(resolvedRepo);

    const db = this.getDb();
    const row = queryOne<SessionRow>(db, 'SELECT * FROM chat_sessions WHERE session_id = ?', [sessionId]);
    if (!row) return null;

    const eventRows = queryAll<EventRow>(
      db,
      'SELECT event_id, session_id, seq, role, text, timestamp FROM chat_events WHERE session_id = ? ORDER BY timestamp ASC, seq ASC',
      [sessionId]
    );

    const telemetryRows = queryAll<{ payload_json: string }>(
      db,
      'SELECT payload_json FROM chat_telemetry WHERE session_id = ? ORDER BY timestamp ASC',
      [sessionId]
    );

    let author: { name: string; role: string } = { name: 'Developer', role: 'Developer' };
    let metrics: SessionDataRecord['metrics'];
    try {
      if (row.author_json) author = JSON.parse(row.author_json);
    } catch {}
    try {
      if (row.metrics_json) metrics = JSON.parse(row.metrics_json);
    } catch {}

    const telemetry_turns: RawTurnTelemetryRecord[] = [];
    for (const tr of telemetryRows) {
      try {
        telemetry_turns.push(JSON.parse(tr.payload_json));
      } catch {}
    }

    return {
      session_id: row.session_id,
      title: row.title || undefined,
      path: row.path,
      created_at: row.created_at,
      updated_at: row.updated_at,
      author,
      model: row.model,
      events: eventRows.map((e) => ({
        role: e.role,
        text: e.text,
        timestamp: e.timestamp,
      })),
      telemetry_turns,
      metrics,
    };
  }

  deleteSession(repoName: string, sessionId: string): { success: boolean; message?: string; error?: string } {
    const resolvedRepo = this.resolveEffectiveRepo(repoName);
    this.migrateLegacyRepoSessions(resolvedRepo);

    const db = this.getDb();
    const changes = runStmt(db, 'DELETE FROM chat_sessions WHERE session_id = ?', [sessionId]);
    if (changes > 0) {
      this.persistToDisk();
      return { success: true, message: 'Sessão removida com sucesso.' };
    }
    return { success: false, error: 'Sessão não encontrada.' };
  }

  renameSession(
    repoName: string,
    sessionId: string,
    title: string
  ): { success: boolean; session_id: string; title: string | null; error?: string } {
    const resolvedRepo = this.resolveEffectiveRepo(repoName);
    this.migrateLegacyRepoSessions(resolvedRepo);

    const db = this.getDb();
    const cleanTitle = title.trim().slice(0, 140) || null;
    const changes = runStmt(db, 'UPDATE chat_sessions SET title = ? WHERE session_id = ?', [cleanTitle, sessionId]);
    if (changes > 0) {
      this.persistToDisk();
      return { success: true, session_id: sessionId, title: cleanTitle };
    }
    return { success: false, session_id: sessionId, title: cleanTitle, error: 'Sessão não encontrada.' };
  }

  resetRepo(repoName: string): { success: boolean; message: string } {
    const resolvedRepo = this.resolveEffectiveRepo(repoName);
    const db = this.getDb();
    runStmt(db, 'DELETE FROM chat_sessions WHERE repo = ?', [resolvedRepo]);
    runStmt(db, 'DELETE FROM migrated_repos WHERE repo = ?', [resolvedRepo]);
    this.migratedRepos.delete(resolvedRepo);
    this.persistToDisk();

    const legacyDir = path.join(resolveRepoDir(resolvedRepo), '.sessions');
    if (fs.existsSync(legacyDir)) {
      fs.rmSync(legacyDir, { recursive: true, force: true });
    }
    return { success: true, message: 'Histórico de sessões resetado com sucesso.' };
  }

  exportDatabase(repoName?: string): { buffer: Buffer; filename: string } {
    const db = this.getDb();
    if (!this.SQL) throw new Error('SQL.js não inicializado.');

    const resolvedRepo = repoName && repoName !== 'all' ? this.resolveEffectiveRepo(repoName) : null;
    if (resolvedRepo) {
      this.migrateLegacyRepoSessions(resolvedRepo);
    }

    const rawExport = db.export();
    let finalBuffer = Buffer.from(rawExport);

    if (resolvedRepo) {
      const exportDb = new this.SQL.Database(rawExport);
      try {
        exportDb.run('PRAGMA foreign_keys = ON;');
        runStmt(exportDb, 'DELETE FROM chat_sessions WHERE repo != ?', [resolvedRepo]);
        runStmt(exportDb, 'DELETE FROM migrated_repos');
        exportDb.run('VACUUM;');
        finalBuffer = Buffer.from(exportDb.export());
      } finally {
        exportDb.close();
      }
    }

    const safeRepo = (resolvedRepo || 'all').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    return {
      buffer: finalBuffer,
      filename: `contexos-history-${safeRepo}-${dateStr}.sqlite`,
    };
  }

  importDatabase(
    buffer: Buffer,
    options: { targetRepo?: string; conflictStrategy?: ImportConflictStrategy } = {}
  ): ImportSummary {
    if (!buffer || buffer.length < 100 || !buffer.subarray(0, 16).equals(SQLITE_HEADER)) {
      throw new Error('Arquivo inválido: o arquivo enviado não é um banco SQLite válido.');
    }
    if (!this.SQL) throw new Error('SQL.js não inicializado.');

    const strategy: ImportConflictStrategy = options.conflictStrategy || 'merge';
    const overrideRepo =
      options.targetRepo && options.targetRepo !== 'keep_original'
        ? this.resolveEffectiveRepo(options.targetRepo)
        : null;

    if (overrideRepo) {
      this.migrateLegacyRepoSessions(overrideRepo);
    }

    const importedDb = new this.SQL.Database(buffer);
    try {
      const tables = queryAll<{ name: string }>(
        importedDb,
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('chat_sessions', 'chat_events')"
      );
      if (tables.length < 2) {
        throw new Error('Schema incompatível: o banco SQLite não contém as tabelas de histórico do Context OS.');
      }

      const hasTelemetryTable = Boolean(
        queryOne(importedDb, "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'chat_telemetry'")
      );
      const importedSessions = queryAll<SessionRow>(importedDb, 'SELECT * FROM chat_sessions');

      const db = this.getDb();
      let addedSessions = 0;
      let mergedSessions = 0;
      let overwrittenSessions = 0;
      let skippedSessions = 0;
      let addedEvents = 0;

      db.run('BEGIN TRANSACTION');
      try {
        for (const imp of importedSessions) {
          const targetRepo = overrideRepo || imp.repo || 'default';
          const existing = queryOne<{ session_id: string }>(
            db,
            'SELECT session_id FROM chat_sessions WHERE session_id = ?',
            [imp.session_id]
          );

          const importedEvents = queryAll<EventRow>(
            importedDb,
            'SELECT event_id, session_id, seq, role, text, timestamp FROM chat_events WHERE session_id = ? ORDER BY timestamp ASC, seq ASC',
            [imp.session_id]
          );
          const importedTelemetry = hasTelemetryTable
            ? queryAll<{ turn_id: string; session_id: string; timestamp: string; payload_json: string }>(
                importedDb,
                'SELECT turn_id, session_id, timestamp, payload_json FROM chat_telemetry WHERE session_id = ?',
                [imp.session_id]
              )
            : [];

          if (!existing) {
            runStmt(
              db,
              `INSERT INTO chat_sessions (
                session_id, title, repo, path, created_at, updated_at, author_json, model, metrics_json, preview
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                imp.session_id,
                imp.title ?? null,
                targetRepo,
                imp.path || 'Global',
                imp.created_at,
                imp.updated_at,
                imp.author_json,
                imp.model || 'gemini',
                imp.metrics_json,
                imp.preview,
              ]
            );

            for (const ev of importedEvents) {
              addedEvents += runStmt(
                db,
                'INSERT OR IGNORE INTO chat_events (event_id, session_id, seq, role, text, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
                [ev.event_id, ev.session_id, ev.seq, ev.role, ev.text, ev.timestamp]
              );
            }
            for (const tel of importedTelemetry) {
              runStmt(
                db,
                'INSERT OR IGNORE INTO chat_telemetry (turn_id, session_id, timestamp, payload_json) VALUES (?, ?, ?, ?)',
                [tel.turn_id, tel.session_id, tel.timestamp, tel.payload_json]
              );
            }

            this.recalculateSessionSummaryTx(db, imp.session_id);
            addedSessions++;
            continue;
          }

          if (strategy === 'keep_local') {
            skippedSessions++;
            continue;
          }

          if (strategy === 'overwrite') {
            runStmt(db, 'DELETE FROM chat_events WHERE session_id = ?', [imp.session_id]);
            runStmt(db, 'DELETE FROM chat_telemetry WHERE session_id = ?', [imp.session_id]);
            runStmt(
              db,
              `UPDATE chat_sessions
               SET repo = ?, path = ?, created_at = ?, updated_at = ?, author_json = ?, model = ?, metrics_json = ?, preview = ?
               WHERE session_id = ?`,
              [
                targetRepo,
                imp.path || 'Global',
                imp.created_at,
                imp.updated_at,
                imp.author_json,
                imp.model || 'gemini',
                imp.metrics_json,
                imp.preview,
                imp.session_id,
              ]
            );

            for (const ev of importedEvents) {
              addedEvents += runStmt(
                db,
                'INSERT OR IGNORE INTO chat_events (event_id, session_id, seq, role, text, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
                [ev.event_id, ev.session_id, ev.seq, ev.role, ev.text, ev.timestamp]
              );
            }
            for (const tel of importedTelemetry) {
              runStmt(
                db,
                'INSERT OR IGNORE INTO chat_telemetry (turn_id, session_id, timestamp, payload_json) VALUES (?, ?, ?, ?)',
                [tel.turn_id, tel.session_id, tel.timestamp, tel.payload_json]
              );
            }

            this.recalculateSessionSummaryTx(db, imp.session_id);
            overwrittenSessions++;
            continue;
          }

          // Estratégia padrão: merge aditivo
          const maxSeqRow = queryOne<{ max_seq: number }>(
            db,
            'SELECT COALESCE(MAX(seq), 0) AS max_seq FROM chat_events WHERE session_id = ?',
            [imp.session_id]
          );
          let nextSeq = Number(maxSeqRow?.max_seq || 0);

          let sessionAddedEvents = 0;
          for (const ev of importedEvents) {
            nextSeq++;
            const changes = runStmt(
              db,
              'INSERT OR IGNORE INTO chat_events (event_id, session_id, seq, role, text, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
              [ev.event_id, ev.session_id, nextSeq, ev.role, ev.text, ev.timestamp]
            );
            if (changes > 0) {
              sessionAddedEvents++;
              addedEvents++;
            }
          }

          for (const tel of importedTelemetry) {
            runStmt(
              db,
              'INSERT OR IGNORE INTO chat_telemetry (turn_id, session_id, timestamp, payload_json) VALUES (?, ?, ?, ?)',
              [tel.turn_id, tel.session_id, tel.timestamp, tel.payload_json]
            );
          }

          if (sessionAddedEvents > 0) {
            this.recalculateSessionSummaryTx(db, imp.session_id);
            mergedSessions++;
          } else {
            skippedSessions++;
          }
        }

        db.run('COMMIT');
        this.persistToDisk();
      } catch (err) {
        db.run('ROLLBACK');
        throw err;
      }

      return {
        success: true,
        addedSessions,
        mergedSessions,
        overwrittenSessions,
        skippedSessions,
        addedEvents,
        totalImportedSessions: importedSessions.length,
      };
    } finally {
      importedDb.close();
    }
  }
}

export const sessionStoreService = new SessionStoreService();

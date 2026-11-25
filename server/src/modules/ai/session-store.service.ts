import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { BASE_DIR, resolveRepoDir } from '../../config/constants.js';
import { loadConfig } from '../../config/storage.js';
import type { RawTurnTelemetryRecord, SessionDataRecord, SessionEventRecord } from './ai.service.js';

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

interface TelemetryRow {
  turn_id: string;
  session_id: string;
  timestamp: string;
  payload_json: string;
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

/**
 * Armazena sessões de chat, mensagens e telemetria em SQLite (`node:sqlite`),
 * com suporte a migração automática de `.sessions/*.json`, exportação nativa (`VACUUM INTO`)
 * e importação com merge transacional (`ATTACH DATABASE`).
 */
export class SessionStoreService {
  private db: DatabaseSync | null = null;
  private dbPath: string;
  private migratedRepos = new Set<string>();

  constructor(customDbPath?: string) {
    this.dbPath = customDbPath || path.join(BASE_DIR, 'sessions.db');
  }

  private getDb(): DatabaseSync {
    if (this.db) return this.db;
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    const db = new DatabaseSync(this.dbPath);
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
    `);
    this.initSchema(db);
    this.db = db;
    return db;
  }

  private initSchema(db: DatabaseSync): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        session_id TEXT PRIMARY KEY,
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
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  resolveEffectiveRepo(repoName?: string): string {
    const cfg = loadConfig();
    return repoName && repoName !== 'local' && repoName !== 'default'
      ? repoName
      : cfg.active_repo?.name || 'default';
  }

  /**
   * Importa automaticamente arquivos legados de `<repo>/.sessions/*.json` na primeira leitura.
   */
  migrateLegacyRepoSessions(repoName: string): void {
    const resolvedRepo = this.resolveEffectiveRepo(repoName);
    if (this.migratedRepos.has(resolvedRepo)) return;

    const db = this.getDb();
    const already = db
      .prepare('SELECT 1 FROM migrated_repos WHERE repo = ?')
      .get(resolvedRepo);
    if (already) {
      this.migratedRepos.add(resolvedRepo);
      return;
    }

    const sessionsDir = path.join(resolveRepoDir(resolvedRepo), '.sessions');
    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.json'));
      if (files.length > 0) {
        db.exec('BEGIN IMMEDIATE');
        try {
          for (const f of files) {
            try {
              const raw = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf-8')) as SessionDataRecord;
              const sessionId = raw.session_id || f.replace(/\.json$/, '');
              this.upsertLegacySessionTx(db, resolvedRepo, sessionId, raw);
            } catch {
              // Ignora arquivos legados corrompidos
            }
          }
          db.prepare('INSERT OR REPLACE INTO migrated_repos (repo, migrated_at) VALUES (?, ?)').run(
            resolvedRepo,
            new Date().toISOString()
          );
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
        this.migratedRepos.add(resolvedRepo);
        return;
      }
    }

    db.prepare('INSERT OR REPLACE INTO migrated_repos (repo, migrated_at) VALUES (?, ?)').run(
      resolvedRepo,
      new Date().toISOString()
    );
    this.migratedRepos.add(resolvedRepo);
  }

  private upsertLegacySessionTx(db: DatabaseSync, repo: string, sessionId: string, raw: SessionDataRecord): void {
    const events = sanitizeEvents(Array.isArray(raw.events) ? raw.events : []);
    const telemetry = Array.isArray(raw.telemetry_turns) ? raw.telemetry_turns : [];
    const now = new Date().toISOString();
    const createdAt = raw.created_at || events[0]?.timestamp || now;
    const updatedAt = raw.updated_at || events[events.length - 1]?.timestamp || createdAt;
    const metrics = raw.metrics || computeMetrics(events, telemetry);
    const preview = buildPreview(events);

    db.prepare(`
      INSERT OR IGNORE INTO chat_sessions (
        session_id, repo, path, created_at, updated_at, author_json, model, metrics_json, preview
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      repo,
      raw.path || 'Global',
      createdAt,
      updatedAt,
      JSON.stringify(raw.author || { name: 'Developer', role: 'Developer' }),
      raw.model || 'gemini',
      JSON.stringify(metrics),
      preview
    );

    const insertEv = db.prepare(`
      INSERT OR IGNORE INTO chat_events (event_id, session_id, seq, role, text, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    events.forEach((ev, idx) => {
      const ts = ev.timestamp || createdAt;
      const evId = deterministicEventId(sessionId, idx + 1, ts, ev.role || 'user', ev.text || '');
      insertEv.run(evId, sessionId, idx + 1, ev.role || 'user', ev.text || '', ts);
    });

    const insertTel = db.prepare(`
      INSERT OR IGNORE INTO chat_telemetry (turn_id, session_id, timestamp, payload_json)
      VALUES (?, ?, ?, ?)
    `);
    for (const turn of telemetry) {
      if (!turn?.turn_id) continue;
      insertTel.run(turn.turn_id, sessionId, turn.timestamp || updatedAt, JSON.stringify(turn));
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

    db.exec('BEGIN IMMEDIATE');
    try {
      const existing = db
        .prepare('SELECT session_id, path, model, author_json FROM chat_sessions WHERE session_id = ?')
        .get(sessionId) as Pick<SessionRow, 'session_id' | 'path' | 'model' | 'author_json'> | undefined;

      if (!existing) {
        db.prepare(`
          INSERT INTO chat_sessions (
            session_id, repo, path, created_at, updated_at, author_json, model, metrics_json, preview
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          sessionId,
          resolvedRepo,
          filePath || 'Global',
          now,
          now,
          JSON.stringify({ name: metadata?.author || 'Developer', role: 'Developer' }),
          metadata?.model || 'gemini',
          JSON.stringify({ rounds: 0, total_tokens: 0, total_cost_usd: 0, event_count: 0, turns_count: 0 }),
          buildPreview([{ role, text }])
        );
      } else {
        const nextModel = metadata?.model || existing.model;
        const nextPath = filePath && (!existing.path || existing.path === 'Global') ? filePath : existing.path;
        db.prepare('UPDATE chat_sessions SET updated_at = ?, model = ?, path = ? WHERE session_id = ?').run(
          now,
          nextModel,
          nextPath,
          sessionId
        );
      }

      const maxSeqRow = db
        .prepare('SELECT COALESCE(MAX(seq), 0) AS max_seq FROM chat_events WHERE session_id = ?')
        .get(sessionId) as { max_seq: number };
      const nextSeq = (maxSeqRow?.max_seq || 0) + 1;

      db.prepare(`
        INSERT INTO chat_events (event_id, session_id, seq, role, text, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), sessionId, nextSeq, role, text, now);

      if (telemetryTurn?.turn_id) {
        db.prepare(`
          INSERT INTO chat_telemetry (turn_id, session_id, timestamp, payload_json)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(turn_id) DO UPDATE SET
            timestamp = excluded.timestamp,
            payload_json = excluded.payload_json
        `).run(telemetryTurn.turn_id, sessionId, telemetryTurn.timestamp || now, JSON.stringify(telemetryTurn));
      }

      this.recalculateSessionSummaryTx(db, sessionId);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  private recalculateSessionSummaryTx(db: DatabaseSync, sessionId: string): void {
    const events = db
      .prepare('SELECT role, text, timestamp FROM chat_events WHERE session_id = ? ORDER BY timestamp ASC, seq ASC')
      .all(sessionId) as Array<{ role: string; text: string; timestamp: string }>;

    const telemetryRows = db
      .prepare('SELECT payload_json FROM chat_telemetry WHERE session_id = ? ORDER BY timestamp ASC')
      .all(sessionId) as Array<{ payload_json: string }>;

    const telemetryTurns: RawTurnTelemetryRecord[] = [];
    for (const r of telemetryRows) {
      try {
        telemetryTurns.push(JSON.parse(r.payload_json));
      } catch {}
    }

    const metrics = computeMetrics(events, telemetryTurns);
    const preview = buildPreview(events);
    const lastTs = events.length > 0 ? events[events.length - 1].timestamp : new Date().toISOString();

    db.prepare('UPDATE chat_sessions SET metrics_json = ?, preview = ?, updated_at = ? WHERE session_id = ?').run(
      JSON.stringify(metrics),
      preview,
      lastTs,
      sessionId
    );
  }

  getChatHistory(repoName: string, sessionId?: string): { session?: SessionDataRecord | null; sessions: SessionListItem[] } {
    const resolvedRepo = this.resolveEffectiveRepo(repoName);
    this.migrateLegacyRepoSessions(resolvedRepo);

    if (sessionId) {
      const detail = this.getSessionDetails(resolvedRepo, sessionId);
      if (detail) {
        const listItem: SessionListItem = {
          session_id: detail.session_id,
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
    const rows = db
      .prepare(`
        SELECT
          s.session_id,
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
        ORDER BY s.updated_at DESC
      `)
      .all(resolvedRepo) as unknown as SessionRow[];

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
        repo: row.repo,
        path: row.path || 'Global',
        event_count: row.event_count ?? metrics.event_count ?? 0,
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
    const row = db
      .prepare('SELECT * FROM chat_sessions WHERE session_id = ?')
      .get(sessionId) as unknown as SessionRow | undefined;

    if (!row) return null;

    const eventRows = db
      .prepare('SELECT event_id, session_id, seq, role, text, timestamp FROM chat_events WHERE session_id = ? ORDER BY timestamp ASC, seq ASC')
      .all(sessionId) as unknown as EventRow[];

    const telemetryRows = db
      .prepare('SELECT turn_id, session_id, timestamp, payload_json FROM chat_telemetry WHERE session_id = ? ORDER BY timestamp ASC')
      .all(sessionId) as unknown as TelemetryRow[];

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
    const info = db.prepare('DELETE FROM chat_sessions WHERE session_id = ?').run(sessionId);
    if (info.changes > 0) {
      return { success: true, message: 'Sessão removida com sucesso.' };
    }
    return { success: false, error: 'Sessão não encontrada.' };
  }

  resetRepo(repoName: string): { success: boolean; message: string } {
    const resolvedRepo = this.resolveEffectiveRepo(repoName);
    const db = this.getDb();
    db.prepare('DELETE FROM chat_sessions WHERE repo = ?').run(resolvedRepo);
    db.prepare('DELETE FROM migrated_repos WHERE repo = ?').run(resolvedRepo);
    this.migratedRepos.delete(resolvedRepo);

    const legacyDir = path.join(resolveRepoDir(resolvedRepo), '.sessions');
    if (fs.existsSync(legacyDir)) {
      fs.rmSync(legacyDir, { recursive: true, force: true });
    }
    return { success: true, message: 'Histórico de sessões resetado com sucesso.' };
  }

  /**
   * Exporta um snapshot consistente do SQLite via `VACUUM INTO`.
   * Se `repoName` for informado (e diferente de 'all'), filtra o arquivo exportado para conter apenas aquele repositório.
   */
  exportDatabase(repoName?: string): { buffer: Buffer; filename: string } {
    const db = this.getDb();
    const resolvedRepo = repoName && repoName !== 'all' ? this.resolveEffectiveRepo(repoName) : null;
    if (resolvedRepo) {
      this.migrateLegacyRepoSessions(resolvedRepo);
    }

    const tmpFile = path.join(os.tmpdir(), `contexos-export-${crypto.randomUUID()}.sqlite`);
    const escapedPath = tmpFile.replace(/'/g, "''");

    try {
      db.exec(`VACUUM INTO '${escapedPath}'`);

      if (resolvedRepo) {
        const exportDb = new DatabaseSync(tmpFile);
        try {
          exportDb.exec('PRAGMA foreign_keys = ON;');
          exportDb.prepare('DELETE FROM chat_sessions WHERE repo != ?').run(resolvedRepo);
          exportDb.prepare('DELETE FROM migrated_repos').run();
          exportDb.exec('VACUUM;');
        } finally {
          exportDb.close();
        }
      }

      const buffer = fs.readFileSync(tmpFile);
      const safeRepo = (resolvedRepo || 'all').replace(/[^a-zA-Z0-9_-]/g, '_');
      const dateStr = new Date().toISOString().slice(0, 10);
      return {
        buffer,
        filename: `contexos-history-${safeRepo}-${dateStr}.sqlite`,
      };
    } finally {
      if (fs.existsSync(tmpFile)) {
        try {
          fs.unlinkSync(tmpFile);
        } catch {}
      }
    }
  }

  /**
   * Importa um arquivo `.sqlite` externo com suporte a merge aditivo transacional.
   */
  importDatabase(
    buffer: Buffer,
    options: { targetRepo?: string; conflictStrategy?: ImportConflictStrategy } = {}
  ): ImportSummary {
    if (!buffer || buffer.length < 100 || !buffer.subarray(0, 16).equals(SQLITE_HEADER)) {
      throw new Error('Arquivo inválido: o arquivo enviado não é um banco SQLite válido.');
    }

    const strategy: ImportConflictStrategy = options.conflictStrategy || 'merge';
    const overrideRepo =
      options.targetRepo && options.targetRepo !== 'keep_original'
        ? this.resolveEffectiveRepo(options.targetRepo)
        : null;

    if (overrideRepo) {
      this.migrateLegacyRepoSessions(overrideRepo);
    }

    const tmpFile = path.join(os.tmpdir(), `contexos-import-${crypto.randomUUID()}.sqlite`);
    fs.writeFileSync(tmpFile, buffer);

    try {
      // Validação de schema antes de anexar
      const probe = new DatabaseSync(tmpFile, { readOnly: true });
      try {
        const tables = probe
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('chat_sessions', 'chat_events')")
          .all() as Array<{ name: string }>;
        if (tables.length < 2) {
          throw new Error('Schema incompatível: o banco SQLite não contém as tabelas de histórico do Context OS.');
        }
      } finally {
        probe.close();
      }

      const db = this.getDb();
      const escapedPath = tmpFile.replace(/'/g, "''");
      db.exec(`ATTACH DATABASE '${escapedPath}' AS imported`);

      let addedSessions = 0;
      let mergedSessions = 0;
      let overwrittenSessions = 0;
      let skippedSessions = 0;
      let addedEvents = 0;
      let totalImportedSessions = 0;

      try {
        db.exec('BEGIN IMMEDIATE');
        try {
          const importedSessions = db
            .prepare('SELECT * FROM imported.chat_sessions')
            .all() as unknown as SessionRow[];
          totalImportedSessions = importedSessions.length;

          const hasTelemetryTable = Boolean(
            db
              .prepare("SELECT 1 FROM imported.sqlite_master WHERE type = 'table' AND name = 'chat_telemetry'")
              .get()
          );

          for (const imp of importedSessions) {
            const targetRepo = overrideRepo || imp.repo || 'default';
            const existing = db
              .prepare('SELECT session_id, updated_at FROM main.chat_sessions WHERE session_id = ?')
              .get(imp.session_id) as { session_id: string; updated_at: string } | undefined;

            if (!existing) {
              db.prepare(`
                INSERT INTO main.chat_sessions (
                  session_id, repo, path, created_at, updated_at, author_json, model, metrics_json, preview
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                imp.session_id,
                targetRepo,
                imp.path || 'Global',
                imp.created_at,
                imp.updated_at,
                imp.author_json,
                imp.model || 'gemini',
                imp.metrics_json,
                imp.preview
              );

              const evInfo = db.prepare(`
                INSERT OR IGNORE INTO main.chat_events (event_id, session_id, seq, role, text, timestamp)
                SELECT event_id, session_id, seq, role, text, timestamp
                FROM imported.chat_events
                WHERE session_id = ?
              `).run(imp.session_id);
              addedEvents += Number(evInfo.changes || 0);

              if (hasTelemetryTable) {
                db.prepare(`
                  INSERT OR IGNORE INTO main.chat_telemetry (turn_id, session_id, timestamp, payload_json)
                  SELECT turn_id, session_id, timestamp, payload_json
                  FROM imported.chat_telemetry
                  WHERE session_id = ?
                `).run(imp.session_id);
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
              db.prepare('DELETE FROM main.chat_events WHERE session_id = ?').run(imp.session_id);
              db.prepare('DELETE FROM main.chat_telemetry WHERE session_id = ?').run(imp.session_id);
              db.prepare(`
                UPDATE main.chat_sessions
                SET repo = ?, path = ?, created_at = ?, updated_at = ?, author_json = ?, model = ?, metrics_json = ?, preview = ?
                WHERE session_id = ?
              `).run(
                targetRepo,
                imp.path || 'Global',
                imp.created_at,
                imp.updated_at,
                imp.author_json,
                imp.model || 'gemini',
                imp.metrics_json,
                imp.preview,
                imp.session_id
              );

              const evInfo = db.prepare(`
                INSERT OR IGNORE INTO main.chat_events (event_id, session_id, seq, role, text, timestamp)
                SELECT event_id, session_id, seq, role, text, timestamp
                FROM imported.chat_events
                WHERE session_id = ?
              `).run(imp.session_id);
              addedEvents += Number(evInfo.changes || 0);

              if (hasTelemetryTable) {
                db.prepare(`
                  INSERT OR IGNORE INTO main.chat_telemetry (turn_id, session_id, timestamp, payload_json)
                  SELECT turn_id, session_id, timestamp, payload_json
                  FROM imported.chat_telemetry
                  WHERE session_id = ?
                `).run(imp.session_id);
              }

              this.recalculateSessionSummaryTx(db, imp.session_id);
              overwrittenSessions++;
              continue;
            }

            // Estratégia padrão: 'merge' aditivo sem perda de dados
            const maxSeqRow = db
              .prepare('SELECT COALESCE(MAX(seq), 0) AS max_seq FROM main.chat_events WHERE session_id = ?')
              .get(imp.session_id) as { max_seq: number };
            let nextSeq = maxSeqRow?.max_seq || 0;

            const importedEvents = db
              .prepare('SELECT event_id, session_id, seq, role, text, timestamp FROM imported.chat_events WHERE session_id = ? ORDER BY timestamp ASC, seq ASC')
              .all(imp.session_id) as unknown as EventRow[];

            const insertEv = db.prepare(`
              INSERT OR IGNORE INTO main.chat_events (event_id, session_id, seq, role, text, timestamp)
              VALUES (?, ?, ?, ?, ?, ?)
            `);

            let sessionAddedEvents = 0;
            for (const ev of importedEvents) {
              nextSeq++;
              const res = insertEv.run(ev.event_id, ev.session_id, nextSeq, ev.role, ev.text, ev.timestamp);
              if (Number(res.changes || 0) > 0) {
                sessionAddedEvents++;
                addedEvents++;
              }
            }

            if (hasTelemetryTable) {
              db.prepare(`
                INSERT OR IGNORE INTO main.chat_telemetry (turn_id, session_id, timestamp, payload_json)
                SELECT turn_id, session_id, timestamp, payload_json
                FROM imported.chat_telemetry
                WHERE session_id = ?
              `).run(imp.session_id);
            }

            if (sessionAddedEvents > 0) {
              this.recalculateSessionSummaryTx(db, imp.session_id);
              mergedSessions++;
            } else {
              skippedSessions++;
            }
          }

          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
      } finally {
        try {
          db.exec('DETACH DATABASE imported');
        } catch {}
      }

      return {
        success: true,
        addedSessions,
        mergedSessions,
        overwrittenSessions,
        skippedSessions,
        addedEvents,
        totalImportedSessions,
      };
    } finally {
      if (fs.existsSync(tmpFile)) {
        try {
          fs.unlinkSync(tmpFile);
        } catch {}
      }
    }
  }
}

export const sessionStoreService = new SessionStoreService();

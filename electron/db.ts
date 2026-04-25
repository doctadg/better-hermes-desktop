/**
 * Local SQLite cache for Hermes Desktop.
 *
 * Mirrors enough session metadata + message text to support fast
 * client-side full-text search without round-tripping the agent.
 * The agent remains the source of truth — this cache is rebuilt by
 * pulling from /api/sessions on demand.
 *
 * Schema:
 *   sessions(id PK, profile, source, started_at, ended_at, message_count, model, title, updated_at)
 *   messages(id PK, session_id FK, role, content, timestamp)
 *   messages_fts (FTS5 virtual table) for fast `MATCH` search
 *   prefs(key PK, value JSON)        — small KV alongside electron-store
 *   model_library(id PK, name, provider, model, base_url, created_at)
 *   workspaces(id PK, name, layout JSON, created_at, updated_at)
 *   audit_log(id PK, kind, request_id, session_id, decision, payload JSON, created_at)
 */

import Database from 'better-sqlite3';
import { cacheDbPath } from './paths';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  db = new Database(cacheDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

function initSchema(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      profile TEXT,
      source TEXT,
      started_at INTEGER,
      ended_at INTEGER,
      message_count INTEGER DEFAULT 0,
      model TEXT,
      title TEXT,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions(profile);
    CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      session_id UNINDEXED,
      role UNINDEXED,
      timestamp UNINDEXED,
      content='messages',
      content_rowid='rowid',
      tokenize='porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content, session_id, role, timestamp)
      VALUES (new.rowid, new.content, new.session_id, new.role, new.timestamp);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, session_id, role, timestamp)
      VALUES ('delete', old.rowid, old.content, old.session_id, old.role, old.timestamp);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, session_id, role, timestamp)
      VALUES ('delete', old.rowid, old.content, old.session_id, old.role, old.timestamp);
      INSERT INTO messages_fts(rowid, content, session_id, role, timestamp)
      VALUES (new.rowid, new.content, new.session_id, new.role, new.timestamp);
    END;

    CREATE TABLE IF NOT EXISTS prefs (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_library (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      base_url TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_models_provider ON model_library(provider);

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      layout TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      request_id TEXT,
      session_id TEXT,
      decision TEXT,
      payload TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_log(session_id);
    CREATE INDEX IF NOT EXISTS idx_audit_kind ON audit_log(kind);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
  `);
}

// ─── Session helpers ───

export interface SessionRow {
  id: string;
  profile: string | null;
  source: string | null;
  started_at: number | null;
  ended_at: number | null;
  message_count: number;
  model: string | null;
  title: string | null;
  updated_at: number;
}

export function upsertSession(s: Partial<SessionRow> & { id: string }): void {
  getDb()
    .prepare(
      `INSERT INTO sessions(id, profile, source, started_at, ended_at, message_count, model, title, updated_at)
       VALUES (@id, @profile, @source, @started_at, @ended_at, @message_count, @model, @title, strftime('%s','now') * 1000)
       ON CONFLICT(id) DO UPDATE SET
         profile=COALESCE(excluded.profile, sessions.profile),
         source=COALESCE(excluded.source, sessions.source),
         started_at=COALESCE(excluded.started_at, sessions.started_at),
         ended_at=COALESCE(excluded.ended_at, sessions.ended_at),
         message_count=COALESCE(excluded.message_count, sessions.message_count),
         model=COALESCE(excluded.model, sessions.model),
         title=COALESCE(excluded.title, sessions.title),
         updated_at=strftime('%s','now') * 1000`,
    )
    .run({
      profile: null,
      source: null,
      started_at: null,
      ended_at: null,
      message_count: 0,
      model: null,
      title: null,
      ...s,
    });
}

export function listSessions(opts: { profile?: string | null; limit?: number; offset?: number }): SessionRow[] {
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;
  if (opts.profile) {
    return getDb()
      .prepare(`SELECT * FROM sessions WHERE profile = ? ORDER BY started_at DESC LIMIT ? OFFSET ?`)
      .all(opts.profile, limit, offset) as SessionRow[];
  }
  return getDb().prepare(`SELECT * FROM sessions ORDER BY started_at DESC LIMIT ? OFFSET ?`).all(limit, offset) as SessionRow[];
}

export function deleteSession(id: string): void {
  getDb().prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
}

// ─── Message helpers ───

export function insertMessage(m: { id: string; session_id: string; role: string; content: string; timestamp: number }): void {
  getDb()
    .prepare(`INSERT OR REPLACE INTO messages(id, session_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)`)
    .run(m.id, m.session_id, m.role, m.content, m.timestamp);
}

export function getSessionMessages(sessionId: string): Array<{ id: string; role: string; content: string; timestamp: number }> {
  return getDb()
    .prepare(`SELECT id, role, content, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp ASC`)
    .all(sessionId) as Array<{ id: string; role: string; content: string; timestamp: number }>;
}

// ─── Search ───

export interface SearchHit {
  session_id: string;
  role: string;
  timestamp: number;
  snippet: string;
  session_title: string | null;
  session_started_at: number | null;
}

/**
 * FTS5 query sanitization: split on whitespace, wrap each word in
 * quotes (handles punctuation), append `*` to enable prefix matching.
 */
function sanitizeQuery(q: string): string {
  return q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `"${w.replace(/"/g, '')}"*`)
    .join(' ');
}

export function searchMessages(query: string, opts: { limit?: number; profile?: string | null } = {}): SearchHit[] {
  const limit = opts.limit ?? 50;
  const sanitized = sanitizeQuery(query);
  if (!sanitized) return [];

  const sql = opts.profile
    ? `SELECT m.session_id, m.role, m.timestamp,
              snippet(messages_fts, 0, '<<', '>>', '...', 32) AS snippet,
              s.title AS session_title, s.started_at AS session_started_at
       FROM messages_fts
       JOIN messages m ON m.rowid = messages_fts.rowid
       JOIN sessions s ON s.id = m.session_id
       WHERE messages_fts MATCH ? AND s.profile = ?
       ORDER BY rank
       LIMIT ?`
    : `SELECT m.session_id, m.role, m.timestamp,
              snippet(messages_fts, 0, '<<', '>>', '...', 32) AS snippet,
              s.title AS session_title, s.started_at AS session_started_at
       FROM messages_fts
       JOIN messages m ON m.rowid = messages_fts.rowid
       JOIN sessions s ON s.id = m.session_id
       WHERE messages_fts MATCH ?
       ORDER BY rank
       LIMIT ?`;

  return opts.profile
    ? (getDb().prepare(sql).all(sanitized, opts.profile, limit) as SearchHit[])
    : (getDb().prepare(sql).all(sanitized, limit) as SearchHit[]);
}

// ─── Model library CRUD ───

export interface ModelRow {
  id: string;
  name: string;
  provider: string;
  model: string;
  base_url: string | null;
  created_at: number;
}

export function listModels(): ModelRow[] {
  return getDb().prepare(`SELECT * FROM model_library ORDER BY created_at DESC`).all() as ModelRow[];
}

export function addModel(m: Omit<ModelRow, 'created_at'>): void {
  getDb()
    .prepare(`INSERT INTO model_library(id, name, provider, model, base_url) VALUES (?, ?, ?, ?, ?)`)
    .run(m.id, m.name, m.provider, m.model, m.base_url ?? null);
}

export function updateModel(m: Omit<ModelRow, 'created_at'>): void {
  getDb()
    .prepare(`UPDATE model_library SET name=?, provider=?, model=?, base_url=? WHERE id=?`)
    .run(m.name, m.provider, m.model, m.base_url ?? null, m.id);
}

export function removeModel(id: string): void {
  getDb().prepare(`DELETE FROM model_library WHERE id = ?`).run(id);
}

// ─── Workspaces ───

export interface WorkspaceRow {
  id: string;
  name: string;
  layout: string;
  created_at: number;
  updated_at: number;
}

export function listWorkspaces(): WorkspaceRow[] {
  return getDb().prepare(`SELECT * FROM workspaces ORDER BY updated_at DESC`).all() as WorkspaceRow[];
}

export function saveWorkspace(w: { id: string; name: string; layout: unknown }): void {
  const layout = JSON.stringify(w.layout);
  getDb()
    .prepare(
      `INSERT INTO workspaces(id, name, layout) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, layout=excluded.layout, updated_at=strftime('%s','now') * 1000`,
    )
    .run(w.id, w.name, layout);
}

export function deleteWorkspace(id: string): void {
  getDb().prepare(`DELETE FROM workspaces WHERE id = ?`).run(id);
}

// ─── Audit log ───

export function appendAudit(entry: {
  id: string;
  kind: string;
  request_id?: string | null;
  session_id?: string | null;
  decision?: string | null;
  payload?: unknown;
}): void {
  const payload = entry.payload === undefined ? null : JSON.stringify(entry.payload);
  getDb()
    .prepare(
      `INSERT INTO audit_log(id, kind, request_id, session_id, decision, payload) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(entry.id, entry.kind, entry.request_id ?? null, entry.session_id ?? null, entry.decision ?? null, payload);
}

export function listAudit(opts: { kind?: string; limit?: number } = {}): Array<{
  id: string;
  kind: string;
  request_id: string | null;
  session_id: string | null;
  decision: string | null;
  payload: string | null;
  created_at: number;
}> {
  const limit = opts.limit ?? 200;
  if (opts.kind) {
    return getDb().prepare(`SELECT * FROM audit_log WHERE kind = ? ORDER BY created_at DESC LIMIT ?`).all(opts.kind, limit) as Array<{
      id: string;
      kind: string;
      request_id: string | null;
      session_id: string | null;
      decision: string | null;
      payload: string | null;
      created_at: number;
    }>;
  }
  return getDb().prepare(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?`).all(limit) as Array<{
    id: string;
    kind: string;
    request_id: string | null;
    session_id: string | null;
    decision: string | null;
    payload: string | null;
    created_at: number;
  }>;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

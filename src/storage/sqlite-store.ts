import { AuthLensError } from '@/core';
import type { SessionStore, SessionSummary, StoredSession } from './types.js';

/**
 * SQLite-backed session store.
 *
 * 의도적으로 raw sensitive 값을 저장하지 않음. saveSession() 진입 시 raw 필드를 strip.
 */
export class SqliteSessionStore implements SessionStore {
  private db: SqliteDatabase | undefined;

  constructor(public readonly path: string) {}

  async init(): Promise<void> {
    let Database: SqliteCtor;
    try {
      const mod = (await import('better-sqlite3')) as unknown as { default: SqliteCtor };
      Database = mod.default;
    } catch {
      throw new AuthLensError(
        'DatabaseWriteFailed',
        'better-sqlite3 is not installed. Run `npm install better-sqlite3`.',
      );
    }
    try {
      this.db = new Database(this.path);
      this.db.pragma('journal_mode = WAL');
      this.db.exec(SCHEMA_SQL);
    } catch (e) {
      throw new AuthLensError('DatabaseWriteFailed', (e as Error).message);
    }
  }

  async saveSession(session: StoredSession): Promise<void> {
    const db = this.requireDb();
    const cleaned = stripRaw(session);
    db.prepare(
      `INSERT OR REPLACE INTO capture_sessions
        (id, target_url, started_at, ended_at, auth_type, confidence, flow_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      cleaned.id,
      cleaned.targetUrl,
      cleaned.startedAt,
      cleaned.endedAt ?? null,
      cleaned.authType ?? null,
      cleaned.confidence ?? null,
      JSON.stringify(cleaned.flow),
      new Date().toISOString(),
    );
  }

  async listSessions(limit = 50): Promise<SessionSummary[]> {
    const db = this.requireDb();
    const rows = db
      .prepare(
        `SELECT id, target_url, started_at, ended_at, auth_type, confidence
         FROM capture_sessions
         ORDER BY started_at DESC
         LIMIT ?`,
      )
      .all(limit) as Array<{
      id: string;
      target_url: string;
      started_at: string;
      ended_at: string | null;
      auth_type: string | null;
      confidence: number | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      targetUrl: r.target_url,
      startedAt: r.started_at,
      endedAt: r.ended_at ?? undefined,
      authType: r.auth_type ?? undefined,
      confidence: r.confidence ?? undefined,
    }));
  }

  async getSession(id: string): Promise<StoredSession | undefined> {
    const db = this.requireDb();
    const row = db
      .prepare(
        `SELECT id, target_url, started_at, ended_at, auth_type, confidence, flow_json
         FROM capture_sessions WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          target_url: string;
          started_at: string;
          ended_at: string | null;
          auth_type: string | null;
          confidence: number | null;
          flow_json: string;
        }
      | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      targetUrl: row.target_url,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? undefined,
      authType: row.auth_type ?? undefined,
      confidence: row.confidence ?? undefined,
      flow: JSON.parse(row.flow_json),
    };
  }

  async deleteSession(id: string): Promise<void> {
    const db = this.requireDb();
    db.prepare(`DELETE FROM capture_sessions WHERE id = ?`).run(id);
  }

  async deleteAll(): Promise<void> {
    const db = this.requireDb();
    db.exec(`DELETE FROM capture_sessions; DELETE FROM settings;`);
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = undefined;
  }

  private requireDb(): SqliteDatabase {
    if (!this.db) throw new AuthLensError('DatabaseWriteFailed', 'Store not initialized');
    return this.db;
  }
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS capture_sessions (
  id TEXT PRIMARY KEY,
  target_url TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  auth_type TEXT,
  confidence REAL,
  flow_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_capture_sessions_started_at
  ON capture_sessions (started_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

function stripRaw<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (key, val) => (key === 'raw' ? undefined : val)),
  );
}

type SqliteDatabase = {
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  exec(sql: string): void;
  pragma(sql: string): unknown;
  close(): void;
};
type SqliteCtor = new (path: string) => SqliteDatabase;

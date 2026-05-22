/**
 * SessionStore backed by the Tauri Rust SQLite store.
 *
 * Pure IPC wrapper: every method round-trips through `invoke()` to the
 * Rust side, which owns the SQLite connection. We re-serialize/deserialize
 * the AuthFlow as JSON on the boundary so the Rust side never has to
 * model the full AuthFlow type (which evolves with the analyzer).
 *
 * The raw-stripping policy is enforced here on save — defense in depth:
 * even if a future caller forgets to strip, persisted rows stay clean.
 */

import {
  sessionDelete,
  sessionDeleteAll,
  sessionGet,
  sessionList,
  sessionSave,
} from '@/ui/tauri/bridge.js';
import type { SessionStore, SessionSummary, StoredSession } from './types.js';

export class TauriSessionStore implements SessionStore {
  async init(): Promise<void> {
    // Rust side lazily opens the DB on first command; nothing to do here.
  }

  async saveSession(session: StoredSession): Promise<void> {
    const clean = stripRaw(session);
    await sessionSave({
      id: clean.id,
      targetUrl: clean.targetUrl,
      startedAt: clean.startedAt,
      endedAt: clean.endedAt,
      authType: clean.authType,
      confidence: clean.confidence,
      flowJson: JSON.stringify(clean.flow),
    });
  }

  async listSessions(limit = 50): Promise<SessionSummary[]> {
    const rows = await sessionList(limit);
    return rows.map((r) => ({
      id: r.id,
      targetUrl: r.targetUrl,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      authType: r.authType,
      confidence: r.confidence,
    }));
  }

  async getSession(id: string): Promise<StoredSession | undefined> {
    const row = await sessionGet(id);
    if (!row) return undefined;
    try {
      const flow = JSON.parse(row.flowJson);
      return {
        id: row.id,
        targetUrl: row.targetUrl,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        authType: row.authType,
        confidence: row.confidence,
        flow,
      };
    } catch (e) {
      // Corrupt row — surface so the UI can show an error rather than
      // silently dropping the user's history.
      throw new Error(`session ${id} JSON parse failed: ${(e as Error).message}`);
    }
  }

  async deleteSession(id: string): Promise<void> {
    await sessionDelete(id);
  }

  async deleteAll(): Promise<void> {
    await sessionDeleteAll();
  }

  async close(): Promise<void> {
    /* Rust side keeps the connection for the app lifetime. */
  }
}

function stripRaw<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (key, val) => (key === 'raw' ? undefined : val)),
  );
}

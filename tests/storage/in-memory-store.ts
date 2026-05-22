import type { SessionStore, SessionSummary, StoredSession } from '@/storage';

/**
 * 테스트 전용 메모리 저장소. 프로덕션 경로는 Rust SQLite 백엔드(@TauriSessionStore).
 * 같은 SessionStore 인터페이스를 구현해서 분석/UI 로직을 Tauri 없이 테스트.
 */
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, StoredSession>();

  async init(): Promise<void> {
    // no-op
  }

  async saveSession(session: StoredSession): Promise<void> {
    this.sessions.set(session.id, stripRaw(session));
  }

  async listSessions(limit = 50): Promise<SessionSummary[]> {
    const all = Array.from(this.sessions.values())
      .map(toSummary)
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    return all.slice(0, limit);
  }

  async getSession(id: string): Promise<StoredSession | undefined> {
    return this.sessions.get(id);
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async deleteAll(): Promise<void> {
    this.sessions.clear();
  }

  async close(): Promise<void> {
    // no-op
  }
}

function toSummary(s: StoredSession): SessionSummary {
  return {
    id: s.id,
    targetUrl: s.targetUrl,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    authType: s.authType,
    confidence: s.confidence,
  };
}

/** Saved session MUST NOT carry raw sensitive values. */
function stripRaw<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (key, val) => (key === 'raw' ? undefined : val)),
  );
}

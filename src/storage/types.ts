import type { AuthFlow } from '@/core';

export type StoredSession = {
  id: string;
  targetUrl: string;
  startedAt: string;
  endedAt?: string;
  authType?: string;
  confidence?: number;
  /** AuthFlow는 raw 제거 후 저장. */
  flow: AuthFlow;
};

export type SessionSummary = {
  id: string;
  targetUrl: string;
  startedAt: string;
  endedAt?: string;
  authType?: string;
  confidence?: number;
};

export interface SessionStore {
  init(): Promise<void>;
  saveSession(session: StoredSession): Promise<void>;
  listSessions(limit?: number): Promise<SessionSummary[]>;
  getSession(id: string): Promise<StoredSession | undefined>;
  deleteSession(id: string): Promise<void>;
  deleteAll(): Promise<void>;
  close(): Promise<void>;
}

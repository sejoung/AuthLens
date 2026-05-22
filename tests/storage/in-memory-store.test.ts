import { describe, expect, it } from 'vitest';
import { InMemorySessionStore } from './in-memory-store.js';
import type { StoredSession } from '@/storage/types';

function sample(id: string, started: string): StoredSession {
  return {
    id,
    targetUrl: 'https://app.example.com/',
    startedAt: started,
    endedAt: started,
    authType: 'cookie-session',
    confidence: 80,
    flow: {
      id,
      targetUrl: 'https://app.example.com/',
      startedAt: started,
      requests: [],
      responses: [],
      redirects: [],
      events: [],
      steps: [],
      cookiesBefore: [],
      cookiesAfter: [
        {
          name: 'session',
          domain: 'app.example.com',
          path: '/',
          value: { masked: '••••', raw: 'leaked', sensitivity: 'high' },
          httpOnly: true,
          secure: true,
        },
      ],
      storageBefore: { localStorage: [], sessionStorage: [] },
      storageAfter: { localStorage: [], sessionStorage: [] },
      loginCandidates: [],
    },
  };
}

describe('InMemorySessionStore', () => {
  it('saves and lists sessions in descending date order', async () => {
    const store = new InMemorySessionStore();
    await store.init();
    await store.saveSession(sample('a', '2026-01-01T00:00:00.000Z'));
    await store.saveSession(sample('b', '2026-02-01T00:00:00.000Z'));
    const list = await store.listSessions();
    expect(list[0]?.id).toBe('b');
    expect(list[1]?.id).toBe('a');
  });

  it('strips raw values on save', async () => {
    const store = new InMemorySessionStore();
    await store.init();
    await store.saveSession(sample('a', '2026-01-01T00:00:00.000Z'));
    const fetched = await store.getSession('a');
    const cookie = fetched?.flow.cookiesAfter[0];
    expect(cookie?.value.raw).toBeUndefined();
    expect(cookie?.value.masked).toBe('••••');
  });

  it('deletes one session', async () => {
    const store = new InMemorySessionStore();
    await store.init();
    await store.saveSession(sample('a', '2026-01-01T00:00:00.000Z'));
    await store.deleteSession('a');
    expect(await store.getSession('a')).toBeUndefined();
  });

  it('deletes all sessions', async () => {
    const store = new InMemorySessionStore();
    await store.init();
    await store.saveSession(sample('a', '2026-01-01T00:00:00.000Z'));
    await store.saveSession(sample('b', '2026-02-01T00:00:00.000Z'));
    await store.deleteAll();
    expect(await store.listSessions()).toHaveLength(0);
  });
});

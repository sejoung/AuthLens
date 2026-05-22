import { describe, expect, it } from 'vitest';
import { compareFlows } from '@/analyzer/comparison/compare';
import type {
  AuthFlow,
  AuthType,
  CookieSnapshot,
  RequestRecord,
  ResponseRecord,
  SecurityNote,
} from '@/core';

function emptyFlow(overrides: Partial<AuthFlow> = {}): AuthFlow {
  return {
    id: 'f',
    targetUrl: 'https://example.com',
    startedAt: new Date().toISOString(),
    requests: [],
    responses: [],
    redirects: [],
    events: [],
    steps: [],
    cookiesBefore: [],
    cookiesAfter: [],
    storageBefore: { localStorage: [], sessionStorage: [] },
    storageAfter: { localStorage: [], sessionStorage: [] },
    loginCandidates: [],
    ...overrides,
  };
}

function cookie(
  name: string,
  opts: Partial<Pick<CookieSnapshot, 'httpOnly' | 'secure' | 'sameSite'>> = {},
): CookieSnapshot {
  return {
    name,
    domain: 'example.com',
    path: '/',
    value: { masked: '***', sensitivity: 'high' },
    httpOnly: opts.httpOnly ?? true,
    secure: opts.secure ?? true,
    sameSite: opts.sameSite,
  };
}

function note(level: SecurityNote['level'], message: string): SecurityNote {
  return { level, message };
}

function makeRequest(url: string, method = 'GET'): RequestRecord {
  return {
    id: `req-${url}-${method}`,
    url,
    method,
    headers: {},
    resourceType: 'xhr',
    timestamp: new Date().toISOString(),
  };
}

function makeResponse(requestId: string, status: number): ResponseRecord {
  return {
    id: `res-${requestId}`,
    requestId,
    url: 'https://api.example.com/x',
    status,
    statusText: 'OK',
    headers: {},
    timestamp: new Date().toISOString(),
  };
}

describe('compareFlows', () => {
  it('detects authType change', () => {
    const base = emptyFlow({
      summary: {
        authType: 'cookie-session' as AuthType,
        confidence: 70,
        confidenceLevel: 'high',
        detectedSignals: [],
        warnings: [],
      },
    });
    const next = emptyFlow({
      summary: {
        authType: 'jwt' as AuthType,
        confidence: 80,
        confidenceLevel: 'high',
        detectedSignals: [],
        warnings: [],
      },
    });
    const diff = compareFlows(base, next);
    expect(diff.summary.authTypeChange).toEqual({ from: 'cookie-session', to: 'jwt' });
    expect(diff.summary.confidenceDelta).toBe(10);
  });

  it('detects cookie flag regressions', () => {
    const base = emptyFlow({
      cookiesAfter: [cookie('session', { httpOnly: true, secure: true })],
    });
    const next = emptyFlow({
      cookiesAfter: [cookie('session', { httpOnly: false, secure: true })],
    });
    const diff = compareFlows(base, next);
    expect(diff.cookies.flagsChanged).toHaveLength(1);
    expect(diff.cookies.flagsChanged[0]).toMatchObject({
      name: 'session',
      before: { httpOnly: true },
      after: { httpOnly: false },
    });
  });

  it('reports added and removed cookie names', () => {
    const base = emptyFlow({ cookiesAfter: [cookie('a'), cookie('b')] });
    const next = emptyFlow({ cookiesAfter: [cookie('b'), cookie('c')] });
    const diff = compareFlows(base, next);
    expect(diff.cookies.namesAdded).toEqual(['c']);
    expect(diff.cookies.namesRemoved).toEqual(['a']);
  });

  it('reports added and removed endpoints', () => {
    const baseReqs = [makeRequest('https://api.example.com/users')];
    const nextReqs = [
      makeRequest('https://api.example.com/users'),
      makeRequest('https://api.example.com/admin'),
    ];
    const base = emptyFlow({
      requests: baseReqs,
      responses: baseReqs.map((r) => makeResponse(r.id, 200)),
    });
    const next = emptyFlow({
      requests: nextReqs,
      responses: nextReqs.map((r) => makeResponse(r.id, 200)),
    });
    const diff = compareFlows(base, next);
    expect(diff.endpoints.added.some((e) => e.pathPattern.includes('/admin'))).toBe(true);
    expect(diff.endpoints.removed).toHaveLength(0);
    expect(diff.endpoints.common).toBeGreaterThanOrEqual(1);
  });

  it('diffs security notes by message', () => {
    const base = emptyFlow({
      summary: {
        authType: 'cookie-session' as AuthType,
        confidence: 50,
        confidenceLevel: 'medium',
        detectedSignals: [],
        warnings: [note('warning', 'missing HttpOnly'), note('info', 'shared')],
      },
    });
    const next = emptyFlow({
      summary: {
        authType: 'cookie-session' as AuthType,
        confidence: 50,
        confidenceLevel: 'medium',
        detectedSignals: [],
        warnings: [note('info', 'shared'), note('danger', 'new finding')],
      },
    });
    const diff = compareFlows(base, next);
    expect(diff.securityNotes.added.map((n) => n.message)).toEqual(['new finding']);
    expect(diff.securityNotes.removed.map((n) => n.message)).toEqual(['missing HttpOnly']);
  });
});

import { describe, expect, it } from 'vitest';
import { runBaselineChecks } from '@/analyzer/baseline/checks';
import type { AuthFlow, CookieSnapshot } from '@/core';

function emptyFlow(over: Partial<AuthFlow> = {}): AuthFlow {
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
    ...over,
  };
}

function cookie(name: string, over: Partial<CookieSnapshot> = {}): CookieSnapshot {
  return {
    name,
    domain: 'example.com',
    path: '/',
    value: { masked: '***', sensitivity: 'high' },
    httpOnly: false,
    secure: false,
    ...over,
  };
}

describe('runBaselineChecks - cookies', () => {
  it('flags auth-looking cookie without HttpOnly', () => {
    const flow = emptyFlow({ cookiesAfter: [cookie('session_id')] });
    const checks = runBaselineChecks(flow);
    expect(checks.some((c) => c.code === 'cookie.missing-httponly')).toBe(true);
  });

  it('flags missing Secure on auth cookie', () => {
    const flow = emptyFlow({ cookiesAfter: [cookie('auth_token', { httpOnly: true })] });
    const checks = runBaselineChecks(flow);
    expect(checks.some((c) => c.code === 'cookie.missing-secure')).toBe(true);
  });

  it('flags SameSite=None without Secure', () => {
    const flow = emptyFlow({
      cookiesAfter: [
        cookie('sid', { httpOnly: true, secure: false, sameSite: 'None' }),
      ],
    });
    const checks = runBaselineChecks(flow);
    expect(checks.some((c) => c.code === 'cookie.samesite-none-without-secure')).toBe(true);
  });

  it('passes a well-configured auth cookie', () => {
    const flow = emptyFlow({
      cookiesAfter: [cookie('sid', { httpOnly: true, secure: true, sameSite: 'Lax' })],
    });
    const checks = runBaselineChecks(flow);
    const cookieChecks = checks.filter((c) => c.category === 'cookie');
    expect(cookieChecks).toHaveLength(0);
  });

  it('ignores non-auth-looking cookies', () => {
    const flow = emptyFlow({ cookiesAfter: [cookie('_ga', { httpOnly: false })] });
    const checks = runBaselineChecks(flow);
    expect(checks.some((c) => c.category === 'cookie')).toBe(false);
  });
});

describe('runBaselineChecks - storage', () => {
  it('flags long opaque value in localStorage', () => {
    const flow = emptyFlow({
      storageAfter: {
        localStorage: [
          {
            key: 'access_token',
            value: { masked: '***', raw: 'a'.repeat(64), sensitivity: 'high' },
          },
        ],
        sessionStorage: [],
      },
    });
    const checks = runBaselineChecks(flow);
    expect(checks.some((c) => c.code === 'storage.token-in-localstorage')).toBe(true);
  });

  it('ignores short non-token values', () => {
    const flow = emptyFlow({
      storageAfter: {
        localStorage: [
          { key: 'theme', value: { masked: 'dark', raw: 'dark', sensitivity: 'none' } },
        ],
        sessionStorage: [],
      },
    });
    const checks = runBaselineChecks(flow);
    expect(checks.some((c) => c.code === 'storage.token-in-localstorage')).toBe(false);
  });
});

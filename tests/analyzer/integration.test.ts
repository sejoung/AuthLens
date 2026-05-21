import { describe, expect, it } from 'vitest';
import { analyze } from '@/analyzer/analyze';
import { toSensitiveValue, maskHeaders, type CookieSnapshot } from '@/core';

/**
 * End-to-end shape test: simulates a typical cookie-session login flow.
 *
 *   1. GET / → 200 (landing)
 *   2. GET /login → 200 (login page, hidden csrf)
 *   3. POST /api/login (form: email+password) → 200 + Set-Cookie session
 *   4. GET /api/me → 200 (with cookie)
 */
describe('analyze() integration — cookie-session', () => {
  it('detects login candidate, auth type, and produces full AuthFlow', () => {
    const t0 = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
    const ts = (offset: number) => new Date(t0.getTime() + offset).toISOString();

    const requests = [
      {
        id: 'r1',
        url: 'https://app.example.com/',
        method: 'GET',
        headers: maskHeaders({}),
        resourceType: 'document',
        timestamp: ts(0),
      },
      {
        id: 'r2',
        url: 'https://app.example.com/login',
        method: 'GET',
        headers: maskHeaders({}),
        resourceType: 'document',
        timestamp: ts(100),
      },
      {
        id: 'r3',
        url: 'https://app.example.com/api/login',
        method: 'POST',
        headers: maskHeaders({ 'x-csrf-token': 'csrf-abc' }),
        postData: toSensitiveValue('body', 'email=a%40b.com&password=hunter22'),
        resourceType: 'fetch',
        timestamp: ts(200),
      },
      {
        id: 'r4',
        url: 'https://app.example.com/api/me',
        method: 'GET',
        headers: maskHeaders({ cookie: 'session=abc123def' }),
        resourceType: 'fetch',
        timestamp: ts(300),
      },
    ];

    const responses = [
      {
        id: 'rs1',
        requestId: 'r1',
        url: requests[0]!.url,
        status: 200,
        statusText: 'OK',
        headers: maskHeaders({ 'content-type': 'text/html' }),
        timestamp: ts(10),
      },
      {
        id: 'rs2',
        requestId: 'r2',
        url: requests[1]!.url,
        status: 200,
        statusText: 'OK',
        headers: maskHeaders({ 'content-type': 'text/html' }),
        timestamp: ts(110),
      },
      {
        id: 'rs3',
        requestId: 'r3',
        url: requests[2]!.url,
        status: 200,
        statusText: 'OK',
        headers: maskHeaders({
          'set-cookie': 'session=abc123def; HttpOnly; Secure; SameSite=Lax',
        }),
        timestamp: ts(210),
      },
      {
        id: 'rs4',
        requestId: 'r4',
        url: requests[3]!.url,
        status: 200,
        statusText: 'OK',
        headers: maskHeaders({ 'content-type': 'application/json' }),
        timestamp: ts(310),
      },
    ];

    const sessionCookie: CookieSnapshot = {
      name: 'session',
      domain: 'app.example.com',
      path: '/',
      value: toSensitiveValue('session', 'abc123def'),
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    };

    const flow = analyze({
      targetUrl: 'https://app.example.com/',
      startedAt: ts(0),
      endedAt: ts(400),
      requests,
      responses,
      cookiesBefore: [],
      cookiesAfter: [sessionCookie],
      storageBefore: { localStorage: [], sessionStorage: [] },
      storageAfter: { localStorage: [], sessionStorage: [] },
    });

    expect(flow.loginCandidates[0]?.requestId).toBe('r3');
    expect(flow.summary?.authType).toBe('cookie-session');
    expect(flow.summary?.confidenceLevel).not.toBe('low');

    // Profile request detected
    const profileEvent = flow.events.find((e) => e.type === 'profile_request_detected');
    expect(profileEvent).toBeDefined();

    // Session verified
    const verified = flow.events.find((e) => e.type === 'session_verified');
    expect(verified).toBeDefined();

    // Cookie change captured
    const cookieChange = flow.events.find(
      (e) => e.type === 'cookie_changed' && (e as { cookieName: string }).cookieName === 'session',
    );
    expect(cookieChange).toBeDefined();

    // Steps are in increasing index
    flow.steps.forEach((s, i) => expect(s.index).toBe(i));
  });
});

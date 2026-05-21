import { describe, expect, it } from 'vitest';
import {
  filterNoteworthyEvents,
  filterNoteworthyRequests,
} from '@/analyzer/noteworthy';
import type { AuthEvent } from '@/core';
import { makeRequest } from './test-helpers.js';

describe('filterNoteworthyEvents', () => {
  it('keeps the first page_load but drops subsequent ones', () => {
    const events: AuthEvent[] = [
      { type: 'page_load', url: 'https://a/', timestamp: '2026-01-01T00:00:00.000Z' },
      { type: 'page_load', url: 'https://a/x', timestamp: '2026-01-01T00:00:01.000Z' },
    ];
    const out = filterNoteworthyEvents(events);
    expect(out).toHaveLength(1);
    expect((out[0] as { url: string }).url).toBe('https://a/');
  });

  it('keeps login/token/session/csrf/profile events', () => {
    const events: AuthEvent[] = [
      {
        type: 'login_request_detected',
        timestamp: '2026-01-01T00:00:00.000Z',
        requestId: 'r1',
        score: 80,
        reasons: [],
      },
      { type: 'token_stored', timestamp: '2026-01-01T00:00:01.000Z', storage: 'localStorage', key: 'token', format: 'jwt' },
      { type: 'session_verified', timestamp: '2026-01-01T00:00:02.000Z', requestId: 'r2' },
      { type: 'csrf_detected', timestamp: '2026-01-01T00:00:03.000Z', source: 'header', tokenName: 'X-CSRF' },
      { type: 'profile_request_detected', timestamp: '2026-01-01T00:00:04.000Z', requestId: 'r3', url: 'https://a/me' },
    ];
    expect(filterNoteworthyEvents(events)).toHaveLength(5);
  });

  it('drops in-domain redirect but keeps cross-domain', () => {
    const events: AuthEvent[] = [
      {
        type: 'redirect_detected',
        timestamp: '2026-01-01T00:00:00.000Z',
        fromUrl: 'https://a/x',
        toUrl: 'https://a/y',
        status: 302,
        isCrossDomain: false,
      },
      {
        type: 'redirect_detected',
        timestamp: '2026-01-01T00:00:01.000Z',
        fromUrl: 'https://a/x',
        toUrl: 'https://idp.b/sso',
        status: 302,
        isCrossDomain: true,
      },
    ];
    expect(filterNoteworthyEvents(events)).toHaveLength(1);
  });

  it('drops generic cookie changes but keeps HttpOnly or auth-shaped ones', () => {
    const events: AuthEvent[] = [
      { type: 'cookie_changed', timestamp: 't', cookieName: '_ga', change: 'added', httpOnly: false },
      { type: 'cookie_changed', timestamp: 't', cookieName: 'session', change: 'added', httpOnly: false },
      { type: 'cookie_changed', timestamp: 't', cookieName: 'anything', change: 'added', httpOnly: true },
    ];
    const out = filterNoteworthyEvents(events);
    expect(out).toHaveLength(2);
  });
});

describe('filterNoteworthyRequests', () => {
  it('hides static asset requests', () => {
    const reqs = [
      makeRequest({ url: 'https://a/style.css', resourceType: 'stylesheet' }),
      makeRequest({ url: 'https://a/api/me', resourceType: 'fetch' }),
      makeRequest({ url: 'https://a/logo.png', resourceType: 'image' }),
      makeRequest({ url: 'https://a/Roboto.woff', resourceType: 'font' }),
    ];
    const out = filterNoteworthyRequests(reqs);
    expect(out).toHaveLength(1);
    expect(out[0]?.url).toContain('/api/me');
  });

  it('always keeps login candidates even if they look like assets', () => {
    const reqs = [
      makeRequest({ url: 'https://a/login.png', resourceType: 'image' }),
    ];
    const out = filterNoteworthyRequests(reqs, [
      { requestId: reqs[0]!.id, score: 50, confidence: 'medium', reasons: [] },
    ]);
    expect(out).toHaveLength(1);
  });
});

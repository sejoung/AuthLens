import { analyze } from '@/analyzer';
import {
  DEFAULT_MASKING_POLICY,
  maskBodyText,
  maskHeaders,
  toSensitiveValue,
  withDefaultPolicy,
  type AuthFlow,
  type CookieSnapshot,
  type MaskingPolicy,
} from '@/core';

/**
 * 데모용 cookie-session 흐름.
 *
 * `policy.revealRaw=true`이면 SensitiveValue.raw가 메모리 안에 함께 담깁니다.
 * 저장(SQLite/InMemoryStore) 시점에는 모든 raw가 제거됩니다 — 정책은 변하지 않습니다.
 */
export function createDemoAuthFlow(
  targetUrl: string,
  policyInput?: Partial<MaskingPolicy>,
): AuthFlow {
  const policy = policyInput ? withDefaultPolicy(policyInput) : DEFAULT_MASKING_POLICY;
  const t0 = Date.now();
  const ts = (offset: number) => new Date(t0 + offset).toISOString();

  const requests = [
    {
      id: 'req-1',
      url: `${stripTrailing(targetUrl)}/`,
      method: 'GET',
      headers: maskHeaders({ 'user-agent': 'AuthLens/0.1 demo' }, policy),
      resourceType: 'document',
      timestamp: ts(0),
    },
    {
      id: 'req-2',
      url: `${stripTrailing(targetUrl)}/login`,
      method: 'GET',
      headers: maskHeaders({}, policy),
      resourceType: 'document',
      timestamp: ts(120),
    },
    {
      id: 'req-3',
      url: `${stripTrailing(targetUrl)}/api/login`,
      method: 'POST',
      headers: maskHeaders(
        {
          'content-type': 'application/json',
          'x-csrf-token': 'csrf-xyz-789',
        },
        policy,
      ),
      postData: maskBodyText(
        JSON.stringify({ email: 'demo@authlens.dev', password: 'demo-pw' }),
        policy,
      ),
      resourceType: 'fetch',
      timestamp: ts(620),
    },
    {
      id: 'req-4',
      url: `${stripTrailing(targetUrl)}/api/me`,
      method: 'GET',
      headers: maskHeaders({ cookie: 'session=session-value-12345abc' }, policy),
      resourceType: 'fetch',
      timestamp: ts(820),
    },
  ];

  const responses = [
    {
      id: 'res-1',
      requestId: 'req-1',
      url: requests[0]!.url,
      status: 200,
      statusText: 'OK',
      headers: maskHeaders({ 'content-type': 'text/html; charset=utf-8' }, policy),
      timestamp: ts(40),
    },
    {
      id: 'res-2',
      requestId: 'req-2',
      url: requests[1]!.url,
      status: 200,
      statusText: 'OK',
      headers: maskHeaders({ 'content-type': 'text/html; charset=utf-8' }, policy),
      timestamp: ts(160),
    },
    {
      id: 'res-3',
      requestId: 'req-3',
      url: requests[2]!.url,
      status: 200,
      statusText: 'OK',
      headers: maskHeaders(
        {
          'content-type': 'application/json',
          'set-cookie': 'session=session-value-12345abc; HttpOnly; Secure; SameSite=Lax',
        },
        policy,
      ),
      bodyPreview: maskBodyText(JSON.stringify({ ok: true, userId: 1 }), policy),
      timestamp: ts(660),
    },
    {
      id: 'res-4',
      requestId: 'req-4',
      url: requests[3]!.url,
      status: 200,
      statusText: 'OK',
      headers: maskHeaders({ 'content-type': 'application/json' }, policy),
      bodyPreview: maskBodyText(
        JSON.stringify({ id: 1, email: 'demo@authlens.dev' }),
        policy,
      ),
      timestamp: ts(900),
    },
  ];

  const host = new URL(targetUrl).hostname;
  const sessionCookie: CookieSnapshot = {
    name: 'session',
    domain: host,
    path: '/',
    value: toSensitiveValue('session', 'session-value-12345abc', policy),
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  };
  // Analytics cookie — included to demonstrate the compact filter.
  const analyticsCookie: CookieSnapshot = {
    name: '_ga',
    domain: host,
    path: '/',
    value: toSensitiveValue('_ga', 'GA1.2.987654321.demo', policy),
    httpOnly: false,
    secure: true,
    sameSite: 'Lax',
  };
  // Locale cookie — also non-auth noise.
  const localeCookie: CookieSnapshot = {
    name: 'i18n_locale',
    domain: host,
    path: '/',
    value: toSensitiveValue('i18n_locale', 'en-US', policy),
    httpOnly: false,
    secure: false,
  };

  return analyze({
    targetUrl,
    startedAt: ts(0),
    endedAt: ts(1000),
    requests,
    responses,
    cookiesBefore: [],
    cookiesAfter: [sessionCookie, analyticsCookie, localeCookie],
    storageBefore: { localStorage: [], sessionStorage: [] },
    storageAfter: {
      // 'preferences' is noise (no token shape), 'access_token' is auth signal.
      localStorage: [
        { key: 'preferences', value: toSensitiveValue('preferences', '{"theme":"dark"}', policy) },
      ],
      sessionStorage: [],
    },
  });
}

function stripTrailing(u: string): string {
  return u.replace(/\/+$/, '');
}

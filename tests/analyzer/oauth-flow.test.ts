import { describe, expect, it } from 'vitest';
import { findOAuthFlow } from '@/analyzer/oauth-flow';
import { toSensitiveValue, maskHeaders, type AuthFlow } from '@/core';

function flowOf(overrides: Partial<AuthFlow>): AuthFlow {
  return {
    id: 'f1',
    targetUrl: 'https://app.example.com/',
    startedAt: '2026-01-01T00:00:00.000Z',
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

describe('findOAuthFlow — authorize endpoint', () => {
  it('extracts PKCE + all standard parameters', () => {
    const url =
      'https://idp.example.com/oauth/authorize?response_type=code&client_id=demo' +
      '&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&scope=openid+profile' +
      '&state=xyz&nonce=abc&code_challenge=ch123&code_challenge_method=S256';
    const flow = flowOf({
      requests: [
        {
          id: 'r1',
          url,
          method: 'GET',
          headers: maskHeaders({}),
          resourceType: 'document',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const info = findOAuthFlow(flow);
    expect(info.authorizeRequests).toHaveLength(1);
    const a = info.authorizeRequests[0]!;
    expect(a.responseType).toBe('code');
    expect(a.clientId).toBe('demo');
    expect(a.redirectUri).toBe('https://app.example.com/cb');
    expect(a.scope).toBe('openid profile');
    expect(a.state).toBe('xyz');
    expect(a.nonce).toBe('abc');
    expect(a.codeChallenge).toBe('ch123');
    expect(a.codeChallengeMethod).toBe('S256');
    expect(a.pkce).toBe(true);
  });

  it('detects Google-style path (/o/oauth2/v2/auth) via path hint', () => {
    const url =
      'https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=goog&scope=openid';
    const info = findOAuthFlow(
      flowOf({
        requests: [
          {
            id: 'r1',
            url,
            method: 'GET',
            headers: maskHeaders({}),
            resourceType: 'document',
            timestamp: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    );
    expect(info.authorizeRequests).toHaveLength(1);
    expect(info.authorizeRequests[0]?.clientId).toBe('goog');
  });

  it('detects non-standard path by params (response_type + client_id)', () => {
    const url = 'https://idp.example.com/api/sso/login?response_type=code&client_id=xyz&state=abc';
    const info = findOAuthFlow(
      flowOf({
        requests: [
          {
            id: 'r1',
            url,
            method: 'GET',
            headers: maskHeaders({}),
            resourceType: 'document',
            timestamp: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    );
    expect(info.authorizeRequests).toHaveLength(1);
  });

  it('marks pkce=false when code_challenge missing', () => {
    const url =
      'https://idp.example.com/oauth/authorize?response_type=code&client_id=demo&state=xyz';
    const info = findOAuthFlow(
      flowOf({
        requests: [
          {
            id: 'r1',
            url,
            method: 'GET',
            headers: maskHeaders({}),
            resourceType: 'document',
            timestamp: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    );
    expect(info.authorizeRequests[0]?.pkce).toBe(false);
  });
});

describe('findOAuthFlow — token endpoint', () => {
  it('extracts grant_type, expires_in (→ expiresAt), refresh/id-token presence', () => {
    const issuedAt = '2026-01-01T12:00:00.000Z';
    const reqBody = 'grant_type=authorization_code&code=abc&client_id=demo&redirect_uri=x';
    const resBody = JSON.stringify({
      access_token: 'eyJh.fake.sig',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'rt-1',
      id_token: 'eyJh.id.sig',
      scope: 'openid profile email',
    });
    const flow = flowOf({
      requests: [
        {
          id: 'r1',
          url: 'https://idp.example.com/oauth/token',
          method: 'POST',
          headers: maskHeaders({ 'content-type': 'application/x-www-form-urlencoded' }),
          postData: toSensitiveValue('body', reqBody),
          resourceType: 'fetch',
          timestamp: issuedAt,
        },
      ],
      responses: [
        {
          id: 'rs1',
          requestId: 'r1',
          url: 'https://idp.example.com/oauth/token',
          status: 200,
          statusText: 'OK',
          headers: maskHeaders({ 'content-type': 'application/json' }),
          bodyPreview: toSensitiveValue('body', resBody),
          timestamp: issuedAt,
        },
      ],
    });
    const info = findOAuthFlow(flow);
    expect(info.tokenExchanges).toHaveLength(1);
    const t = info.tokenExchanges[0]!;
    expect(t.grantType).toBe('authorization_code');
    expect(t.clientId).toBe('demo');
    expect(t.tokenType).toBe('Bearer');
    expect(t.expiresInSeconds).toBe(3600);
    expect(t.expiresAt?.getTime()).toBe(Date.parse(issuedAt) + 3600 * 1000);
    expect(t.scope).toBe('openid profile email');
    expect(t.hasAccessToken).toBe(true);
    expect(t.hasRefreshToken).toBe(true);
    expect(t.hasIdToken).toBe(true);
    expect(t.status).toBe(200);
  });

  it('detects non-standard token endpoint via grant_type body fallback', () => {
    const reqBody = 'grant_type=authorization_code&code=abc&client_id=demo';
    const info = findOAuthFlow(
      flowOf({
        requests: [
          {
            id: 'r1',
            url: 'https://idp.example.com/api/oauth/exchange',
            method: 'POST',
            headers: maskHeaders({ 'content-type': 'application/x-www-form-urlencoded' }),
            postData: toSensitiveValue('body', reqBody),
            resourceType: 'fetch',
            timestamp: '2026-01-01T00:00:00.000Z',
          },
        ],
        responses: [
          {
            id: 'rs1',
            requestId: 'r1',
            url: 'https://idp.example.com/api/oauth/exchange',
            status: 200,
            statusText: 'OK',
            headers: maskHeaders({}),
            bodyPreview: toSensitiveValue('body', '{"access_token":"x","expires_in":3600}'),
            timestamp: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    );
    expect(info.tokenExchanges).toHaveLength(1);
    expect(info.tokenExchanges[0]?.grantType).toBe('authorization_code');
  });

  it('does not match GET /token', () => {
    const info = findOAuthFlow(
      flowOf({
        requests: [
          {
            id: 'r1',
            url: 'https://idp.example.com/token',
            method: 'GET',
            headers: maskHeaders({}),
            resourceType: 'fetch',
            timestamp: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    );
    expect(info.tokenExchanges).toHaveLength(0);
  });

  it('handles JSON-body token request (RFC 6749 §4.1.3 alt)', () => {
    const reqBody = JSON.stringify({ grant_type: 'refresh_token', refresh_token: 'rt-1' });
    const resBody = JSON.stringify({ access_token: 'eyJ.x.y', token_type: 'Bearer', expires_in: 600 });
    const info = findOAuthFlow(
      flowOf({
        requests: [
          {
            id: 'r1',
            url: 'https://idp.example.com/oauth/token',
            method: 'POST',
            headers: maskHeaders({ 'content-type': 'application/json' }),
            postData: toSensitiveValue('body', reqBody),
            resourceType: 'fetch',
            timestamp: '2026-01-01T00:00:00.000Z',
          },
        ],
        responses: [
          {
            id: 'rs1',
            requestId: 'r1',
            url: 'https://idp.example.com/oauth/token',
            status: 200,
            statusText: 'OK',
            headers: maskHeaders({}),
            bodyPreview: toSensitiveValue('body', resBody),
            timestamp: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    );
    expect(info.tokenExchanges[0]?.grantType).toBe('refresh_token');
    expect(info.tokenExchanges[0]?.expiresInSeconds).toBe(600);
  });
});

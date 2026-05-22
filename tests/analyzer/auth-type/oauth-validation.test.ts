import { describe, expect, it } from 'vitest';
import { validateOAuthFlow } from '@/analyzer/auth-type/oauth-validation';
import type { OAuthAuthorizeRequest, OAuthFlowInfo, OAuthTokenExchange } from '@/analyzer';

function authorize(over: Partial<OAuthAuthorizeRequest> = {}): OAuthAuthorizeRequest {
  return {
    requestId: 'req-1',
    endpoint: 'https://idp.example.com/authorize',
    responseType: 'code',
    clientId: 'app',
    redirectUri: 'https://app.example.com/cb',
    scope: 'openid',
    state: 'abcdefghij',
    nonce: 'nnnnnnnnnn',
    pkce: true,
    codeChallenge: 'xxx',
    codeChallengeMethod: 'S256',
    ...over,
  };
}

function token(over: Partial<OAuthTokenExchange> = {}): OAuthTokenExchange {
  return {
    requestId: 'req-tok',
    endpoint: 'https://idp.example.com/token',
    grantType: 'authorization_code',
    hasAccessToken: true,
    hasRefreshToken: false,
    hasIdToken: true,
    status: 200,
    ...over,
  };
}

function info(over: Partial<OAuthFlowInfo> = {}): OAuthFlowInfo {
  return {
    authorizeRequests: [],
    tokenExchanges: [],
    callbacks: [],
    bearerUsages: [],
    basicAuthUsages: [],
    ...over,
  };
}

describe('validateOAuthFlow', () => {
  it('passes a healthy Auth Code + PKCE OIDC flow', () => {
    const findings = validateOAuthFlow(info({ authorizeRequests: [authorize()] }));
    // Only acceptable non-danger finding for a healthy flow: none.
    expect(findings.filter((f) => f.level === 'danger')).toHaveLength(0);
    expect(findings.filter((f) => f.level === 'warning')).toHaveLength(0);
  });

  it('flags implicit flow as danger', () => {
    const findings = validateOAuthFlow(
      info({ authorizeRequests: [authorize({ responseType: 'token' })] }),
    );
    expect(findings.some((f) => f.code === 'oauth.implicit-flow' && f.level === 'danger')).toBe(true);
  });

  it('flags missing state', () => {
    const findings = validateOAuthFlow(
      info({ authorizeRequests: [authorize({ state: undefined })] }),
    );
    expect(findings.some((f) => f.code === 'oauth.missing-state')).toBe(true);
  });

  it('flags weak state (too short)', () => {
    const findings = validateOAuthFlow(
      info({ authorizeRequests: [authorize({ state: 'abc' })] }),
    );
    expect(findings.some((f) => f.code === 'oauth.weak-state')).toBe(true);
  });

  it('flags missing PKCE on code flow', () => {
    const findings = validateOAuthFlow(
      info({
        authorizeRequests: [authorize({ pkce: false, codeChallenge: undefined })],
      }),
    );
    expect(findings.some((f) => f.code === 'oauth.missing-pkce')).toBe(true);
  });

  it('flags PKCE plain method', () => {
    const findings = validateOAuthFlow(
      info({
        authorizeRequests: [authorize({ codeChallengeMethod: 'plain' })],
      }),
    );
    expect(findings.some((f) => f.code === 'oauth.pkce-plain')).toBe(true);
  });

  it('flags missing nonce on OIDC', () => {
    const findings = validateOAuthFlow(
      info({
        authorizeRequests: [authorize({ scope: 'openid profile', nonce: undefined })],
      }),
    );
    expect(findings.some((f) => f.code === 'oauth.missing-nonce')).toBe(true);
  });

  it('flags http redirect_uri (non-loopback)', () => {
    const findings = validateOAuthFlow(
      info({
        authorizeRequests: [authorize({ redirectUri: 'http://app.example.com/cb' })],
      }),
    );
    expect(findings.some((f) => f.code === 'oauth.http-redirect' && f.level === 'danger')).toBe(true);
  });

  it('allows http://localhost (loopback)', () => {
    const findings = validateOAuthFlow(
      info({
        authorizeRequests: [authorize({ redirectUri: 'http://localhost:3000/cb' })],
      }),
    );
    expect(findings.some((f) => f.code === 'oauth.http-redirect')).toBe(false);
  });

  it('flags token endpoint error', () => {
    const findings = validateOAuthFlow(info({ tokenExchanges: [token({ status: 400 })] }));
    expect(findings.some((f) => f.code === 'oauth.token-error-status')).toBe(true);
  });

  it('dedupes the same finding code across multiple authorizes', () => {
    const findings = validateOAuthFlow(
      info({
        authorizeRequests: [
          authorize({ state: undefined, requestId: 'a' }),
          authorize({ state: undefined, requestId: 'b' }),
        ],
      }),
    );
    expect(findings.filter((f) => f.code === 'oauth.missing-state')).toHaveLength(1);
  });
});

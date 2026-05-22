import { describe, expect, it } from 'vitest';
import { toSensitiveValue } from '@/core';
import { inferAuthType } from '@/analyzer/auth-type/detect';
import { diffCookies, diffStorage } from '@/analyzer/artifacts/diff';
import {
  EMPTY_STORAGE,
  makeCookie,
  makeHeaders,
  makeRequest,
  makeResponse,
} from '../test-helpers.js';

describe('inferAuthType', () => {
  it('detects cookie-session', () => {
    const cookies = [makeCookie({ name: 'session', httpOnly: true, secure: true })];
    const cookieDiff = diffCookies([], cookies);
    const storageDiff = diffStorage(EMPTY_STORAGE, EMPTY_STORAGE);
    const res = makeResponse('r1', {
      headers: makeHeaders({ 'set-cookie': 'session=abc; HttpOnly' }),
    });
    const result = inferAuthType({
      targetUrl: 'https://app.example.com/',
      requests: [],
      responses: [res],
      cookieDiff,
      storageDiff,
    });
    expect(result.authType).toBe('cookie-session');
    expect(result.confidenceLevel).not.toBe('low');
  });

  it('detects JWT', () => {
    const req = makeRequest({
      url: 'https://api.example.com/me',
      headers: makeHeaders({ authorization: 'Bearer eyJh.payload.sig' }),
    });
    const storageDiff = diffStorage(EMPTY_STORAGE, {
      localStorage: [{ key: 'access_token', value: toSensitiveValue('access_token', 'x') }],
      sessionStorage: [],
    });
    const result = inferAuthType({
      targetUrl: 'https://app.example.com/',
      requests: [req],
      responses: [],
      cookieDiff: { added: [], removed: [], changed: [] },
      storageDiff,
    });
    expect(result.authType).toBe('jwt');
  });

  it('detects OAuth flow', () => {
    const authorize = makeRequest({
      url:
        'https://idp.example.com/oauth/authorize?response_type=code&client_id=xyz&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&state=abc',
    });
    const tokenReq = makeRequest({
      url: 'https://idp.example.com/oauth/token',
      method: 'POST',
    });
    const result = inferAuthType({
      targetUrl: 'https://app.example.com/',
      requests: [authorize, tokenReq],
      responses: [],
      cookieDiff: { added: [], removed: [], changed: [] },
      storageDiff: diffStorage(EMPTY_STORAGE, EMPTY_STORAGE),
    });
    expect(['oauth', 'oidc']).toContain(result.authType);
  });

  it('warns when session cookie lacks Secure', () => {
    const cookies = [makeCookie({ name: 'session', secure: false, httpOnly: true })];
    const cookieDiff = diffCookies([], cookies);
    const result = inferAuthType({
      targetUrl: 'https://app.example.com/',
      requests: [],
      responses: [],
      cookieDiff,
      storageDiff: diffStorage(EMPTY_STORAGE, EMPTY_STORAGE),
    });
    expect(result.warnings.some((w) => w.message.includes('Secure'))).toBe(true);
  });

  it('classifies http-basic when Basic header is observed', () => {
    const credentials = Buffer.from('user:pw').toString('base64');
    const req = makeRequest({
      url: 'https://api.example.com/protected',
      headers: makeHeaders({ authorization: `Basic ${credentials}` }),
    });
    const result = inferAuthType({
      targetUrl: 'https://api.example.com/',
      requests: [req],
      responses: [],
      cookieDiff: { added: [], removed: [], changed: [] },
      storageDiff: diffStorage(EMPTY_STORAGE, EMPTY_STORAGE),
    });
    expect(result.authType).toBe('http-basic');
  });

  it('does not classify as oauth from Bearer-only signal (no authorize/token)', () => {
    const req = makeRequest({
      url: 'https://api.example.com/me',
      headers: makeHeaders({ authorization: 'Bearer eyJh.payload.sig' }),
    });
    const result = inferAuthType({
      targetUrl: 'https://api.example.com/',
      requests: [req],
      responses: [],
      cookieDiff: { added: [], removed: [], changed: [] },
      storageDiff: diffStorage(EMPTY_STORAGE, EMPTY_STORAGE),
    });
    expect(result.authType).not.toBe('oauth');
  });

  it('falls back to unknown when no signals', () => {
    const result = inferAuthType({
      targetUrl: 'https://app.example.com/',
      requests: [],
      responses: [],
      cookieDiff: { added: [], removed: [], changed: [] },
      storageDiff: diffStorage(EMPTY_STORAGE, EMPTY_STORAGE),
    });
    expect(result.authType).toBe('unknown');
    expect(result.confidenceLevel).toBe('low');
  });
});

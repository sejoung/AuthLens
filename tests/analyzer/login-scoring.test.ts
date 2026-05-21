import { describe, expect, it } from 'vitest';
import { rankLoginCandidates, scoreRequest } from '@/analyzer/login-scoring';
import {
  EMPTY_STORAGE,
  makeCookie,
  makeHeaders,
  makePostData,
  makeRequest,
  makeResponse,
} from './test-helpers.js';
import { diffCookies } from '@/analyzer/diff';

describe('scoreRequest', () => {
  it('scores POST /login with password body highly', () => {
    const req = makeRequest({
      url: 'https://app.example.com/api/login',
      method: 'POST',
      postData: makePostData('{"email":"a@b.com","password":"hunter22"}'),
    });
    const res = makeResponse(req.id, {
      url: req.url,
      status: 200,
      headers: makeHeaders({ 'set-cookie': 'session=abc; HttpOnly' }),
    });
    const { score, reasons } = scoreRequest(req, {
      requests: [req],
      responses: [res],
    });
    expect(score).toBeGreaterThanOrEqual(80);
    expect(reasons.join(' ')).toMatch(/login/);
  });

  it('does not score plain GET to /home', () => {
    const req = makeRequest({ url: 'https://example.com/home' });
    const { score } = scoreRequest(req, { requests: [req], responses: [] });
    expect(score).toBe(0);
  });

  it('detects profile follow-up boost', () => {
    const login = makeRequest({
      url: 'https://example.com/api/signin',
      method: 'POST',
      postData: makePostData('email=a%40b&password=x'),
    });
    const profile = makeRequest({ url: 'https://example.com/api/me' });
    const loginRes = makeResponse(login.id);
    const { reasons } = scoreRequest(login, {
      requests: [login, profile],
      responses: [loginRes],
    });
    expect(reasons.join(' ')).toMatch(/profile/);
  });

  it('rewards cookie diff context', () => {
    const req = makeRequest({
      url: 'https://example.com/api/login',
      method: 'POST',
    });
    const res = makeResponse(req.id, {
      headers: makeHeaders({ 'set-cookie': 'session=foo; HttpOnly' }),
    });
    const cookieDiff = diffCookies(
      [],
      [makeCookie({ name: 'session', httpOnly: true })],
    );
    const { score, reasons } = scoreRequest(req, {
      requests: [req],
      responses: [res],
      cookieDiff,
    });
    expect(reasons.join(' ')).toMatch(/Cookies changed/);
    expect(score).toBeGreaterThan(50);
  });
});

describe('rankLoginCandidates', () => {
  it('returns highest scoring candidate first', () => {
    const login = makeRequest({
      url: 'https://example.com/api/login',
      method: 'POST',
      postData: makePostData('password=secret'),
    });
    const home = makeRequest({ url: 'https://example.com/' });
    const loginRes = makeResponse(login.id, {
      headers: makeHeaders({ 'set-cookie': 'sid=1; HttpOnly' }),
    });
    const candidates = rankLoginCandidates({
      requests: [home, login],
      responses: [loginRes],
    });
    expect(candidates[0]?.requestId).toBe(login.id);
    expect(candidates[0]?.confidence).not.toBe('low');
  });

  it('skips image/font requests', () => {
    const img = makeRequest({
      url: 'https://example.com/login.png',
      resourceType: 'image',
    });
    const candidates = rankLoginCandidates({
      requests: [img],
      responses: [],
    });
    expect(candidates).toHaveLength(0);
  });

  it('respects EMPTY_STORAGE shape', () => {
    expect(EMPTY_STORAGE).toBeDefined();
  });
});

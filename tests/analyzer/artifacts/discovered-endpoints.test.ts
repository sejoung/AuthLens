import { describe, expect, it } from 'vitest';
import { discoverEndpoints, normalizePath } from '@/analyzer/artifacts/discovered-endpoints';
import { maskHeaders, type AuthFlow, type RequestRecord } from '@/core';

function makeReq(partial: Partial<RequestRecord> & { url: string }): RequestRecord {
  return {
    id: partial.id ?? `req-${Math.random()}`,
    method: 'GET',
    headers: maskHeaders({}),
    resourceType: 'fetch',
    timestamp: '2026-01-01T00:00:01.000Z',
    ...partial,
  };
}

function flowOf(requests: RequestRecord[], responses: AuthFlow['responses'] = []): AuthFlow {
  return {
    id: 'f',
    targetUrl: 'https://app.example.com/',
    startedAt: '2026-01-01T00:00:00.000Z',
    requests,
    responses,
    redirects: [],
    events: [],
    steps: [],
    cookiesBefore: [],
    cookiesAfter: [],
    storageBefore: { localStorage: [], sessionStorage: [] },
    storageAfter: { localStorage: [], sessionStorage: [] },
    loginCandidates: [],
  };
}

describe('normalizePath', () => {
  it('replaces numeric IDs with :id', () => {
    expect(normalizePath('/users/42/posts/7')).toBe('/users/:id/posts/:id');
  });
  it('replaces UUIDs with :id', () => {
    expect(normalizePath('/items/550e8400-e29b-41d4-a716-446655440000')).toBe('/items/:id');
  });
  it('replaces long hex with :id', () => {
    expect(normalizePath('/blobs/abcdef0123456789')).toBe('/blobs/:id');
  });
  it('leaves normal path segments alone', () => {
    expect(normalizePath('/api/users')).toBe('/api/users');
  });
});

describe('discoverEndpoints', () => {
  it('groups requests that hit the same pattern', () => {
    const reqs = [
      makeReq({ id: 'a', url: 'https://api.example.com/users/1' }),
      makeReq({ id: 'b', url: 'https://api.example.com/users/2' }),
      makeReq({ id: 'c', url: 'https://api.example.com/users/3', method: 'POST' }),
    ];
    const out = discoverEndpoints(flowOf(reqs), { afterLoginOnly: false });
    expect(out).toHaveLength(1);
    expect(out[0]?.pathPattern).toBe('/users/:id');
    expect(out[0]?.methods).toEqual(['GET', 'POST']);
    expect(out[0]?.requestCount).toBe(3);
  });

  it('separates different hosts', () => {
    const reqs = [
      makeReq({ id: 'a', url: 'https://api.a.com/me' }),
      makeReq({ id: 'b', url: 'https://api.b.com/me' }),
    ];
    expect(discoverEndpoints(flowOf(reqs), { afterLoginOnly: false })).toHaveLength(2);
  });

  it('filters out non-API resource types when apiOnly=true', () => {
    const reqs = [
      makeReq({ id: 'a', url: 'https://app/page', resourceType: 'document' }),
      makeReq({ id: 'b', url: 'https://app/api', resourceType: 'fetch' }),
      makeReq({ id: 'c', url: 'https://app/style.css', resourceType: 'stylesheet' }),
    ];
    const out = discoverEndpoints(flowOf(reqs), { afterLoginOnly: false });
    expect(out).toHaveLength(1);
    expect(out[0]?.pathPattern).toBe('/api');
  });

  it('excludes requests before the login candidate when afterLoginOnly=true', () => {
    const reqs = [
      makeReq({
        id: 'pre',
        url: 'https://app/api/anon',
        timestamp: '2026-01-01T00:00:00.500Z',
      }),
      makeReq({
        id: 'login',
        url: 'https://app/api/login',
        method: 'POST',
        timestamp: '2026-01-01T00:00:01.000Z',
      }),
      makeReq({
        id: 'post',
        url: 'https://app/api/me',
        timestamp: '2026-01-01T00:00:02.000Z',
      }),
    ];
    const flow = flowOf(reqs, [
      {
        id: 'rs',
        requestId: 'login',
        url: 'https://app/api/login',
        status: 200,
        statusText: 'OK',
        headers: maskHeaders({}),
        timestamp: '2026-01-01T00:00:01.100Z',
      },
    ]);
    flow.loginCandidates = [{ requestId: 'login', score: 80, confidence: 'high', reasons: [] }];
    const out = discoverEndpoints(flow);
    const patterns = out.map((e) => e.pathPattern);
    expect(patterns).not.toContain('/api/anon');
    expect(patterns).toContain('/api/me');
  });

  it('marks authenticated when Authorization or session cookie present', () => {
    const reqs = [
      makeReq({
        id: 'a',
        url: 'https://api/me',
        headers: maskHeaders({ authorization: 'Bearer xxx' }),
      }),
    ];
    const out = discoverEndpoints(flowOf(reqs), { afterLoginOnly: false });
    expect(out[0]?.authenticated).toBe(true);
  });
});

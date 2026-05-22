import { describe, expect, it } from 'vitest';
import { findLogoutEndpoints } from '@/analyzer/login/logout';
import { maskHeaders, type AuthFlow } from '@/core';

function flowOf(
  requests: AuthFlow['requests'],
  responses: AuthFlow['responses'] = [],
): AuthFlow {
  return {
    id: 'f',
    targetUrl: 'https://app/',
    startedAt: 't',
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

describe('findLogoutEndpoints', () => {
  it('detects common logout path variants', () => {
    const reqs = [
      { id: 'a', url: 'https://app/logout', method: 'POST', headers: maskHeaders({}), resourceType: 'fetch', timestamp: 't' },
      { id: 'b', url: 'https://app/api/signout', method: 'POST', headers: maskHeaders({}), resourceType: 'fetch', timestamp: 't' },
      { id: 'c', url: 'https://app/session/destroy', method: 'POST', headers: maskHeaders({}), resourceType: 'fetch', timestamp: 't' },
      { id: 'd', url: 'https://app/api/users', method: 'GET', headers: maskHeaders({}), resourceType: 'fetch', timestamp: 't' },
    ];
    const out = findLogoutEndpoints(flowOf(reqs));
    expect(out.map((e) => e.request.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('marks session cookie cleared when Set-Cookie has Max-Age=0', () => {
    const out = findLogoutEndpoints(
      flowOf(
        [
          { id: 'a', url: 'https://app/logout', method: 'POST', headers: maskHeaders({}), resourceType: 'fetch', timestamp: 't' },
        ],
        [
          {
            id: 'r',
            requestId: 'a',
            url: 'https://app/logout',
            status: 200,
            statusText: 'OK',
            headers: maskHeaders({ 'set-cookie': 'session=; Path=/; Max-Age=0' }),
            timestamp: 't',
          },
        ],
      ),
    );
    expect(out[0]?.clearedSessionCookie).toBe(true);
  });
});

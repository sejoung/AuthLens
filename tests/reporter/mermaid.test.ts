import { describe, expect, it } from 'vitest';
import { generateMermaidDiagram } from '@/reporter/mermaid';
import { maskHeaders, type AuthFlow } from '@/core';

function emptyFlow(events: AuthFlow['events']): AuthFlow {
  return {
    id: 'f1',
    targetUrl: 'https://app.example.com/',
    startedAt: '2026-01-01T00:00:00.000Z',
    requests: [],
    responses: [],
    redirects: [],
    events,
    steps: [],
    cookiesBefore: [],
    cookiesAfter: [],
    storageBefore: { localStorage: [], sessionStorage: [] },
    storageAfter: { localStorage: [], sessionStorage: [] },
    loginCandidates: [],
  };
}

describe('generateMermaidDiagram', () => {
  it('uses just Browser+App when no IDP / no API', () => {
    const flow = emptyFlow([
      { type: 'page_load', url: 'https://app.example.com/', timestamp: '2026-01-01T00:00:00.000Z' },
    ]);
    const out = generateMermaidDiagram(flow);
    expect(out).toContain('participant Browser');
    expect(out).toContain('participant App');
    expect(out).not.toContain('participant Auth');
    expect(out).not.toContain('participant API');
  });

  it('adds Auth Server participant on cross-domain redirect', () => {
    const flow = emptyFlow([
      {
        type: 'redirect_detected',
        timestamp: '2026-01-01T00:00:00.000Z',
        fromUrl: 'https://app.example.com/login',
        toUrl: 'https://idp.example.com/sso',
        status: 302,
        isCrossDomain: true,
      },
    ]);
    expect(generateMermaidDiagram(flow)).toContain('participant Auth as Auth Server');
  });

  it('adds API participant on profile request', () => {
    const flow = emptyFlow([
      {
        type: 'profile_request_detected',
        timestamp: '2026-01-01T00:00:00.000Z',
        requestId: 'r1',
        url: 'https://api.example.com/me',
      },
    ]);
    expect(generateMermaidDiagram(flow)).toContain('participant API');
  });

  it('uses short paths instead of full URLs', () => {
    const flow = emptyFlow([
      {
        type: 'page_load',
        url: 'https://app.example.com/very/long/path?with=a&lot=of&query=params',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const out = generateMermaidDiagram(flow);
    expect(out).toContain('/very/long/path');
    expect(out).not.toContain('with=a&lot=of');
  });

  it('avoids leaking sensitive header data', () => {
    const flow = emptyFlow([]);
    flow.requests = [
      {
        id: 'r1',
        url: 'https://app.example.com/api/login',
        method: 'POST',
        headers: maskHeaders({ authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig' }),
        resourceType: 'fetch',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    ];
    flow.events = [
      {
        type: 'login_request_detected',
        timestamp: '2026-01-01T00:00:00.000Z',
        requestId: 'r1',
        score: 80,
        reasons: [],
      },
    ];
    const out = generateMermaidDiagram(flow);
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiJ9.payload.sig');
  });
});

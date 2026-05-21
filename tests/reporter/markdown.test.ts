import { describe, expect, it } from 'vitest';
import { generateMarkdownReport } from '@/reporter/markdown';
import { generateMermaidDiagram } from '@/reporter/mermaid';
import { stringifyJsonExport } from '@/reporter/json-export';
import { toCurlCommand, toFetchSnippet } from '@/reporter/curl-fetch';
import {
  toSensitiveValue,
  maskHeaders,
  type AuthFlow,
  type CookieDiff,
  type StorageDiff,
} from '@/core';

function buildSampleFlow(): { flow: AuthFlow; cookieDiff: CookieDiff; storageDiff: StorageDiff } {
  const req = {
    id: 'req1',
    url: 'https://app.example.com/api/login',
    method: 'POST',
    headers: maskHeaders({
      'content-type': 'application/json',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
    }),
    postData: toSensitiveValue('body', JSON.stringify({ email: 'a@b.com', password: 'x' })),
    resourceType: 'fetch',
    timestamp: '2026-01-01T00:00:00.000Z',
  };
  const res = {
    id: 'res1',
    requestId: 'req1',
    url: req.url,
    status: 200,
    statusText: 'OK',
    headers: maskHeaders({ 'set-cookie': 'session=abc1234567def; HttpOnly; Secure' }),
    timestamp: '2026-01-01T00:00:01.000Z',
  };
  const cookieDiff: CookieDiff = {
    added: [
      {
        name: 'session',
        domain: 'app.example.com',
        path: '/',
        value: toSensitiveValue('session', 'abc1234567def'),
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      },
    ],
    removed: [],
    changed: [],
  };
  const storageDiff: StorageDiff = {
    localStorage: { added: [], removed: [], changed: [] },
    sessionStorage: { added: [], removed: [], changed: [] },
  };
  const flow: AuthFlow = {
    id: 'flow1',
    targetUrl: 'https://app.example.com/',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:00:05.000Z',
    requests: [req],
    responses: [res],
    redirects: [],
    events: [
      { type: 'page_load', url: 'https://app.example.com/', timestamp: '2026-01-01T00:00:00.000Z' },
      {
        type: 'login_request_detected',
        timestamp: '2026-01-01T00:00:00.500Z',
        requestId: 'req1',
        score: 95,
        reasons: ['POST to /login', 'password in body'],
      },
      {
        type: 'cookie_changed',
        timestamp: '2026-01-01T00:00:01.000Z',
        cookieName: 'session',
        change: 'added',
        httpOnly: true,
      },
    ],
    steps: [],
    cookiesBefore: [],
    cookiesAfter: cookieDiff.added,
    storageBefore: { localStorage: [], sessionStorage: [] },
    storageAfter: { localStorage: [], sessionStorage: [] },
    loginCandidates: [
      {
        requestId: 'req1',
        score: 95,
        confidence: 'high',
        reasons: ['[+20] URL contains "login"', '[+20] Method is POST'],
      },
    ],
    summary: {
      authType: 'cookie-session',
      confidence: 80,
      confidenceLevel: 'high',
      loginRequestId: 'req1',
      detectedSignals: [
        {
          kind: 'cookie-session.httponly-added',
          description: 'Session cookie added',
          weight: 40,
        },
      ],
      warnings: [],
    },
  };
  return { flow, cookieDiff, storageDiff };
}

describe('generateMarkdownReport', () => {
  it('includes mandatory sections', () => {
    const { flow, cookieDiff, storageDiff } = buildSampleFlow();
    const md = generateMarkdownReport(flow, cookieDiff, storageDiff);
    for (const heading of [
      '## Summary',
      '## Detected Authentication Type',
      '## Login Request Candidate',
      '## Cookie Changes',
      '## Storage Changes',
      '## Redirect Flow',
      '## Mermaid Diagram',
      '## Timeline',
      '## Security Notes',
    ]) {
      expect(md).toContain(heading);
    }
  });

  it('masks sensitive cookie value by default', () => {
    const { flow, cookieDiff, storageDiff } = buildSampleFlow();
    const md = generateMarkdownReport(flow, cookieDiff, storageDiff);
    expect(md).not.toContain('abc1234567def');
  });

  it('reveals raw value when includeRaw=true', () => {
    const { flow, cookieDiff, storageDiff } = buildSampleFlow();
    // Need to inject raw values into the value first
    cookieDiff.added[0]!.value = {
      masked: 'abc1••••••••',
      raw: 'abc1234567def',
      sensitivity: 'high',
    };
    const md = generateMarkdownReport(flow, cookieDiff, storageDiff, {
      includeRaw: true,
    });
    expect(md).toContain('abc1234567def');
  });

  it('respects enforceMasking even with includeRaw', () => {
    const { flow, cookieDiff, storageDiff } = buildSampleFlow();
    cookieDiff.added[0]!.value = {
      masked: 'abc1••••••••',
      raw: 'abc1234567def',
      sensitivity: 'high',
    };
    const md = generateMarkdownReport(flow, cookieDiff, storageDiff, {
      includeRaw: true,
      enforceMasking: true,
    });
    expect(md).not.toContain('abc1234567def');
  });
});

describe('generateMermaidDiagram', () => {
  it('produces valid sequenceDiagram declaration', () => {
    const { flow } = buildSampleFlow();
    const diag = generateMermaidDiagram(flow);
    expect(diag.startsWith('sequenceDiagram')).toBe(true);
    expect(diag).toContain('Browser');
    expect(diag).toContain('App');
  });
});

describe('stringifyJsonExport', () => {
  it('strips raw values by default', () => {
    const { flow } = buildSampleFlow();
    flow.cookiesAfter[0]!.value = {
      masked: 'abc1••••',
      raw: 'leaked-secret',
      sensitivity: 'high',
    };
    const json = stringifyJsonExport(flow);
    expect(json).not.toContain('leaked-secret');
    expect(json).toContain('"schemaVersion"');
    expect(json).toContain('"tool": "AuthLens"');
  });

  it('includes raw when explicitly enabled', () => {
    const { flow } = buildSampleFlow();
    flow.cookiesAfter[0]!.value = {
      masked: 'abc1••••',
      raw: 'opt-in-raw',
      sensitivity: 'high',
    };
    const json = stringifyJsonExport(flow, { includeRaw: true });
    expect(json).toContain('opt-in-raw');
    expect(json).toContain('"rawIncluded": true');
  });
});

describe('toCurlCommand / toFetchSnippet', () => {
  it('renders curl with masked Authorization', () => {
    const { flow } = buildSampleFlow();
    const req = flow.requests[0]!;
    const curl = toCurlCommand(req);
    expect(curl).toContain("curl -X POST");
    expect(curl).toContain(req.url);
    expect(curl).not.toContain('eyJhbGciOiJIUzI1NiJ9.payload.sig');
  });

  it('renders fetch snippet', () => {
    const { flow } = buildSampleFlow();
    const req = flow.requests[0]!;
    const code = toFetchSnippet(req);
    expect(code).toContain('await fetch(');
    expect(code).toContain('"method": "POST"');
  });
});

import { describe, expect, it } from 'vitest';
import { diffCookies, diffStorage } from '@/analyzer';
import {
  generateMarkdownReport,
  stringifyJsonExport,
  DEFAULT_REPORT_STRINGS,
} from '@/reporter';
import { createDemoAuthFlow } from '@/ui/demo/sampleFlow';

const URL = 'https://app.example.com/';

describe('Reveal raw chain — Settings → demo flow → Report', () => {
  it('with revealRaw=false, demo flow has no raw on sensitive fields', () => {
    const flow = createDemoAuthFlow(URL, { revealRaw: false });
    const session = flow.cookiesAfter.find((c) => c.name === 'session');
    expect(session).toBeDefined();
    expect(session?.value.sensitivity).toBe('high');
    expect(session?.value.raw).toBeUndefined();
  });

  it('with revealRaw=true, demo flow stores raw alongside masked', () => {
    const flow = createDemoAuthFlow(URL, { revealRaw: true });
    const session = flow.cookiesAfter.find((c) => c.name === 'session');
    expect(session?.value.raw).toBe('session-value-12345abc');
    expect(session?.value.masked).not.toBe(session?.value.raw);

    // post body
    const login = flow.requests.find((r) => r.url.endsWith('/api/login'));
    expect(login?.postData?.raw).toContain('demo-pw');
  });

  it('markdown report with includeRaw=true exposes raw cookie value', () => {
    const flow = createDemoAuthFlow(URL, { revealRaw: true });
    const cookieDiff = diffCookies(flow.cookiesBefore, flow.cookiesAfter);
    const storageDiff = diffStorage(flow.storageBefore, flow.storageAfter);

    const md = generateMarkdownReport(
      flow,
      cookieDiff,
      storageDiff,
      { includeRaw: true },
      DEFAULT_REPORT_STRINGS,
    );
    expect(md).toContain('session-value-12345abc');
  });

  it('markdown report with includeRaw=false keeps masked even when raw is present', () => {
    const flow = createDemoAuthFlow(URL, { revealRaw: true });
    const cookieDiff = diffCookies(flow.cookiesBefore, flow.cookiesAfter);
    const storageDiff = diffStorage(flow.storageBefore, flow.storageAfter);
    const md = generateMarkdownReport(
      flow,
      cookieDiff,
      storageDiff,
      { includeRaw: false },
      DEFAULT_REPORT_STRINGS,
    );
    expect(md).not.toContain('session-value-12345abc');
  });

  it('JSON export with includeRaw=true preserves raw fields', () => {
    const flow = createDemoAuthFlow(URL, { revealRaw: true });
    const json = stringifyJsonExport(flow, { includeRaw: true });
    expect(json).toContain('session-value-12345abc');
  });
});

import { describe, expect, it } from 'vitest';
import { InMemoryRecorder } from '@/recorder/in-memory-recorder';

describe('InMemoryRecorder', () => {
  it('captures requests and responses', () => {
    const rec = new InMemoryRecorder('https://app.example.com/');
    const req = rec.recordRequest({
      url: 'https://app.example.com/api/login',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      postData: JSON.stringify({ email: 'a@b.com', password: 'x' }),
      resourceType: 'fetch',
    });
    rec.attachResponse({
      requestId: req.id,
      url: req.url,
      status: 200,
      statusText: 'OK',
      headers: { 'set-cookie': 'session=abc123; HttpOnly' },
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
    const cap = rec.stop();
    expect(cap.requests).toHaveLength(1);
    expect(cap.responses).toHaveLength(1);
    expect(cap.requests[0]?.postData?.masked).not.toContain('hunter');
  });

  it('masks password in request body', () => {
    const rec = new InMemoryRecorder('https://app.example.com/');
    const req = rec.recordRequest({
      url: 'https://app.example.com/login',
      method: 'POST',
      headers: {},
      postData: 'email=a%40b.com&password=hunter22',
      resourceType: 'fetch',
    });
    expect(req.postData?.masked).not.toContain('hunter22');
  });

  it('excludes binary response bodies', () => {
    const rec = new InMemoryRecorder('https://app.example.com/');
    const req = rec.recordRequest({
      url: 'https://app.example.com/img.png',
      method: 'GET',
      headers: {},
      resourceType: 'image',
    });
    rec.attachResponse({
      requestId: req.id,
      url: req.url,
      status: 200,
      statusText: 'OK',
      headers: {},
      contentType: 'image/png',
      body: 'binary-bytes-here',
    });
    const cap = rec.stop();
    expect(cap.responses[0]?.isBinary).toBe(true);
    expect(cap.responses[0]?.bodyPreview?.masked).toBe('[binary content excluded]');
  });

  it('truncates large response bodies to limit', () => {
    const rec = new InMemoryRecorder('https://app.example.com/', {
      bodyPreviewLimit: 16,
    });
    const req = rec.recordRequest({
      url: 'https://app.example.com/api/big',
      method: 'GET',
      headers: {},
      resourceType: 'fetch',
    });
    rec.attachResponse({
      requestId: req.id,
      url: req.url,
      status: 200,
      statusText: 'OK',
      headers: {},
      contentType: 'application/json',
      body: 'x'.repeat(1000),
    });
    const cap = rec.stop();
    expect(cap.responses[0]?.bodyPreview?.masked.length).toBeLessThanOrEqual(20);
  });

  it('stats() reports counts', () => {
    const rec = new InMemoryRecorder('https://app.example.com/');
    rec.recordRequest({
      url: 'https://a/1',
      method: 'GET',
      headers: {},
      resourceType: 'fetch',
    });
    rec.recordRequest({
      url: 'https://a/2',
      method: 'GET',
      headers: {},
      resourceType: 'fetch',
    });
    expect(rec.stats().requestCount).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { analyzeLoginCredentials } from '@/analyzer/login/credentials';
import { maskBodyText, maskHeaders, toSensitiveValue } from '@/core';
import { makeRequest } from '../test-helpers.js';

describe('analyzeLoginCredentials — Authorization header', () => {
  it('decodes Basic auth username AND password (display is gated downstream)', () => {
    const credentials = Buffer.from('admin:s3cret!').toString('base64');
    const req = makeRequest({
      method: 'POST',
      url: 'https://api.example.com/login',
      headers: maskHeaders({ authorization: `Basic ${credentials}` }),
    });
    const out = analyzeLoginCredentials(req);
    expect(out.scheme).toBe('basic');
    expect(out.basicUsername).toBe('admin');
    // Analyzer surfaces the data; UI/Reporter decides whether to display
    // (gated by Settings.revealRawByDefault / MarkdownOptions.includeRaw).
    expect(out.basicPassword).toBe('s3cret!');
  });

  it('detects Bearer header (with JWT shape recognition)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.signature';
    const req = makeRequest({
      method: 'POST',
      url: 'https://api.example.com/refresh',
      headers: maskHeaders({ authorization: `Bearer ${jwt}` }),
    });
    const out = analyzeLoginCredentials(req);
    expect(out.scheme).toBe('bearer');
    expect(out.bearerIsJwt).toBe(true);
    expect(out.bearerTokenLength).toBe(jwt.length);
  });
});

describe('analyzeLoginCredentials — request body', () => {
  it('finds email/password fields in JSON body and captures values when raw available', () => {
    const req = makeRequest({
      method: 'POST',
      url: 'https://api.example.com/login',
      headers: maskHeaders({ 'content-type': 'application/json' }),
      postData: toSensitiveValue(
        'body',
        JSON.stringify({ email: 'a@b.com', password: 'hunter22' }),
      ),
    });
    const out = analyzeLoginCredentials(req);
    expect(out.bodyFormat).toBe('json');
    expect(out.usernameField).toBe('email');
    expect(out.usernameValue).toBe('a@b.com');
    expect(out.passwordField).toBe('password');
    expect(out.passwordValue).toBe('hunter22');
  });

  it('finds fields in form-urlencoded body and captures values', () => {
    const req = makeRequest({
      method: 'POST',
      url: 'https://api.example.com/login',
      headers: maskHeaders({ 'content-type': 'application/x-www-form-urlencoded' }),
      postData: toSensitiveValue('body', 'username=alice&pwd=secret'),
    });
    const out = analyzeLoginCredentials(req);
    expect(out.bodyFormat).toBe('form');
    expect(out.usernameField).toBe('username');
    expect(out.usernameValue).toBe('alice');
    expect(out.passwordField).toBe('pwd');
    expect(out.passwordValue).toBe('secret');
  });

  it('still names the password field even when raw is unavailable (only masked)', () => {
    // maskBodyText with revealRaw=false drops raw and masks sensitive fields.
    const masked = maskBodyText(
      JSON.stringify({ email: 'a@b', password: 'x' }),
      { revealRaw: false, previewLength: 4, extraKeys: new Set() },
    );
    expect(masked.raw).toBeUndefined(); // sanity: precondition
    const req = makeRequest({
      method: 'POST',
      url: 'https://api.example.com/login',
      headers: maskHeaders({}),
      postData: masked,
    });
    const out = analyzeLoginCredentials(req);
    expect(out.passwordField).toBe('password');
    // values should not be set when raw is missing
    expect(out.usernameValue).toBeUndefined();
    expect(out.passwordValue).toBeUndefined();
  });
});

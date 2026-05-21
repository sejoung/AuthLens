import { describe, expect, it } from 'vitest';
import { findLoginForm } from '@/analyzer/login-form';
import { maskHeaders, toSensitiveValue, type AuthFlow } from '@/core';

function flowWithHtml(url: string, html: string): AuthFlow {
  return {
    id: 'f',
    targetUrl: 'https://app/',
    startedAt: 't',
    requests: [],
    responses: [
      {
        id: 'res1',
        requestId: 'r1',
        url,
        status: 200,
        statusText: 'OK',
        headers: maskHeaders({ 'content-type': 'text/html; charset=utf-8' }),
        contentType: 'text/html; charset=utf-8',
        bodyPreview: toSensitiveValue('body', html),
        timestamp: 't',
      },
    ],
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

describe('findLoginForm', () => {
  it('extracts action, method, fields, and CSRF token from a standard login form', () => {
    const html = `
      <!doctype html>
      <html><body>
        <form method="post" action="/api/login">
          <input type="hidden" name="csrf_token" value="abc123">
          <input type="email" name="email" required>
          <input type="password" name="password" required>
          <button type="submit">Sign in</button>
        </form>
      </body></html>
    `;
    const form = findLoginForm(flowWithHtml('https://app/login', html));
    expect(form).toBeDefined();
    expect(form?.action).toBe('/api/login');
    expect(form?.method).toBe('POST');
    expect(form?.usernameFieldName).toBe('email');
    expect(form?.passwordFieldName).toBe('password');
    expect(form?.csrfField?.name).toBe('csrf_token');
    expect(form?.csrfField?.value).toBe('abc123');
  });

  it('detects Rails-style authenticity_token', () => {
    const html = `
      <form method="post" action="/login">
        <input type="hidden" name="authenticity_token" value="rails-token">
        <input type="text" name="user[email]">
        <input type="password" name="user[password]">
      </form>
    `;
    const form = findLoginForm(flowWithHtml('https://app/login', html));
    expect(form?.csrfField?.name).toBe('authenticity_token');
  });

  it('returns undefined if no password input present', () => {
    const html = '<form><input name="search"><button>Go</button></form>';
    const form = findLoginForm(flowWithHtml('https://app/', html));
    expect(form).toBeUndefined();
  });

  it('handles single-quoted and unquoted attribute values', () => {
    const html = `
      <form method=post action='/login'>
        <input type=hidden name=csrf value=xyz>
        <input type=password name=pwd>
      </form>
    `;
    const form = findLoginForm(flowWithHtml('https://app/login', html));
    expect(form?.action).toBe('/login');
    expect(form?.method).toBe('POST');
    expect(form?.csrfField?.name).toBe('csrf');
  });
});

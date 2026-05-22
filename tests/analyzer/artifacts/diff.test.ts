import { describe, expect, it } from 'vitest';
import { toSensitiveValue } from '@/core';
import { diffCookies, diffStorage } from '@/analyzer/artifacts/diff';
import { makeCookie } from '../test-helpers.js';

describe('diffCookies', () => {
  it('detects added cookies', () => {
    const after = [makeCookie({ name: 'session', httpOnly: true })];
    const diff = diffCookies([], after);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]?.name).toBe('session');
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });

  it('detects removed cookies', () => {
    const before = [makeCookie({ name: 'old' })];
    const diff = diffCookies(before, []);
    expect(diff.removed).toHaveLength(1);
  });

  it('detects changed cookie values', () => {
    const before = [
      makeCookie({
        name: 'session',
        value: toSensitiveValue('session', 'oldSessionValue123'),
      }),
    ];
    const after = [
      makeCookie({
        name: 'session',
        value: toSensitiveValue('session', 'newSessionValue456'),
      }),
    ];
    const diff = diffCookies(before, after);
    expect(diff.changed).toHaveLength(1);
    expect(diff.added).toHaveLength(0);
  });

  it('detects changed cookie flags even with identical masked prefix', () => {
    const value = toSensitiveValue('session', 'sameMaskedPrefixValue');
    const before = [makeCookie({ name: 'session', value, httpOnly: false })];
    const after = [makeCookie({ name: 'session', value, httpOnly: true })];
    const diff = diffCookies(before, after);
    expect(diff.changed).toHaveLength(1);
  });

  it('treats different domain+name as separate cookies', () => {
    const before = [makeCookie({ name: 's', domain: 'a.com' })];
    const after = [makeCookie({ name: 's', domain: 'b.com' })];
    const diff = diffCookies(before, after);
    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(1);
  });
});

describe('diffStorage', () => {
  it('detects added entries', () => {
    const diff = diffStorage(
      { localStorage: [], sessionStorage: [] },
      {
        localStorage: [{ key: 'tok', value: toSensitiveValue('tok', 'x') }],
        sessionStorage: [],
      },
    );
    expect(diff.localStorage.added).toHaveLength(1);
  });

  it('detects changed entries', () => {
    const diff = diffStorage(
      {
        localStorage: [{ key: 'k', value: toSensitiveValue('k', 'a') }],
        sessionStorage: [],
      },
      {
        localStorage: [{ key: 'k', value: toSensitiveValue('k', 'b') }],
        sessionStorage: [],
      },
    );
    expect(diff.localStorage.changed).toHaveLength(1);
  });
});

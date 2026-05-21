import { describe, expect, it } from 'vitest';
import {
  classifySensitivity,
  DEFAULT_MASKING_POLICY,
  extractTokenFromAuthHeader,
  isSensitiveKey,
  looksLikeJwt,
  maskBodyText,
  maskHeaders,
  maskString,
  toSensitiveValue,
} from '@/core/masking/policy';

describe('isSensitiveKey', () => {
  it('detects exact match', () => {
    expect(isSensitiveKey('password')).toBe(true);
    expect(isSensitiveKey('Authorization')).toBe(true);
    expect(isSensitiveKey('set-cookie')).toBe(true);
  });

  it('detects partial match', () => {
    expect(isSensitiveKey('x-csrf-token')).toBe(true);
    expect(isSensitiveKey('session_id')).toBe(true);
    expect(isSensitiveKey('AccessToken')).toBe(true);
  });

  it('returns false for non-sensitive keys', () => {
    expect(isSensitiveKey('user-agent')).toBe(false);
    expect(isSensitiveKey('content-type')).toBe(false);
    expect(isSensitiveKey('accept')).toBe(false);
  });

  it('respects extraKeys from policy', () => {
    expect(
      isSensitiveKey('x-tenant-secret', {
        ...DEFAULT_MASKING_POLICY,
        extraKeys: new Set(['x-tenant-secret']),
      }),
    ).toBe(true);
  });
});

describe('maskString', () => {
  it('returns dots for very short strings', () => {
    expect(maskString('abc')).toBe('•••');
  });

  it('keeps prefix and dots for longer strings', () => {
    const masked = maskString('eyJhbGciOiJIUzI1NiJ9.payload.sig');
    expect(masked.startsWith('eyJh')).toBe(true);
    expect(masked.length).toBeGreaterThan(4);
    expect(masked).not.toContain('payload');
  });

  it('returns empty string for empty input', () => {
    expect(maskString('')).toBe('');
  });
});

describe('looksLikeJwt', () => {
  it('detects JWT-shaped tokens', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(looksLikeJwt(jwt)).toBe(true);
  });

  it('rejects non-JWT strings', () => {
    expect(looksLikeJwt('not a jwt')).toBe(false);
    expect(looksLikeJwt('abc.def')).toBe(false);
    expect(looksLikeJwt('')).toBe(false);
  });
});

describe('extractTokenFromAuthHeader', () => {
  it('extracts Bearer token', () => {
    expect(extractTokenFromAuthHeader('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('returns undefined for plain values', () => {
    expect(extractTokenFromAuthHeader('no scheme')).toBeUndefined();
  });
});

describe('classifySensitivity', () => {
  it('classifies password as high', () => {
    expect(classifySensitivity('password', 'hunter2')).toBe('high');
  });
  it('classifies JWT-shaped value as high', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig';
    expect(classifySensitivity('data', jwt)).toBe('high');
  });
  it('classifies plain field as none', () => {
    expect(classifySensitivity('email', 'a@b.com')).toBe('none');
  });
});

describe('toSensitiveValue', () => {
  it('masks password-like keys', () => {
    const v = toSensitiveValue('password', 'hunter22');
    expect(v.masked).not.toContain('hunter');
    expect(v.raw).toBeUndefined();
    expect(v.sensitivity).toBe('high');
  });

  it('preserves non-sensitive values', () => {
    const v = toSensitiveValue('content-type', 'application/json');
    expect(v.masked).toBe('application/json');
    expect(v.raw).toBe('application/json');
    expect(v.sensitivity).toBe('none');
  });

  it('stores raw when policy.revealRaw=true', () => {
    const v = toSensitiveValue('token', 'abc', {
      ...DEFAULT_MASKING_POLICY,
      revealRaw: true,
    });
    expect(v.raw).toBe('abc');
  });
});

describe('maskHeaders', () => {
  it('masks Authorization header', () => {
    const result = maskHeaders({
      authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
      'content-type': 'application/json',
    });
    expect(result['authorization']?.masked).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(result['content-type']?.masked).toBe('application/json');
  });

  it('handles array values (e.g. set-cookie)', () => {
    const result = maskHeaders({
      'set-cookie': ['session=abc123def', 'csrf=xyz789'],
    });
    expect(result['set-cookie']?.masked).not.toContain('abc123def');
    expect(result['set-cookie']?.sensitivity).toBe('high');
  });

  it('skips undefined values', () => {
    const result = maskHeaders({
      authorization: undefined,
      accept: 'text/html',
    });
    expect(result['authorization']).toBeUndefined();
    expect(result['accept']?.masked).toBe('text/html');
  });
});

describe('maskBodyText', () => {
  it('redacts password field in JSON body', () => {
    const body = JSON.stringify({ email: 'a@b.com', password: 'hunter22' });
    const result = maskBodyText(body);
    expect(result.masked).toContain('a@b.com');
    expect(result.masked).not.toContain('hunter22');
    expect(result.sensitivity).toBe('high');
  });

  it('redacts password in form-urlencoded body', () => {
    const result = maskBodyText('email=a%40b.com&password=hunter22');
    expect(result.masked).not.toContain('hunter22');
    expect(result.masked).toContain('email=a%40b.com');
  });

  it('returns body as-is when not sensitive', () => {
    const result = maskBodyText('hello world');
    expect(result.masked).toBe('hello world');
    expect(result.sensitivity).toBe('none');
  });

  it('handles empty body', () => {
    const result = maskBodyText('');
    expect(result.masked).toBe('');
  });

  it('masks JWT-shaped body', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature';
    const result = maskBodyText(jwt);
    expect(result.masked).not.toBe(jwt);
    expect(result.sensitivity).toBe('high');
  });
});

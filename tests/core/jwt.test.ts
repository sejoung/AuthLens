import { describe, expect, it } from 'vitest';
import { decodeJwt, extractJwtCandidates } from '@/core/jwt';

/**
 * Helper to build a JWT for tests. Signature is fake (we never verify).
 */
function makeJwt(header: Record<string, unknown>, payload: Record<string, unknown>): string {
  const b64 = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj), 'utf8')
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  return `${b64(header)}.${b64(payload)}.fakeSignatureValueHere`;
}

describe('decodeJwt', () => {
  it('returns undefined for non-JWT strings', () => {
    expect(decodeJwt('not.a.jwt')).toBeUndefined();
    expect(decodeJwt('')).toBeUndefined();
    expect(decodeJwt('eyJh')).toBeUndefined();
  });

  it('decodes a well-formed token and extracts standard claims', () => {
    const iat = 1700000000;
    const exp = iat + 3600;
    const token = makeJwt(
      { alg: 'HS256', typ: 'JWT' },
      { sub: 'user-42', email: 'a@b.com', iat, exp, iss: 'https://idp.example.com' },
    );
    const decoded = decodeJwt(token)!;
    expect(decoded.algorithm).toBe('HS256');
    expect(decoded.header.typ).toBe('JWT');
    expect(decoded.payload.sub).toBe('user-42');
    expect(decoded.issuedAt?.getTime()).toBe(iat * 1000);
    expect(decoded.expiresAt?.getTime()).toBe(exp * 1000);
    expect(decoded.expired).toBe(true); // 2026 > 2023
  });

  it('marks not-yet-expired tokens correctly', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = makeJwt({ alg: 'HS256' }, { sub: 'x', exp });
    expect(decodeJwt(token)!.expired).toBe(false);
  });

  it('exposes both masked preview and raw signature', () => {
    const token = makeJwt({ alg: 'HS256' }, { sub: 'x' });
    const decoded = decodeJwt(token)!;
    expect(decoded.signaturePreview).not.toBe('fakeSignatureValueHere');
    expect(decoded.signaturePreview.startsWith('fake')).toBe(true);
    // Raw signature available for callers that opt in
    expect(decoded.signature).toBe('fakeSignatureValueHere');
  });

  it('returns undefined when header is not a JSON object', () => {
    // base64('"string"') is still valid base64 but not an object
    const b64 = Buffer.from('"just a string"', 'utf8').toString('base64').replace(/=+$/, '');
    const token = `${b64}.${b64}.sig123abc`;
    expect(decodeJwt(token)).toBeUndefined();
  });
});

describe('extractJwtCandidates', () => {
  it('returns [] for empty or non-matching input', () => {
    expect(extractJwtCandidates('')).toEqual([]);
    expect(extractJwtCandidates('no token here')).toEqual([]);
  });

  it('finds JWT-shaped substrings embedded in JSON', () => {
    const token = makeJwt({ alg: 'HS256' }, { sub: 'x' });
    const body = JSON.stringify({ access_token: token, token_type: 'Bearer' });
    const found = extractJwtCandidates(body);
    expect(found).toContain(token);
  });

  it('does not match non-JWT base64 sequences', () => {
    const body = 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIj8+';
    expect(extractJwtCandidates(body)).toEqual([]);
  });
});

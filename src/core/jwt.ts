/**
 * JWT decoder — no signature verification, no external dependencies.
 *
 * AuthLens는 토큰의 claims를 인증 흐름 이해를 위해 보여줄 뿐, 검증하지 않는다.
 * (검증은 발급자 secret/공개키가 필요하고 우리 책임 영역이 아님.)
 */

import { looksLikeJwt } from './masking/policy.js';

export type JwtClaims = Record<string, unknown>;

export type DecodedJwt = {
  /** `header.payload.signature` 원문 그대로. */
  raw: string;
  header: JwtClaims;
  payload: JwtClaims;
  /** signature는 항상 마스킹된 형태로만 노출 (보안적으로 민감). */
  signaturePreview: string;
  /** payload.exp가 있으면 Date로 변환. 없으면 undefined. */
  expiresAt?: Date;
  /** payload.iat가 있으면 Date로 변환. */
  issuedAt?: Date;
  /** payload.nbf가 있으면 Date로 변환. */
  notBefore?: Date;
  /** 현재 시각 기준 만료 여부. exp가 없으면 undefined. */
  expired?: boolean;
  /** header.alg 가 있으면 추출. */
  algorithm?: string;
};

export function decodeJwt(token: string): DecodedJwt | undefined {
  if (!looksLikeJwt(token)) return undefined;
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  const [h, p, s] = parts;
  let header: JwtClaims;
  let payload: JwtClaims;
  try {
    header = JSON.parse(base64UrlDecode(h!));
    payload = JSON.parse(base64UrlDecode(p!));
  } catch {
    return undefined;
  }
  if (header === null || typeof header !== 'object' || Array.isArray(header)) return undefined;
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return undefined;

  const result: DecodedJwt = {
    raw: token,
    header,
    payload,
    signaturePreview: signaturePreview(s!),
  };

  if (typeof header.alg === 'string') result.algorithm = header.alg;
  if (typeof payload.exp === 'number') {
    result.expiresAt = new Date(payload.exp * 1000);
    result.expired = Date.now() > payload.exp * 1000;
  }
  if (typeof payload.iat === 'number') result.issuedAt = new Date(payload.iat * 1000);
  if (typeof payload.nbf === 'number') result.notBefore = new Date(payload.nbf * 1000);

  return result;
}

function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (b64.length % 4)) % 4;
  const padded = b64 + '='.repeat(pad);
  // Browser path
  if (typeof atob === 'function') {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }
  // Node path
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Buf = (globalThis as any).Buffer;
  if (Buf) return Buf.from(padded, 'base64').toString('utf8');
  throw new Error('No base64 decoder available');
}

function signaturePreview(sig: string): string {
  if (sig.length <= 4) return '•'.repeat(sig.length);
  return sig.slice(0, 4) + '•'.repeat(Math.min(12, sig.length - 4));
}

/**
 * 자유 텍스트에서 JWT-모양 substring들을 추출.
 * 응답 body나 storage 값 안에 박혀있는 토큰을 찾을 때 사용.
 */
export function extractJwtCandidates(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g);
  if (!matches) return [];
  const out: string[] = [];
  for (const m of matches) {
    if (looksLikeJwt(m)) out.push(m);
  }
  return out;
}

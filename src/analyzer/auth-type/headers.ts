/**
 * Authorization 헤더 분류 (Bearer / Basic / 그 외).
 *
 * 헤더 값은 마스킹되어 있을 수 있다 — `Authorization: Bearer eyJh...` 가
 * `Bear••••••••` 형태가 됨. 첫 4자(`Bear`/`Basi`)는 prefix-preserve 정책 덕에
 * 마스킹된 값에서도 식별 가능.
 */

import type { HeaderMap, SensitiveValue } from '@/core';

export type AuthScheme = 'bearer' | 'basic' | 'other';

export function authScheme(value: SensitiveValue): AuthScheme {
  // raw가 있으면 정확히 판정
  const raw = value.raw;
  if (raw) {
    if (/^bearer\b/i.test(raw)) return 'bearer';
    if (/^basic\b/i.test(raw)) return 'basic';
    return 'other';
  }
  // raw가 없을 때는 masked의 prefix(4글자)로 판정
  const m = value.masked;
  if (/^bear/i.test(m)) return 'bearer';
  if (/^basi/i.test(m)) return 'basic';
  return 'other';
}

export function findAuthorizationHeader(headers: HeaderMap): SensitiveValue | undefined {
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'authorization') return v;
  }
  return undefined;
}

/**
 * Basic 헤더에서 base64 디코드해 `{ username, password }` 반환.
 * raw가 없거나 디코드 실패 시 undefined.
 * 호출자가 표시 여부를 결정한다 — analyzer 계층은 데이터만 노출.
 */
export function decodeBasicCredentials(
  value: SensitiveValue,
): { username: string; password: string } | undefined {
  const raw = value.raw;
  if (!raw) return undefined;
  const match = /^basic\s+(\S+)/i.exec(raw);
  if (!match) return undefined;
  const b64 = match[1]!;
  try {
    const g = globalThis as { atob?: (s: string) => string };
    let decoded: string;
    if (g.atob) {
      decoded = g.atob(b64);
    } else {
      const bufCtor = (globalThis as { Buffer?: { from: (s: string, e: string) => { toString: (e: string) => string } } })
        .Buffer;
      if (!bufCtor) return undefined;
      decoded = bufCtor.from(b64, 'base64').toString('utf8');
    }
    const colon = decoded.indexOf(':');
    if (colon < 0) return undefined;
    return { username: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
  } catch {
    return undefined;
  }
}

/** 호환용 — username만 필요할 때. */
export function decodeBasicUsername(value: SensitiveValue): string | undefined {
  return decodeBasicCredentials(value)?.username;
}

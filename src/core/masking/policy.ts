import {
  MASK_PREVIEW_LENGTH,
  SENSITIVE_KEY_SET,
} from '../constants.js';
import type {
  HeaderMap,
  Sensitivity,
  SensitiveValue,
} from '../types/sensitive.js';

export type MaskingPolicy = {
  /** UI/export에서 raw 값을 노출할지 여부. 기본 false. */
  revealRaw: boolean;
  /** mask prefix 길이 (앞에서 몇 글자를 보여줄지). 기본 4. */
  previewLength: number;
  /** 추가로 마스킹할 키 (lowercase). */
  extraKeys: ReadonlySet<string>;
};

export const DEFAULT_MASKING_POLICY: MaskingPolicy = {
  revealRaw: false,
  previewLength: MASK_PREVIEW_LENGTH,
  extraKeys: new Set(),
};

export function withDefaultPolicy(
  partial?: Partial<MaskingPolicy>,
): MaskingPolicy {
  if (!partial) return DEFAULT_MASKING_POLICY;
  return {
    revealRaw: partial.revealRaw ?? DEFAULT_MASKING_POLICY.revealRaw,
    previewLength:
      partial.previewLength ?? DEFAULT_MASKING_POLICY.previewLength,
    extraKeys: partial.extraKeys ?? DEFAULT_MASKING_POLICY.extraKeys,
  };
}

/**
 * key 이름이 민감 정보인지 판단. 대소문자 무시.
 */
export function isSensitiveKey(
  key: string,
  policy: MaskingPolicy = DEFAULT_MASKING_POLICY,
): boolean {
  const lower = key.toLowerCase();
  if (SENSITIVE_KEY_SET.has(lower)) return true;
  if (policy.extraKeys.has(lower)) return true;
  // partial match: e.g. "x-csrf-token", "session_id"
  for (const sensitive of SENSITIVE_KEY_SET) {
    if (lower.includes(sensitive)) return true;
  }
  for (const sensitive of policy.extraKeys) {
    if (lower.includes(sensitive)) return true;
  }
  return false;
}

/**
 * 문자열을 마스킹된 형태로 변환.
 *   "eyJhbGciOiJIUzI1NiJ9.payload.sig" → "eyJh••••••••••••"
 */
export function maskString(
  raw: string,
  policy: MaskingPolicy = DEFAULT_MASKING_POLICY,
): string {
  if (!raw) return '';
  const preview = policy.previewLength;
  if (raw.length <= preview) {
    return '•'.repeat(raw.length);
  }
  return raw.slice(0, preview) + '•'.repeat(Math.min(12, raw.length - preview));
}

/**
 * 값이 JWT 형태인지 검사.
 *   header.payload.signature 형태로 base64url 3등분.
 */
export function looksLikeJwt(value: string): boolean {
  if (!value || value.length < 20) return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const base64url = /^[A-Za-z0-9_-]+$/;
  return parts.every((p) => p.length > 0 && base64url.test(p));
}

/**
 * Bearer/Basic 등 인증 헤더에서 토큰 부분만 추출.
 */
export function extractTokenFromAuthHeader(value: string): string | undefined {
  const match = value.match(/^(?:Bearer|Token|Basic)\s+(.+)$/i);
  return match ? match[1] : undefined;
}

export function classifySensitivity(key: string, value: string): Sensitivity {
  const lower = key.toLowerCase();
  if (lower.includes('password') || lower === 'authorization') return 'high';
  if (
    lower.includes('token') ||
    lower.includes('cookie') ||
    lower.includes('session') ||
    lower.includes('csrf') ||
    lower.includes('xsrf')
  ) {
    return 'high';
  }
  if (looksLikeJwt(value)) return 'high';
  return 'none';
}

/**
 * key/value pair를 SensitiveValue로 변환.
 * 민감하지 않은 경우 raw가 masked와 동일하게 저장됨.
 */
export function toSensitiveValue(
  key: string,
  value: string,
  policy: MaskingPolicy = DEFAULT_MASKING_POLICY,
): SensitiveValue {
  const sensitivity = classifySensitivity(key, value);
  if (sensitivity === 'none' && !isSensitiveKey(key, policy)) {
    return {
      masked: value,
      raw: value,
      sensitivity: 'none',
    };
  }
  const masked = maskString(value, policy);
  return {
    masked,
    // raw는 policy.revealRaw일 때만 저장. 기본은 미저장.
    raw: policy.revealRaw ? value : undefined,
    sensitivity: sensitivity === 'none' ? 'medium' : sensitivity,
    reason: `key "${key}" matched sensitive pattern`,
  };
}

/**
 * 헤더 객체 전체를 마스킹된 HeaderMap으로 변환.
 */
export function maskHeaders(
  headers: Record<string, string | string[] | undefined>,
  policy: MaskingPolicy = DEFAULT_MASKING_POLICY,
): HeaderMap {
  const result: HeaderMap = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const flat = Array.isArray(value) ? value.join(', ') : value;
    result[key] = toSensitiveValue(key, flat, policy);
  }
  return result;
}

/**
 * URL-encoded form body 또는 JSON body에서 민감 필드를 마스킹.
 * body 형태를 정확히 모르는 경우 raw text에 대해 휴리스틱 마스킹 수행.
 */
export function maskBodyText(
  raw: string,
  policy: MaskingPolicy = DEFAULT_MASKING_POLICY,
): SensitiveValue {
  if (!raw) {
    return { masked: '', raw: '', sensitivity: 'none' };
  }

  // JSON 파싱 시도
  try {
    const parsed = JSON.parse(raw);
    const redacted = redactJsonValue(parsed, policy);
    return {
      masked: JSON.stringify(redacted),
      raw: policy.revealRaw ? raw : undefined,
      sensitivity: hasSensitiveSubstring(raw) ? 'high' : 'low',
    };
  } catch {
    // not JSON
  }

  // form-urlencoded 처리
  if (raw.includes('=') && !raw.includes('\n')) {
    const masked = raw
      .split('&')
      .map((pair) => {
        const eq = pair.indexOf('=');
        if (eq === -1) return pair;
        const key = pair.slice(0, eq);
        const value = pair.slice(eq + 1);
        const decodedKey = decodeURIComponent(key);
        if (isSensitiveKey(decodedKey, policy)) {
          return `${key}=${maskString(decodeURIComponent(value), policy)}`;
        }
        return pair;
      })
      .join('&');
    return {
      masked,
      raw: policy.revealRaw ? raw : undefined,
      sensitivity: hasSensitiveSubstring(raw) ? 'high' : 'low',
    };
  }

  // 그 외: JWT 형태 또는 토큰 형태 휴리스틱
  if (looksLikeJwt(raw.trim())) {
    return {
      masked: maskString(raw, policy),
      raw: policy.revealRaw ? raw : undefined,
      sensitivity: 'high',
    };
  }

  return {
    masked: raw,
    raw,
    sensitivity: 'none',
  };
}

function redactJsonValue(
  value: unknown,
  policy: MaskingPolicy,
): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactJsonValue(v, policy));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k, policy) && typeof v === 'string') {
        out[k] = maskString(v, policy);
      } else {
        out[k] = redactJsonValue(v, policy);
      }
    }
    return out;
  }
  if (typeof value === 'string' && looksLikeJwt(value)) {
    return maskString(value, policy);
  }
  return value;
}

function hasSensitiveSubstring(raw: string): boolean {
  const lower = raw.toLowerCase();
  for (const key of SENSITIVE_KEY_SET) {
    if (lower.includes(key)) return true;
  }
  return false;
}

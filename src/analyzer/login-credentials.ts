/**
 * Login 요청에서 어떻게 credentials가 전달되는지 분석.
 *
 * 다음 패턴을 식별한다:
 *   1. `Authorization: Basic <base64>`  → username만 디코드
 *   2. `Authorization: Bearer <token>`  → JWT 여부 + 길이
 *   3. Request body (JSON/form-urlencoded)에 username·password 필드
 *
 * 비밀번호는 절대 반환·노출하지 않는다 — 필드 이름만 보고한다.
 */

import { looksLikeJwt, type RequestRecord, type SensitiveValue } from '@/core';
import {
  authScheme,
  decodeBasicCredentials,
  decodeBasicUsername,
  findAuthorizationHeader,
} from './auth-headers.js';

export type LoginCredentials = {
  /** Authorization 헤더 scheme (있을 때) */
  scheme?: 'basic' | 'bearer';
  /** Basic auth username (raw 가능할 때만) */
  basicUsername?: string;
  /**
   * Basic auth password (raw 가능할 때만).
   * UI/Reporter는 사용자가 명시적으로 reveal 토글을 켰을 때만 표시한다.
   */
  basicPassword?: string;
  /** Bearer token 길이 */
  bearerTokenLength?: number;
  /** Bearer가 JWT shape인지 */
  bearerIsJwt?: boolean;
  /** Bearer token raw (revealRaw일 때만 헤더에 살아있음) */
  bearerToken?: string;
  /** body format 식별 */
  bodyFormat?: 'json' | 'form' | 'other';
  /** body에서 발견된 username-like 필드 이름 */
  usernameField?: string;
  /** 그 필드의 값 (raw 가능할 때만) */
  usernameValue?: string;
  /** body에서 발견된 password-like 필드 이름 */
  passwordField?: string;
  /**
   * password 필드의 값 (raw 가능할 때만).
   * 표시 여부는 UI/Reporter 호출자가 결정한다 — analyzer는 데이터만 노출.
   */
  passwordValue?: string;
};

const USERNAME_KEYS = [
  'email',
  'username',
  'user',
  'login',
  'userid',
  'user_id',
  'account',
  'id',
  'name',
];
const PASSWORD_KEYS = ['password', 'passwd', 'pwd', 'pass', 'secret'];

export function analyzeLoginCredentials(req: RequestRecord): LoginCredentials {
  const result: LoginCredentials = {};

  // Authorization 헤더
  const auth = findAuthorizationHeader(req.headers);
  if (auth) {
    const scheme = authScheme(auth);
    if (scheme === 'basic') {
      result.scheme = 'basic';
      const decoded = decodeBasicCredentials(auth);
      if (decoded) {
        result.basicUsername = decoded.username;
        result.basicPassword = decoded.password;
      } else {
        result.basicUsername = decodeBasicUsername(auth);
      }
    } else if (scheme === 'bearer') {
      result.scheme = 'bearer';
      if (auth.raw) {
        const token = auth.raw.replace(/^Bearer\s+/i, '');
        result.bearerTokenLength = token.length;
        result.bearerIsJwt = looksLikeJwt(token);
        result.bearerToken = token;
      }
    }
  }

  // 요청 body — JSON / form 둘 다 시도
  if (req.postData) {
    parseBodyCredentials(req.postData, result);
  }

  return result;
}

function parseBodyCredentials(body: SensitiveValue, out: LoginCredentials): void {
  // raw가 있으면 정확히, 없으면 masked에서 필드명만 추출.
  const text = body.raw ?? body.masked;
  if (!text) return;

  // JSON 시도
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      out.bodyFormat = 'json';
      for (const [k, v] of Object.entries(parsed)) {
        const lower = k.toLowerCase();
        if (USERNAME_KEYS.includes(lower) && typeof v === 'string') {
          out.usernameField = k;
          if (body.raw) out.usernameValue = v;
        } else if (PASSWORD_KEYS.includes(lower) && typeof v === 'string') {
          out.passwordField = k;
          if (body.raw) out.passwordValue = v;
        }
      }
      return;
    }
  } catch {
    /* not JSON */
  }

  // form-urlencoded
  if (/^[A-Za-z_][\w.+%-]*=/.test(text)) {
    out.bodyFormat = 'form';
    try {
      const params = new URLSearchParams(text);
      for (const [k, v] of params.entries()) {
        const lower = k.toLowerCase();
        if (USERNAME_KEYS.includes(lower)) {
          out.usernameField = k;
          if (body.raw) out.usernameValue = v;
        } else if (PASSWORD_KEYS.includes(lower)) {
          out.passwordField = k;
          if (body.raw) out.passwordValue = v;
        }
      }
    } catch {
      /* malformed */
    }
    return;
  }

  out.bodyFormat = 'other';
}

export function hasAnyCredential(c: LoginCredentials): boolean {
  return !!(c.scheme || c.usernameField || c.passwordField);
}

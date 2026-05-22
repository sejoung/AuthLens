/**
 * Best-practice baseline checks across an AuthFlow.
 *
 * Each check has:
 *   - a stable `code` (used by grading & comparison)
 *   - observed vs recommended values where applicable
 *   - a level (info / warning / danger)
 *
 * These are intentionally conservative: only fire when the observation is
 * unambiguous (e.g. a cookie's `httpOnly` flag is literally false in the
 * Set-Cookie header). We don't guess — false-positive findings erode trust.
 */

import type { AuthFlow, CookieSnapshot, DecodedJwt } from '@/core';
import { decodeJwt } from '@/core';
import { findJwts } from '../auth-type/jwt-locations.js';

export type BaselineCategory = 'cookie' | 'jwt' | 'storage' | 'transport';

export type BaselineCheck = {
  code: string;
  category: BaselineCategory;
  level: 'info' | 'warning' | 'danger';
  message: string;
  observed?: string;
  recommended?: string;
};

/**
 * Cookies whose name pattern suggests they carry session / auth state.
 * Used so we apply HttpOnly/Secure/SameSite checks only where it actually
 * matters — analytics or A/B test cookies don't need HttpOnly.
 */
const AUTH_COOKIE_PATTERNS = [
  /sess/i,
  /sid$/i,
  /auth/i,
  /token/i,
  /jwt/i,
  /xsrf/i,
  /csrf/i,
  /^_?id$/i,
];

function looksAuthCookie(name: string, httpOnly: boolean): boolean {
  if (httpOnly) return true;
  return AUTH_COOKIE_PATTERNS.some((p) => p.test(name));
}

export function runBaselineChecks(flow: AuthFlow): BaselineCheck[] {
  const out: BaselineCheck[] = [];
  out.push(...checkCookies(flow.cookiesAfter));
  out.push(...checkJwts(flow));
  out.push(...checkStorage(flow));
  return out;
}

function checkCookies(cookies: CookieSnapshot[]): BaselineCheck[] {
  const out: BaselineCheck[] = [];
  const authCookies = cookies.filter((c) => looksAuthCookie(c.name, c.httpOnly));
  if (authCookies.length === 0) return out;

  for (const c of authCookies) {
    if (!c.httpOnly) {
      out.push({
        code: 'cookie.missing-httponly',
        category: 'cookie',
        level: 'danger',
        message: `Auth-looking cookie \`${c.name}\` is missing HttpOnly. JavaScript can read it, so XSS becomes session theft.`,
        observed: 'HttpOnly=false',
        recommended: 'HttpOnly=true',
      });
    }
    if (!c.secure) {
      out.push({
        code: 'cookie.missing-secure',
        category: 'cookie',
        level: 'warning',
        message: `Auth-looking cookie \`${c.name}\` is missing Secure. It can leak over plaintext http.`,
        observed: 'Secure=false',
        recommended: 'Secure=true',
      });
    }
    if (!c.sameSite) {
      out.push({
        code: 'cookie.missing-samesite',
        category: 'cookie',
        level: 'info',
        message: `Auth-looking cookie \`${c.name}\` has no SameSite directive. Browsers default to Lax but explicit is better.`,
        observed: 'SameSite=<none specified>',
        recommended: 'SameSite=Lax or Strict',
      });
    } else if (c.sameSite === 'None' && !c.secure) {
      out.push({
        code: 'cookie.samesite-none-without-secure',
        category: 'cookie',
        level: 'danger',
        message: `Cookie \`${c.name}\` uses SameSite=None without Secure. Modern browsers reject this combination.`,
        observed: 'SameSite=None, Secure=false',
        recommended: 'Secure=true (when SameSite=None)',
      });
    }
  }
  return dedupe(out);
}

function checkJwts(flow: AuthFlow): BaselineCheck[] {
  const out: BaselineCheck[] = [];
  const locations = findJwts(flow);
  if (locations.length === 0) return out;

  for (const loc of locations) {
    const d = loc.decoded;
    out.push(...checkSingleJwt(d, loc.label, loc.source));
  }
  return dedupe(out);
}

function checkSingleJwt(d: DecodedJwt, label: string, source: string): BaselineCheck[] {
  const out: BaselineCheck[] = [];
  const alg = (d.algorithm ?? '').toLowerCase();
  if (alg === 'none') {
    out.push({
      code: 'jwt.alg-none',
      category: 'jwt',
      level: 'danger',
      message: `JWT at ${source}:${label} uses alg=none (signature stripped). Any caller can forge tokens.`,
      observed: 'alg=none',
      recommended: 'alg=RS256/ES256/EdDSA (or HS256 with rotated secret)',
    });
  }
  if (d.expiresAt == null) {
    out.push({
      code: 'jwt.no-exp',
      category: 'jwt',
      level: 'warning',
      message: `JWT at ${source}:${label} has no \`exp\` claim — token cannot expire.`,
      observed: 'exp=<missing>',
      recommended: 'short-lived `exp` (minutes for access tokens)',
    });
  } else {
    const lifetimeSec = (d.expiresAt.getTime() - (d.issuedAt?.getTime() ?? Date.now())) / 1000;
    if (lifetimeSec > 24 * 60 * 60) {
      const hours = Math.round(lifetimeSec / 3600);
      out.push({
        code: 'jwt.long-lifetime',
        category: 'jwt',
        level: 'info',
        message: `JWT at ${source}:${label} has long lifetime (~${hours}h).`,
        observed: `${hours}h`,
        recommended: '< 1h for access tokens; rely on refresh',
      });
    }
  }
  if (d.expiresAt && d.expiresAt.getTime() < Date.now()) {
    out.push({
      code: 'jwt.expired',
      category: 'jwt',
      level: 'info',
      message: `JWT at ${source}:${label} is already expired in this capture.`,
    });
  }
  return out;
}

function checkStorage(flow: AuthFlow): BaselineCheck[] {
  const out: BaselineCheck[] = [];
  // Tokens in localStorage are accessible to any script on the origin —
  // including injected XSS payloads. sessionStorage is the same surface
  // (origin-scoped) but doesn't survive tab close, so we flag the bigger
  // risk on localStorage.
  const ls = flow.storageAfter.localStorage;
  for (const e of ls) {
    const raw = e.value.raw;
    if (!raw) continue;
    if (looksLikeTokenValue(raw)) {
      out.push({
        code: 'storage.token-in-localstorage',
        category: 'storage',
        level: 'warning',
        message: `Token-like value found in localStorage[\`${e.key}\`]. XSS = stolen token.`,
        observed: 'localStorage',
        recommended: 'HttpOnly cookie or in-memory only',
      });
    }
  }
  return dedupe(out);
}

function looksLikeTokenValue(raw: string): boolean {
  // Quick check: it's a JWT, or it's a long opaque random-looking string.
  const decoded = decodeJwt(raw);
  if (decoded) return true;
  return /^[A-Za-z0-9._-]{32,}$/.test(raw);
}

function dedupe(checks: BaselineCheck[]): BaselineCheck[] {
  const seen = new Set<string>();
  const out: BaselineCheck[] = [];
  for (const c of checks) {
    // Same code for different cookies is interesting — but same code+message
    // verbatim is duplicate noise.
    const key = `${c.code}|${c.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

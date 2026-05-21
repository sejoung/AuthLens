import { looksLikeJwt } from '@/core';
import type {
  AuthFlowSummary,
  AuthSignal,
  AuthType,
  ConfidenceLevel,
  CookieDiff,
  RequestRecord,
  ResponseRecord,
  SecurityNote,
  StorageDiff,
} from '@/core';
import { authScheme, findAuthorizationHeader } from './auth-headers.js';
import { looksLikeAuthorizeRequest, looksLikeTokenRequest } from './oauth-flow.js';

export type InferenceInput = {
  requests: RequestRecord[];
  responses: ResponseRecord[];
  cookieDiff: CookieDiff;
  storageDiff: StorageDiff;
  targetUrl: string;
  loginRequestId?: string;
};

export type InferenceResult = {
  authType: AuthType;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  signals: AuthSignal[];
  warnings: SecurityNote[];
};

/**
 * Cookie Session: HttpOnly cookie 추가 + 이후 요청에서 cookie 사용.
 */
function detectCookieSession(input: InferenceInput): AuthSignal[] {
  const signals: AuthSignal[] = [];
  const newHttpOnly = input.cookieDiff.added.filter((c) => c.httpOnly);
  if (newHttpOnly.length > 0) {
    signals.push({
      kind: 'cookie-session.httponly-added',
      description: `Session cookie added: ${newHttpOnly
        .map((c) => c.name)
        .join(', ')}`,
      weight: 40,
    });
  }
  const setCookieResponses = input.responses.filter((r) =>
    findHeader(r.headers, 'set-cookie'),
  );
  if (setCookieResponses.length > 0) {
    signals.push({
      kind: 'cookie-session.set-cookie',
      description: 'Set-Cookie observed in responses',
      weight: 25,
    });
  }
  return signals;
}

function detectJwt(input: InferenceInput): AuthSignal[] {
  const signals: AuthSignal[] = [];
  for (const req of input.requests) {
    const auth = findHeader(req.headers, 'authorization');
    if (auth?.masked && /bearer/i.test(auth.masked)) {
      signals.push({
        kind: 'jwt.bearer-header',
        description: 'Authorization: Bearer header used',
        weight: 35,
      });
      break;
    }
  }
  for (const res of input.responses) {
    if (res.bodyPreview?.masked && /access_token|id_token/i.test(res.bodyPreview.masked)) {
      signals.push({
        kind: 'jwt.token-in-response',
        description: 'access_token / id_token returned in response body',
        weight: 30,
      });
      break;
    }
  }
  for (const entry of [
    ...input.storageDiff.localStorage.added,
    ...input.storageDiff.sessionStorage.added,
    ...input.storageDiff.localStorage.changed.map((c) => c.after),
    ...input.storageDiff.sessionStorage.changed.map((c) => c.after),
  ]) {
    const key = entry.key.toLowerCase();
    if (key.includes('token') || looksLikeJwt(entry.value.masked)) {
      signals.push({
        kind: 'jwt.token-in-storage',
        description: `Token stored in ${
          key.includes('token') ? 'browser storage' : 'storage as JWT'
        }: ${entry.key}`,
        weight: 25,
      });
      break;
    }
  }
  return signals;
}

function detectCsrf(input: InferenceInput): AuthSignal[] {
  const signals: AuthSignal[] = [];
  for (const c of [...input.cookieDiff.added, ...input.cookieDiff.changed.map((c) => c.after)]) {
    const lower = c.name.toLowerCase();
    if (lower.includes('csrf') || lower.includes('xsrf')) {
      signals.push({
        kind: 'csrf.cookie-token',
        description: `CSRF token cookie detected: ${c.name}`,
        weight: 20,
      });
      break;
    }
  }
  for (const req of input.requests) {
    for (const [k] of Object.entries(req.headers)) {
      const lower = k.toLowerCase();
      if (lower.includes('csrf') || lower.includes('xsrf')) {
        signals.push({
          kind: 'csrf.header',
          description: `Request includes CSRF header: ${k}`,
          weight: 20,
        });
        return signals;
      }
    }
  }
  return signals;
}

function detectOAuthOidc(input: InferenceInput): AuthSignal[] {
  const signals: AuthSignal[] = [];

  for (const req of input.requests) {
    if (looksLikeAuthorizeRequest(req.url)) {
      signals.push({
        kind: 'oauth.authorize-endpoint',
        description: 'OAuth authorize endpoint observed (response_type + client_id)',
        weight: 35,
      });
    }
    if (req.method.toUpperCase() === 'POST') {
      const body = req.postData?.raw ?? req.postData?.masked ?? '';
      if (looksLikeTokenRequest(req.url, body)) {
        signals.push({
          kind: 'oauth.token-endpoint',
          description: 'POST to token endpoint (grant_type)',
          weight: 30,
        });
      }
    }
    // OAuth callback URL — weaker signal alone (could be just a redirect target).
    try {
      const u = new URL(req.url);
      if (u.searchParams.has('code') && u.searchParams.has('state')) {
        signals.push({
          kind: 'oauth.callback',
          description: 'OAuth callback (code + state) observed',
          weight: 15,
        });
      }
    } catch {
      /* ignore */
    }
  }

  // Bearer header usage — supports OAuth-style auth but isn't sufficient alone.
  for (const req of input.requests) {
    const auth = findAuthorizationHeader(req.headers);
    if (auth && authScheme(auth) === 'bearer') {
      signals.push({
        kind: 'oauth.bearer-usage',
        description: 'Bearer token used in Authorization header',
        weight: 10,
      });
      break;
    }
  }

  for (const res of input.responses) {
    if (res.bodyPreview?.masked && /id_token/i.test(res.bodyPreview.masked)) {
      signals.push({
        kind: 'oidc.id-token',
        description: 'id_token observed (OIDC indicator)',
        weight: 25,
      });
      break;
    }
  }
  return signals;
}

function detectHttpBasic(input: InferenceInput): AuthSignal[] {
  for (const req of input.requests) {
    const auth = findAuthorizationHeader(req.headers);
    if (auth && authScheme(auth) === 'basic') {
      return [
        {
          kind: 'http-basic.header',
          description: 'HTTP Basic Authorization header observed',
          weight: 50,
        },
      ];
    }
  }
  return [];
}

function detectSso(input: InferenceInput): AuthSignal[] {
  const signals: AuthSignal[] = [];
  const targetHost = safeHost(input.targetUrl);
  if (!targetHost) return signals;
  const externalHosts = new Set<string>();
  for (const req of input.requests) {
    const host = safeHost(req.url);
    if (host && !host.endsWith(targetHost) && !targetHost.endsWith(host)) {
      // 외부 도메인 호출. SSO 후보 도메인 키워드 매칭.
      if (
        /accounts\.|login\.|auth\.|idp\.|sso\./i.test(host) ||
        /\bsaml\b/i.test(req.url)
      ) {
        externalHosts.add(host);
      }
    }
  }
  if (externalHosts.size > 0) {
    signals.push({
      kind: 'sso.external-idp',
      description: `Cross-domain login flow via ${Array.from(externalHosts).join(', ')}`,
      weight: 30,
    });
  }
  return signals;
}

function findHeader<T extends { masked?: string }>(
  headers: Record<string, T>,
  name: string,
): T | undefined {
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) return v;
  }
  return undefined;
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return undefined;
  }
}

export function inferAuthType(input: InferenceInput): InferenceResult {
  const cookieSignals = detectCookieSession(input);
  const jwtSignals = detectJwt(input);
  const csrfSignals = detectCsrf(input);
  const oauthSignals = detectOAuthOidc(input);
  const ssoSignals = detectSso(input);
  const basicSignals = detectHttpBasic(input);

  const weightOf = (sigs: AuthSignal[]) =>
    sigs.reduce((acc, s) => acc + s.weight, 0);

  const oauthWeight = weightOf(oauthSignals);
  const ssoWeight = weightOf(ssoSignals);
  const cookieWeight = weightOf(cookieSignals);
  const jwtWeight = weightOf(jwtSignals);
  const basicWeight = weightOf(basicSignals);

  // Tighter OAuth check — require at least an authorize endpoint OR a token
  // exchange OR id_token. Bearer-usage alone is not enough to classify as OAuth
  // (could be any token-based API like personal access tokens).
  const hasStrongOAuthSignal = oauthSignals.some(
    (s) =>
      s.kind === 'oauth.authorize-endpoint' ||
      s.kind === 'oauth.token-endpoint' ||
      s.kind === 'oidc.id-token',
  );

  let authType: AuthType = 'unknown';
  let confidence = 0;
  // HTTP Basic > OIDC > OAuth > SSO > JWT > Cookie 우선순위
  if (basicWeight > 0) {
    authType = 'http-basic';
    confidence = basicWeight;
  } else if (oauthSignals.some((s) => s.kind === 'oidc.id-token')) {
    authType = 'oidc';
    confidence = oauthWeight + 10;
  } else if (hasStrongOAuthSignal && oauthWeight >= 35) {
    authType = 'oauth';
    confidence = oauthWeight;
  } else if (ssoWeight > 0 && (cookieWeight > 0 || jwtWeight > 0)) {
    authType = 'sso';
    confidence = ssoWeight + Math.max(cookieWeight, jwtWeight) / 2;
  } else if (jwtWeight > cookieWeight) {
    authType = 'jwt';
    confidence = jwtWeight;
  } else if (cookieWeight > 0) {
    authType = 'cookie-session';
    confidence = cookieWeight;
  }

  const signals = [
    ...cookieSignals,
    ...jwtSignals,
    ...csrfSignals,
    ...oauthSignals,
    ...ssoSignals,
    ...basicSignals,
  ];

  const warnings: SecurityNote[] = [];
  const insecureCookies = input.cookieDiff.added.filter(
    (c) => !c.secure && /session|auth|token/i.test(c.name),
  );
  if (insecureCookies.length > 0) {
    warnings.push({
      level: 'warning',
      message: `Session-like cookie set without Secure flag: ${insecureCookies
        .map((c) => c.name)
        .join(', ')}`,
    });
  }
  const noSameSite = input.cookieDiff.added.filter(
    (c) => !c.sameSite && /session|auth/i.test(c.name),
  );
  if (noSameSite.length > 0) {
    warnings.push({
      level: 'info',
      message: `Session-like cookie set without explicit SameSite: ${noSameSite
        .map((c) => c.name)
        .join(', ')}`,
    });
  }
  if (csrfSignals.length === 0 && authType === 'cookie-session') {
    warnings.push({
      level: 'info',
      message: 'No CSRF token signal detected with cookie-session flow.',
    });
  }

  const confidenceLevel: ConfidenceLevel =
    confidence >= 80 ? 'high' : confidence >= 50 ? 'medium' : 'low';

  return {
    authType,
    confidence: Math.min(100, confidence),
    confidenceLevel,
    signals,
    warnings,
  };
}

export function toFlowSummary(result: InferenceResult, loginRequestId?: string): AuthFlowSummary {
  return {
    authType: result.authType,
    confidence: result.confidence,
    confidenceLevel: result.confidenceLevel,
    loginRequestId,
    detectedSignals: result.signals,
    warnings: result.warnings,
  };
}

/**
 * OAuth/OIDC 흐름 메타데이터 추출.
 *
 * - authorize endpoint 호출에서 query 파라미터 분석 (PKCE, state, scope, …)
 * - token endpoint POST에서 요청 본문(grant_type 등) + 응답 본문(`expires_in`,
 *   `refresh_token`, `id_token` 등) 분석
 *
 * 토큰 자체의 raw 값은 가공하지 않는다 — JWT는 `findJwts`가 이미 따로 잡는다.
 */

import { looksLikeJwt, type AuthFlow } from '@/core';
import { authScheme, decodeBasicUsername, findAuthorizationHeader } from './headers.js';

export type OAuthAuthorizeRequest = {
  requestId: string;
  endpoint: string;
  responseType?: string;
  clientId?: string;
  redirectUri?: string;
  scope?: string;
  state?: string;
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  pkce: boolean;
};

export type OAuthTokenExchange = {
  requestId: string;
  endpoint: string;
  /** 요청 본문에서 추출 (`authorization_code`, `refresh_token`, `client_credentials` …) */
  grantType?: string;
  /** 요청에 포함된 client_id (헤더 Authorization 인증의 경우 추출 불가) */
  clientId?: string;
  /** 응답의 token_type (보통 'Bearer'). */
  tokenType?: string;
  /** 응답의 expires_in (초). */
  expiresInSeconds?: number;
  /** response timestamp + expires_in 으로 계산된 만료 시각. */
  expiresAt?: Date;
  /** 응답의 scope 문자열. */
  scope?: string;
  /** 요청 시 보낸 scope (authorize endpoint에서 따로 들어옴, 여기는 token 응답 기준). */
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  hasIdToken: boolean;
  /** 응답 status code. */
  status?: number;
};

export type OAuthCallback = {
  requestId: string;
  url: string;
  host: string;
  hasCode: boolean;
  hasState: boolean;
  hasError: boolean;
  errorCode?: string;
};

export type BearerUsage = {
  requestId: string;
  url: string;
  method: string;
  /** masked로만 판단했으면 (raw 없음) true. */
  inferredFromMaskOnly: boolean;
  /** raw가 있고 JWT 형태로 보이면 true. */
  tokenLooksLikeJwt: boolean;
};

export type BasicAuthUsage = {
  requestId: string;
  url: string;
  method: string;
  /** raw가 있을 때 decoded username (password는 절대 노출 안 함). */
  username?: string;
};

export type OAuthFlowInfo = {
  authorizeRequests: OAuthAuthorizeRequest[];
  tokenExchanges: OAuthTokenExchange[];
  callbacks: OAuthCallback[];
  bearerUsages: BearerUsage[];
  basicAuthUsages: BasicAuthUsage[];
};

// 표준 path 외에도 Google `/o/oauth2/v2/auth`, IdentityServer `/connect/authorize`,
// Microsoft `/login.srf` 등 다양한 변형이 있어 path-only 매칭은 누락이 잦다.
// 보조 신호: 표준 OAuth 파라미터 (response_type + client_id) 또는 grant_type 본문.
const AUTHORIZE_PATH_HINTS = [
  '/authorize',
  '/oauth/authorize',
  '/oauth2/authorize',
  '/connect/authorize',
  '/oauth2/v2/auth',
  '/o/oauth2/auth',
  '/o/oauth2/v2/auth',
];
const TOKEN_PATH_HINTS = [
  '/oauth/token',
  '/oauth2/token',
  '/token',
  '/connect/token',
  '/oauth2/v4/token',
  '/o/oauth2/token',
];

export function findOAuthFlow(flow: AuthFlow): OAuthFlowInfo {
  const authorizeRequests: OAuthAuthorizeRequest[] = [];
  const tokenExchanges: OAuthTokenExchange[] = [];
  const callbacks: OAuthCallback[] = [];
  const bearerUsages: BearerUsage[] = [];
  const basicAuthUsages: BasicAuthUsage[] = [];

  for (const req of flow.requests) {
    if (looksLikeAuthorizeRequest(req.url)) {
      const parsed = parseAuthorizeRequest(req.id, req.url);
      if (parsed) authorizeRequests.push(parsed);
    }
    // OAuth callback (redirect_uri 도착): `?code=...&state=...` 또는 에러 응답
    const cb = parseCallback(req.id, req.url);
    if (cb) callbacks.push(cb);

    // Authorization 헤더 분석
    const authHeader = findAuthorizationHeader(req.headers);
    if (authHeader) {
      const scheme = authScheme(authHeader);
      if (scheme === 'bearer') {
        const raw = authHeader.raw;
        const token = raw?.replace(/^bearer\s+/i, '') ?? '';
        bearerUsages.push({
          requestId: req.id,
          url: req.url,
          method: req.method,
          inferredFromMaskOnly: !raw,
          tokenLooksLikeJwt: token ? looksLikeJwt(token) : false,
        });
      } else if (scheme === 'basic') {
        basicAuthUsages.push({
          requestId: req.id,
          url: req.url,
          method: req.method,
          username: decodeBasicUsername(authHeader),
        });
      }
    }

    const reqBody = req.postData?.raw ?? '';
    if (req.method.toUpperCase() === 'POST' && looksLikeTokenRequest(req.url, reqBody)) {
      const res = flow.responses.find((r) => r.requestId === req.id);
      const resBody = res?.bodyPreview?.raw ?? '';
      const reqParams = parseFormOrJson(reqBody);
      const resJson = parseJsonSafe(resBody);

      const expiresInSeconds = typeof resJson?.expires_in === 'number' ? resJson.expires_in : undefined;
      let expiresAt: Date | undefined;
      if (expiresInSeconds !== undefined && res) {
        const base = Date.parse(res.timestamp);
        if (!Number.isNaN(base)) expiresAt = new Date(base + expiresInSeconds * 1000);
      }

      tokenExchanges.push({
        requestId: req.id,
        endpoint: stripQuery(req.url),
        grantType: stringField(reqParams.grant_type),
        clientId: stringField(reqParams.client_id),
        tokenType: stringField(resJson?.token_type),
        expiresInSeconds,
        expiresAt,
        scope: stringField(resJson?.scope),
        hasAccessToken: typeof resJson?.access_token === 'string',
        hasRefreshToken: typeof resJson?.refresh_token === 'string',
        hasIdToken: typeof resJson?.id_token === 'string',
        status: res?.status,
      });
    }
  }

  return { authorizeRequests, tokenExchanges, callbacks, bearerUsages, basicAuthUsages };
}

function parseCallback(requestId: string, url: string): OAuthCallback | undefined {
  try {
    const u = new URL(url);
    const hasCode = u.searchParams.has('code');
    const hasState = u.searchParams.has('state');
    const hasError = u.searchParams.has('error');
    if (!hasCode && !hasError) return undefined;
    // 보통 OAuth callback은 code+state 둘 다 있음. error는 단독으로도.
    if (hasCode && !hasState && !hasError) return undefined; // 너무 약함
    return {
      requestId,
      url,
      host: u.host,
      hasCode,
      hasState,
      hasError,
      errorCode: u.searchParams.get('error') ?? undefined,
    };
  } catch {
    return undefined;
  }
}

/**
 * authorize endpoint 판정:
 *   1. path가 알려진 패턴으로 끝나거나
 *   2. query에 `response_type`과 `client_id`가 모두 있음 (RFC 6749 §4.1.1)
 */
export function looksLikeAuthorizeRequest(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const p = u.pathname.toLowerCase();
  if (AUTHORIZE_PATH_HINTS.some((pat) => p === pat || p.endsWith(pat))) return true;
  if (u.searchParams.has('response_type') && u.searchParams.has('client_id')) return true;
  return false;
}

/**
 * token endpoint 판정 (POST 가정):
 *   1. path가 알려진 패턴으로 끝나거나
 *   2. 요청 본문에 `grant_type` 이 있음 (RFC 6749 §4.1.3 등 공통 요구)
 */
export function looksLikeTokenRequest(url: string, body: string): boolean {
  try {
    const p = new URL(url).pathname.toLowerCase();
    if (TOKEN_PATH_HINTS.some((pat) => p === pat || p.endsWith(pat))) return true;
  } catch {
    /* fall through to body check */
  }
  if (!body) return false;
  const params = parseFormOrJson(body);
  return typeof params.grant_type === 'string';
}

function parseAuthorizeRequest(requestId: string, url: string): OAuthAuthorizeRequest | undefined {
  try {
    const u = new URL(url);
    const p = u.searchParams;
    const codeChallenge = p.get('code_challenge') ?? undefined;
    return {
      requestId,
      endpoint: u.origin + u.pathname,
      responseType: p.get('response_type') ?? undefined,
      clientId: p.get('client_id') ?? undefined,
      redirectUri: p.get('redirect_uri') ?? undefined,
      scope: p.get('scope') ?? undefined,
      state: p.get('state') ?? undefined,
      nonce: p.get('nonce') ?? undefined,
      codeChallenge,
      codeChallengeMethod: p.get('code_challenge_method') ?? undefined,
      pkce: codeChallenge != null,
    };
  } catch {
    return undefined;
  }
}

function stripQuery(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

function parseFormOrJson(body: string): Record<string, unknown> {
  if (!body) return {};
  // JSON first
  try {
    const j = JSON.parse(body);
    if (j && typeof j === 'object' && !Array.isArray(j)) return j as Record<string, unknown>;
  } catch {
    /* not JSON */
  }
  // form-urlencoded
  if (/^[\w.%+-]+=/.test(body)) {
    const params = new URLSearchParams(body);
    const out: Record<string, unknown> = {};
    for (const [k, v] of params.entries()) out[k] = v;
    return out;
  }
  return {};
}

function parseJsonSafe(body: string): Record<string, unknown> | undefined {
  if (!body) return undefined;
  try {
    const v = JSON.parse(body);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  return undefined;
}

function stringField(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

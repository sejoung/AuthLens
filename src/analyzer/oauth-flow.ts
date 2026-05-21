/**
 * OAuth/OIDC 흐름 메타데이터 추출.
 *
 * - authorize endpoint 호출에서 query 파라미터 분석 (PKCE, state, scope, …)
 * - token endpoint POST에서 요청 본문(grant_type 등) + 응답 본문(`expires_in`,
 *   `refresh_token`, `id_token` 등) 분석
 *
 * 토큰 자체의 raw 값은 가공하지 않는다 — JWT는 `findJwts`가 이미 따로 잡는다.
 */

import type { AuthFlow } from '@/core';

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

export type OAuthFlowInfo = {
  authorizeRequests: OAuthAuthorizeRequest[];
  tokenExchanges: OAuthTokenExchange[];
};

const AUTHORIZE_PATH_PATTERNS = ['/authorize', '/oauth/authorize', '/oauth2/authorize'];
const TOKEN_PATH_PATTERNS = ['/oauth/token', '/oauth2/token', '/token'];

export function findOAuthFlow(flow: AuthFlow): OAuthFlowInfo {
  const authorizeRequests: OAuthAuthorizeRequest[] = [];
  const tokenExchanges: OAuthTokenExchange[] = [];

  for (const req of flow.requests) {
    if (isAuthorizeUrl(req.url)) {
      const parsed = parseAuthorizeRequest(req.id, req.url);
      if (parsed) authorizeRequests.push(parsed);
    }
    if (req.method.toUpperCase() === 'POST' && isTokenUrl(req.url)) {
      const res = flow.responses.find((r) => r.requestId === req.id);
      const reqBody = req.postData?.raw ?? '';
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

  return { authorizeRequests, tokenExchanges };
}

function isAuthorizeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const p = u.pathname.toLowerCase();
    return AUTHORIZE_PATH_PATTERNS.some((pat) => p === pat || p.endsWith(pat));
  } catch {
    return false;
  }
}

function isTokenUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const p = u.pathname.toLowerCase();
    return TOKEN_PATH_PATTERNS.some((pat) => p === pat || p.endsWith(pat));
  } catch {
    return false;
  }
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

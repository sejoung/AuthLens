/**
 * Deep validation checks for OAuth 2.0 / OIDC flows.
 *
 * We can't *prove* security from a single capture — the IdP may add things
 * we don't see, the client may validate things off-wire — so each check is
 * conservative: only fire when the absence is observable from network data.
 *
 * Output uses `SecurityNote`-compatible shape so findings can be merged
 * straight into `AuthFlowSummary.warnings` without an extra adapter layer.
 */

import type { SecurityNote } from '@/core';
import type { OAuthAuthorizeRequest, OAuthFlowInfo, OAuthTokenExchange } from './oauth.js';

export type OAuthFinding = SecurityNote & { code: string };

export function validateOAuthFlow(info: OAuthFlowInfo): OAuthFinding[] {
  const findings: OAuthFinding[] = [];
  for (const a of info.authorizeRequests) {
    findings.push(...validateAuthorize(a));
  }
  for (const t of info.tokenExchanges) {
    findings.push(...validateTokenExchange(t, info));
  }
  return dedupeByCode(findings);
}

function validateAuthorize(a: OAuthAuthorizeRequest): OAuthFinding[] {
  const out: OAuthFinding[] = [];
  const rt = (a.responseType ?? '').toLowerCase();

  // Implicit flow — `response_type=token` (or `id_token token`) is deprecated
  // for confidential clients and considered insecure for SPAs (Auth0/OIDC
  // best practice 2021+: use Authorization Code + PKCE instead).
  if (rt.includes('token') && !rt.includes('code')) {
    out.push({
      code: 'oauth.implicit-flow',
      level: 'danger',
      message: `Implicit flow detected (response_type="${a.responseType}"). Use Authorization Code + PKCE.`,
    });
  }

  // Missing state — leaves the callback vulnerable to CSRF.
  if (!a.state) {
    out.push({
      code: 'oauth.missing-state',
      level: 'warning',
      message: 'OAuth authorize request has no `state` parameter (CSRF protection missing).',
    });
  } else if (a.state.length < 8) {
    // Very short state values look like sequence counters and offer little
    // CSRF protection in practice — the OAuth security BCP recommends an
    // unpredictable, opaque value of meaningful entropy.
    out.push({
      code: 'oauth.weak-state',
      level: 'info',
      message: `OAuth state is short (${a.state.length} chars); should be unpredictable and at least ~16 chars.`,
    });
  }

  // PKCE on public clients — almost every modern SPA flow should use PKCE.
  // We can't always tell "public" vs "confidential" client from the wire,
  // so we surface this at warning level rather than danger.
  if (!a.pkce && rt.includes('code')) {
    out.push({
      code: 'oauth.missing-pkce',
      level: 'warning',
      message: 'Authorization Code flow without PKCE (`code_challenge` missing).',
    });
  }
  if (a.pkce && a.codeChallengeMethod && a.codeChallengeMethod.toLowerCase() === 'plain') {
    out.push({
      code: 'oauth.pkce-plain',
      level: 'warning',
      message: 'PKCE is using `code_challenge_method=plain`; should be `S256`.',
    });
  }

  // OIDC nonce — required when `scope` contains `openid` and we want
  // replay protection on id_token.
  const isOidc = (a.scope ?? '').split(/\s+/).includes('openid');
  if (isOidc && !a.nonce) {
    out.push({
      code: 'oauth.missing-nonce',
      level: 'warning',
      message: 'OIDC authorize request (`scope=openid`) is missing `nonce` (id_token replay protection).',
    });
  }

  // Non-HTTPS redirect_uri (excluding localhost / 127.0.0.1) — RFC 8252.
  if (a.redirectUri) {
    try {
      const u = new URL(a.redirectUri);
      const isLoopback =
        u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
      if (u.protocol === 'http:' && !isLoopback) {
        out.push({
          code: 'oauth.http-redirect',
          level: 'danger',
          message: `redirect_uri uses http (${a.redirectUri}); production callbacks must be https.`,
        });
      }
    } catch {
      /* malformed redirect_uri — not our problem to flag here */
    }
  }

  return out;
}

function validateTokenExchange(
  t: OAuthTokenExchange,
  _info: OAuthFlowInfo,
): OAuthFinding[] {
  const out: OAuthFinding[] = [];

  // Token endpoint returned 4xx/5xx — surface at info level so the user
  // sees it without the noise level of a security warning.
  if (t.status !== undefined && t.status >= 400) {
    out.push({
      code: 'oauth.token-error-status',
      level: 'info',
      message: `Token endpoint returned ${t.status}.`,
    });
  }

  // Very long-lived access tokens — RFC 6749 §10.4: short-lived tokens
  // limit damage if leaked. >24h is a smell for browser-facing tokens.
  if (t.expiresInSeconds !== undefined && t.expiresInSeconds > 24 * 60 * 60) {
    const hours = Math.round(t.expiresInSeconds / 3600);
    out.push({
      code: 'oauth.long-access-token',
      level: 'info',
      message: `access_token expires in ${hours}h. Consider shorter lifetimes for browser-facing tokens.`,
    });
  }

  // refresh_token without rotation hint — we can't detect rotation from
  // a single exchange, so this is purely informational when there *is* a
  // refresh_token (so the user knows to verify rotation themselves).
  if (t.hasRefreshToken && t.grantType === 'authorization_code') {
    out.push({
      code: 'oauth.refresh-token-issued',
      level: 'info',
      message: 'A refresh_token was issued. Confirm the IdP rotates it on each use.',
    });
  }

  return out;
}

function dedupeByCode(findings: OAuthFinding[]): OAuthFinding[] {
  // Same finding code can fire from multiple authorize requests in the
  // capture (e.g. multi-step OAuth). One per code is enough — the user
  // doesn't need to see "missing state" 3 times.
  const seen = new Set<string>();
  const out: OAuthFinding[] = [];
  for (const f of findings) {
    if (seen.has(f.code)) continue;
    seen.add(f.code);
    out.push(f);
  }
  return out;
}

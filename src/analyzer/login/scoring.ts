import {
  COOKIE_CHANGED_AFTER_SCORE,
  CONFIDENCE_HIGH_THRESHOLD,
  CONFIDENCE_MEDIUM_THRESHOLD,
  PASSWORD_FIELD_SCORE,
  POST_METHOD_SCORE,
  PROFILE_FOLLOW_UP_SCORE,
  PROFILE_PATH_PATTERNS,
  SET_COOKIE_RESPONSE_SCORE,
  TOKEN_IN_RESPONSE_SCORE,
  URL_KEYWORD_SCORES,
  looksLikeJwt,
} from '@/core';
import type {
  CookieDiff,
  LoginCandidate,
  RequestRecord,
  ResponseRecord,
  ConfidenceLevel,
} from '@/core';

export type ScoringContext = {
  requests: RequestRecord[];
  responses: ResponseRecord[];
  cookieDiff?: CookieDiff;
};

export type ScoredReason = {
  reason: string;
  score: number;
};

export function scoreRequest(
  request: RequestRecord,
  context: ScoringContext,
): { score: number; reasons: string[] } {
  const reasons: ScoredReason[] = [];
  const url = request.url.toLowerCase();

  for (const { keyword, score } of URL_KEYWORD_SCORES) {
    if (url.includes(keyword)) {
      reasons.push({ reason: `URL contains "${keyword}"`, score });
      break; // 같은 카테고리 중복 가산 방지
    }
  }

  if (request.method.toUpperCase() === 'POST') {
    reasons.push({ reason: 'Method is POST', score: POST_METHOD_SCORE });
  }

  if (request.postData?.masked) {
    const bodyText = request.postData.masked.toLowerCase();
    if (
      bodyText.includes('password') ||
      bodyText.includes('passwd') ||
      bodyText.includes('pwd=') ||
      bodyText.includes('"pwd"')
    ) {
      reasons.push({
        reason: 'Request body contains password-like field',
        score: PASSWORD_FIELD_SCORE,
      });
    }
  }

  const response = context.responses.find((r) => r.requestId === request.id);
  if (response) {
    const setCookie = findHeader(response.headers, 'set-cookie');
    if (setCookie) {
      reasons.push({
        reason: 'Response sets a cookie',
        score: SET_COOKIE_RESPONSE_SCORE,
      });
    }
    const bodyPreview = response.bodyPreview?.masked ?? '';
    if (containsTokenLike(bodyPreview)) {
      reasons.push({
        reason: 'Response body contains token-like value',
        score: TOKEN_IN_RESPONSE_SCORE,
      });
    }
  }

  if (context.cookieDiff) {
    const totalChanges =
      context.cookieDiff.added.length +
      context.cookieDiff.removed.length +
      context.cookieDiff.changed.length;
    if (totalChanges > 0 && reasons.length > 0) {
      // 변화가 있고, 이미 다른 신호가 있다면 보너스
      reasons.push({
        reason: 'Cookies changed during capture',
        score: COOKIE_CHANGED_AFTER_SCORE,
      });
    }
  }

  if (followedByProfileRequest(request, context.requests)) {
    reasons.push({
      reason: 'Followed by profile/me request',
      score: PROFILE_FOLLOW_UP_SCORE,
    });
  }

  const score = reasons.reduce((acc, r) => acc + r.score, 0);
  return {
    score,
    reasons: reasons.map((r) => `[+${r.score}] ${r.reason}`),
  };
}

export function rankLoginCandidates(
  context: ScoringContext,
  limit = 10,
): LoginCandidate[] {
  const candidates: LoginCandidate[] = [];
  for (const req of context.requests) {
    if (req.resourceType && shouldSkipForLogin(req.resourceType)) continue;
    const { score, reasons } = scoreRequest(req, context);
    if (score <= 0) continue;
    candidates.push({
      requestId: req.id,
      score,
      confidence: toConfidence(score),
      reasons,
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

export function toConfidence(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE_HIGH_THRESHOLD) return 'high';
  if (score >= CONFIDENCE_MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}

function shouldSkipForLogin(resourceType: string): boolean {
  return ['image', 'stylesheet', 'font', 'media'].includes(resourceType);
}

function findHeader(
  headers: Record<string, { masked: string }>,
  name: string,
): { masked: string } | undefined {
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) return v;
  }
  return undefined;
}

function containsTokenLike(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (
    lower.includes('access_token') ||
    lower.includes('id_token') ||
    lower.includes('refresh_token') ||
    lower.includes('"token"')
  ) {
    return true;
  }
  // Heuristic: JWT-shaped substring
  const jwtCandidate = text.match(/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/);
  if (jwtCandidate && looksLikeJwt(jwtCandidate[0])) return true;
  return false;
}

function followedByProfileRequest(
  request: RequestRecord,
  all: RequestRecord[],
): boolean {
  const requestTime = Date.parse(request.timestamp);
  if (Number.isNaN(requestTime)) return false;
  for (const candidate of all) {
    if (candidate.id === request.id) continue;
    const candidateTime = Date.parse(candidate.timestamp);
    if (Number.isNaN(candidateTime)) continue;
    if (candidateTime <= requestTime) continue;
    if (candidateTime - requestTime > 30_000) continue; // 30s window
    const path = safePath(candidate.url);
    for (const pattern of PROFILE_PATH_PATTERNS) {
      if (path === pattern || path.endsWith(pattern)) return true;
    }
  }
  return false;
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

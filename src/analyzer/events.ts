import { generateId, REDIRECT_STATUS_CODES, looksLikeJwt } from '@/core';
import type {
  AuthEvent,
  AuthStep,
  CookieDiff,
  LoginCandidate,
  RequestRecord,
  ResponseRecord,
  StorageDiff,
} from '@/core';

export type EventBuildInput = {
  targetUrl: string;
  requests: RequestRecord[];
  responses: ResponseRecord[];
  cookieDiff: CookieDiff;
  storageDiff: StorageDiff;
  loginCandidates: LoginCandidate[];
};

export function buildAuthEvents(input: EventBuildInput): AuthEvent[] {
  const events: AuthEvent[] = [];
  const top = input.loginCandidates[0];
  const targetHost = safeHost(input.targetUrl);

  events.push({
    type: 'page_load',
    url: input.targetUrl,
    timestamp:
      input.requests[0]?.timestamp ?? new Date().toISOString(),
  });

  for (const res of input.responses) {
    if (REDIRECT_STATUS_CODES.has(res.status)) {
      const location =
        Object.entries(res.headers).find(([k]) => k.toLowerCase() === 'location')?.[1]
          ?.masked ?? '';
      if (!location) continue;
      const fromHost = safeHost(res.url);
      const toHost = safeHost(absoluteUrl(location, res.url));
      events.push({
        type: 'redirect_detected',
        timestamp: res.timestamp,
        fromUrl: res.url,
        toUrl: absoluteUrl(location, res.url),
        status: res.status,
        isCrossDomain: !!fromHost && !!toHost && fromHost !== toHost,
      });
    }
  }

  if (top) {
    const req = input.requests.find((r) => r.id === top.requestId);
    if (req) {
      events.push({
        type: 'login_request_detected',
        timestamp: req.timestamp,
        requestId: req.id,
        score: top.score,
        reasons: top.reasons,
      });
    }
  }

  for (const cookie of input.cookieDiff.added) {
    events.push({
      type: 'cookie_changed',
      timestamp: new Date().toISOString(),
      cookieName: cookie.name,
      change: 'added',
      httpOnly: cookie.httpOnly,
    });
  }
  for (const cookie of input.cookieDiff.changed) {
    events.push({
      type: 'cookie_changed',
      timestamp: new Date().toISOString(),
      cookieName: cookie.after.name,
      change: 'changed',
      httpOnly: cookie.after.httpOnly,
    });
  }
  for (const cookie of input.cookieDiff.removed) {
    events.push({
      type: 'cookie_changed',
      timestamp: new Date().toISOString(),
      cookieName: cookie.name,
      change: 'removed',
      httpOnly: cookie.httpOnly,
    });
  }

  for (const entry of input.storageDiff.localStorage.added) {
    events.push({
      type: 'token_stored',
      timestamp: new Date().toISOString(),
      storage: 'localStorage',
      key: entry.key,
      format: looksLikeJwt(entry.value.masked) ? 'jwt' : 'unknown',
    });
  }
  for (const entry of input.storageDiff.sessionStorage.added) {
    events.push({
      type: 'token_stored',
      timestamp: new Date().toISOString(),
      storage: 'sessionStorage',
      key: entry.key,
      format: looksLikeJwt(entry.value.masked) ? 'jwt' : 'unknown',
    });
  }

  for (const req of input.requests) {
    const path = safePath(req.url);
    if (
      ['/me', '/profile', '/user', '/users/me', '/account', '/whoami', '/userinfo'].some(
        (p) => path === p || path.endsWith(p),
      )
    ) {
      events.push({
        type: 'profile_request_detected',
        timestamp: req.timestamp,
        requestId: req.id,
        url: req.url,
      });
      const res = input.responses.find(
        (r) => r.requestId === req.id && r.status >= 200 && r.status < 300,
      );
      if (res) {
        events.push({
          type: 'session_verified',
          timestamp: res.timestamp,
          requestId: req.id,
        });
      }
    }
  }

  events.sort((a, b) => {
    return Date.parse(a.timestamp) - Date.parse(b.timestamp);
  });

  // targetHost 사용 (warning 회피용): 디버깅 시 첫 이벤트가 target에서 시작했는지 확인
  void targetHost;

  return events;
}

export function buildAuthSteps(events: AuthEvent[]): AuthStep[] {
  return events.map((event, index) => ({
    id: generateId('step'),
    index,
    event,
    description: describeEvent(event),
    requestId: 'requestId' in event ? (event.requestId as string | undefined) : undefined,
  }));
}

function describeEvent(event: AuthEvent): string {
  switch (event.type) {
    case 'page_load':
      return `Loaded ${event.url}`;
    case 'login_request_detected':
      return `Login request candidate (score: ${event.score})`;
    case 'redirect_detected':
      return `Redirect ${event.status} → ${event.toUrl}${event.isCrossDomain ? ' (cross-domain)' : ''}`;
    case 'cookie_changed':
      return `Cookie ${event.change}: ${event.cookieName}${event.httpOnly ? ' (HttpOnly)' : ''}`;
    case 'token_stored':
      return `Token stored in ${event.storage}: ${event.key} (${event.format})`;
    case 'csrf_detected':
      return `CSRF token via ${event.source}: ${event.tokenName}`;
    case 'profile_request_detected':
      return `Profile request: ${event.url}`;
    case 'session_verified':
      return `Session verified by profile response`;
    case 'unknown':
      return event.note;
  }
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return undefined;
  }
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return '';
  }
}

function absoluteUrl(target: string, base: string): string {
  try {
    return new URL(target, base).toString();
  } catch {
    return target;
  }
}

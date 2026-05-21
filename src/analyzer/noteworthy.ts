import type { AuthEvent, LoginCandidate, RequestRecord } from '@/core';

/**
 * 정적 자산처럼 인증 흐름 이해에 도움 안 되는 resource type.
 * Mermaid/리포트/UI 모두에서 일관되게 숨김.
 */
const ASSET_RESOURCE_TYPES: ReadonlySet<string> = new Set([
  'image',
  'stylesheet',
  'font',
  'media',
  'manifest',
  'texttrack',
]);

/**
 * Analysis/Report에서 기본 표시할 timeline 이벤트만 골라낸다.
 * 페이지 로딩, 인-도메인 redirect, 일반 cookie 변화 등은 verbose라 숨김.
 */
export function isNoteworthyEvent(event: AuthEvent, index: number): boolean {
  switch (event.type) {
    case 'page_load':
      // 첫 페이지 로드만 표시.
      return index === 0;
    case 'login_request_detected':
    case 'token_stored':
    case 'session_verified':
    case 'csrf_detected':
    case 'profile_request_detected':
      return true;
    case 'cookie_changed':
      return event.httpOnly === true || /session|auth|token|csrf|xsrf/i.test(event.cookieName);
    case 'redirect_detected':
      return event.isCrossDomain;
    case 'unknown':
      return false;
  }
}

export function filterNoteworthyEvents(events: AuthEvent[]): AuthEvent[] {
  return events.filter((e, i) => isNoteworthyEvent(e, i));
}

/**
 * 요청 목록에서 정적 자산 제외. 로그인 후보로 잡힌 요청은 자산이라도 표시.
 */
export function isNoteworthyRequest(
  req: RequestRecord,
  candidateIds: ReadonlySet<string>,
): boolean {
  if (candidateIds.has(req.id)) return true;
  return !ASSET_RESOURCE_TYPES.has(req.resourceType);
}

export function filterNoteworthyRequests(
  requests: RequestRecord[],
  candidates: LoginCandidate[] = [],
): RequestRecord[] {
  const ids = new Set(candidates.map((c) => c.requestId));
  return requests.filter((r) => isNoteworthyRequest(r, ids));
}

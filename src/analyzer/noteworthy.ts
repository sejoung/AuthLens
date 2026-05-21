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

/**
 * UI request list 필터 그룹.
 * - `api`: 인증 분석에 핵심 (XHR/fetch/eventsource/websocket)
 * - `document`: 페이지 로드 요청 (HTML)
 * - `script`: JS 번들
 * - `other`: 정적 자산 등 (image/stylesheet/font/media/manifest/texttrack/other)
 * - `all`: 전체
 */
export type ResourceGroup = 'api' | 'document' | 'script' | 'other' | 'all';

const RESOURCE_GROUP_TYPES: Record<Exclude<ResourceGroup, 'all'>, ReadonlySet<string>> = {
  api: new Set(['xhr', 'fetch', 'eventsource', 'websocket']),
  document: new Set(['document']),
  script: new Set(['script']),
  other: new Set(['image', 'stylesheet', 'font', 'media', 'manifest', 'texttrack', 'other']),
};

export function resourceGroupOf(resourceType: string): Exclude<ResourceGroup, 'all'> {
  for (const [group, set] of Object.entries(RESOURCE_GROUP_TYPES) as Array<
    [Exclude<ResourceGroup, 'all'>, ReadonlySet<string>]
  >) {
    if (set.has(resourceType)) return group;
  }
  return 'other';
}

/**
 * 그룹별 요청 수 + login candidate 수.
 */
export function countByResourceGroup(
  requests: RequestRecord[],
): Record<ResourceGroup, number> {
  const counts: Record<ResourceGroup, number> = {
    api: 0,
    document: 0,
    script: 0,
    other: 0,
    all: requests.length,
  };
  for (const r of requests) {
    counts[resourceGroupOf(r.resourceType)] += 1;
  }
  return counts;
}

/**
 * 그룹 필터 적용. 단, login candidate로 잡힌 요청은 어떤 그룹이든 항상 통과.
 */
export function filterByResourceGroup(
  requests: RequestRecord[],
  group: ResourceGroup,
  candidates: LoginCandidate[] = [],
): RequestRecord[] {
  if (group === 'all') return requests;
  const candidateIds = new Set(candidates.map((c) => c.requestId));
  const allowed = RESOURCE_GROUP_TYPES[group];
  return requests.filter((r) => candidateIds.has(r.id) || allowed.has(r.resourceType));
}

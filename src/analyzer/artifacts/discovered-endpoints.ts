/**
 * 인증 이후 호출된 API endpoint를 그룹화. 같은 path pattern을 hit한 요청들을
 * 하나로 묶고, path 파라미터(숫자 ID, UUID)는 `:id`로 normalize.
 *
 * 목적: 캡처에서 "이 사이트의 인증된 API 표면이 무엇인가?"를 한눈에.
 */

import type { AuthFlow, RequestRecord } from '@/core';

export type DiscoveredEndpoint = {
  /** Normalized path pattern, 예: `/users/:id/posts` */
  pathPattern: string;
  host: string;
  /** 관찰된 HTTP method 목록 (정렬됨) */
  methods: string[];
  /** 매칭된 request 수 */
  requestCount: number;
  /** 첫 예시 RequestRecord (curl/fetch snippet 생성용) */
  example: RequestRecord;
  /** 관찰된 응답 status 코드별 카운트 */
  statusCounts: Record<number, number>;
  /** 인증된 endpoint인지 (세션 쿠키나 Authorization 헤더가 있었는지) */
  authenticated: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_RE = /^[0-9a-f]{16,}$/i;

/** Path 세그먼트 중 ID처럼 보이는 부분을 `:id`로 치환. */
export function normalizePath(path: string): string {
  return path
    .split('/')
    .map((seg) => {
      if (!seg) return seg;
      if (/^\d+$/.test(seg)) return ':id';
      if (UUID_RE.test(seg)) return ':id';
      if (HEX_RE.test(seg)) return ':id';
      // base64-ish opaque IDs (lengthy, mixed case + digits/_/-)
      if (seg.length >= 20 && /[A-Z]/.test(seg) && /[a-z]/.test(seg) && /\d/.test(seg)) {
        return ':id';
      }
      return seg;
    })
    .join('/');
}

const AUTH_RELEVANT_RESOURCE_TYPES = new Set(['xhr', 'fetch', 'eventsource', 'websocket']);

export type DiscoverOptions = {
  /** API endpoint만 (xhr/fetch). false면 document/script까지 포함. */
  apiOnly?: boolean;
  /** 로그인 후보 응답 timestamp 이전 요청은 제외. */
  afterLoginOnly?: boolean;
};

export function discoverEndpoints(
  flow: AuthFlow,
  options: DiscoverOptions = { apiOnly: true, afterLoginOnly: true },
): DiscoveredEndpoint[] {
  const apiOnly = options.apiOnly !== false;
  const afterLoginOnly = options.afterLoginOnly !== false;

  // login boundary
  let loginAt = 0;
  if (afterLoginOnly) {
    const top = flow.loginCandidates[0];
    if (top) {
      const loginRes = flow.responses.find((r) => r.requestId === top.requestId);
      const ts = loginRes?.timestamp ?? flow.requests.find((r) => r.id === top.requestId)?.timestamp;
      if (ts) loginAt = Date.parse(ts);
    }
  }

  const groups = new Map<string, DiscoveredEndpoint>();

  for (const req of flow.requests) {
    if (apiOnly && !AUTH_RELEVANT_RESOURCE_TYPES.has(req.resourceType)) continue;
    if (loginAt > 0) {
      const reqAt = Date.parse(req.timestamp);
      if (!Number.isNaN(reqAt) && reqAt < loginAt) continue;
    }

    let u: URL;
    try {
      u = new URL(req.url);
    } catch {
      continue;
    }
    const pattern = normalizePath(u.pathname);
    const key = `${u.host}|${pattern}`;
    const res = flow.responses.find((r) => r.requestId === req.id);

    const existing = groups.get(key);
    if (existing) {
      if (!existing.methods.includes(req.method.toUpperCase())) {
        existing.methods.push(req.method.toUpperCase());
        existing.methods.sort();
      }
      existing.requestCount += 1;
      if (res) existing.statusCounts[res.status] = (existing.statusCounts[res.status] ?? 0) + 1;
      if (!existing.authenticated && hasAuthSignal(req)) existing.authenticated = true;
    } else {
      const statusCounts: Record<number, number> = {};
      if (res) statusCounts[res.status] = 1;
      groups.set(key, {
        pathPattern: pattern,
        host: u.host,
        methods: [req.method.toUpperCase()],
        requestCount: 1,
        example: req,
        statusCounts,
        authenticated: hasAuthSignal(req),
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    // authenticated 우선, 그다음 호출 빈도, 그다음 path 알파벳
    if (a.authenticated !== b.authenticated) return a.authenticated ? -1 : 1;
    if (a.requestCount !== b.requestCount) return b.requestCount - a.requestCount;
    return a.pathPattern.localeCompare(b.pathPattern);
  });
}

function hasAuthSignal(req: RequestRecord): boolean {
  for (const [k, v] of Object.entries(req.headers)) {
    const lower = k.toLowerCase();
    if (lower === 'authorization') return true;
    if (lower === 'cookie' && v.sensitivity !== 'none') return true;
    if (lower === 'x-csrf-token' || lower === 'x-xsrf-token') return true;
  }
  return false;
}

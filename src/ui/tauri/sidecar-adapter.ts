/**
 * Sidecar payload (raw network capture)를 도메인 모델로 변환.
 *
 * Masking은 이 단계에서 한 번에 적용. Sidecar → Tauri Rust → React로 흐르는 동안은
 * 모두 in-memory process boundary 안이라 raw 통과 OK (ARCHITECTURE.md §12).
 */
import { analyze } from '@/analyzer';
import {
  maskBodyText,
  maskHeaders,
  toSensitiveValue,
  type AuthFlow,
  type CookieSnapshot,
  type RequestRecord,
  type ResponseRecord,
  type StorageSnapshot,
} from '@/core';
import type {
  SidecarCookie,
  SidecarRawCapture,
  SidecarRequest,
  SidecarResponse,
} from './bridge.js';

function toCookieSnapshot(c: SidecarCookie): CookieSnapshot {
  return {
    name: c.name,
    domain: c.domain,
    path: c.path,
    value: toSensitiveValue(c.name, c.value),
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: normalizeSameSite(c.sameSite),
    expires: c.expires,
  };
}

function normalizeSameSite(v?: string): 'Strict' | 'Lax' | 'None' | undefined {
  if (!v) return undefined;
  const lower = String(v).toLowerCase();
  if (lower === 'strict') return 'Strict';
  if (lower === 'lax') return 'Lax';
  if (lower === 'none') return 'None';
  return undefined;
}

export function toRequestRecord(r: SidecarRequest): RequestRecord {
  return {
    id: r.id,
    url: r.url,
    method: r.method,
    headers: maskHeaders(r.headers),
    postData: r.postData ? maskBodyText(r.postData) : undefined,
    resourceType: r.resourceType,
    timestamp: r.timestamp,
    frameUrl: r.frameUrl,
  };
}

export function toResponseRecord(r: SidecarResponse): ResponseRecord {
  return {
    id: r.id,
    requestId: r.requestId,
    url: r.url,
    status: r.status,
    statusText: r.statusText,
    headers: maskHeaders(r.headers),
    contentType: r.contentType,
    bodyPreview: r.body !== undefined ? maskBodyText(r.body) : undefined,
    bodySize: r.bodySize,
    isBinary: r.isBinary,
    timestamp: r.timestamp,
  };
}

function toStorageSnapshot(entries: Array<{ key: string; value: string }>): {
  key: string;
  value: ReturnType<typeof toSensitiveValue>;
}[] {
  return entries.map((e) => ({
    key: e.key,
    value: toSensitiveValue(e.key, e.value),
  }));
}

export function buildFlowFromCapture(raw: SidecarRawCapture): AuthFlow {
  const storageAfter: StorageSnapshot = {
    localStorage: toStorageSnapshot(raw.storage.localStorage),
    sessionStorage: toStorageSnapshot(raw.storage.sessionStorage),
  };
  return analyze({
    targetUrl: raw.target,
    startedAt: raw.startedAt,
    endedAt: raw.endedAt,
    requests: raw.requests.map(toRequestRecord),
    responses: raw.responses.map(toResponseRecord),
    cookiesBefore: raw.cookiesBefore.map(toCookieSnapshot),
    cookiesAfter: raw.cookiesAfter.map(toCookieSnapshot),
    storageBefore: { localStorage: [], sessionStorage: [] },
    storageAfter,
  });
}

/**
 * 비동기·청크 처리. 큰 캡처에서 메인 스레드를 막지 않도록 자주 yield.
 *
 * Yield 전략 (각각의 트레이드오프):
 *   - `scheduler.yield()` — 모던 Chromium 한정 (Tauri WKWebView/WebView2 모두 미지원
 *     가능성). 있으면 가장 부드러움.
 *   - `requestAnimationFrame` — 화면 refresh와 동기화 (~16ms). 시각적으로 자연스럽지만
 *     실제 작업 진행이 느려짐.
 *   - `setTimeout(0)` — 최소 4ms. 항상 동작. 기본 fallback.
 *
 * 본 구현은 가능하면 scheduler.yield, 없으면 setTimeout(0).
 */
export async function buildFlowFromCaptureAsync(
  raw: SidecarRawCapture,
): Promise<AuthFlow> {
  const yield_ = makeYielder();
  const CHUNK = 32;

  const requests = [];
  for (let i = 0; i < raw.requests.length; i++) {
    requests.push(toRequestRecord(raw.requests[i]!));
    if (i > 0 && i % CHUNK === 0) await yield_();
  }
  await yield_();

  const responses = [];
  for (let i = 0; i < raw.responses.length; i++) {
    responses.push(toResponseRecord(raw.responses[i]!));
    if (i > 0 && i % CHUNK === 0) await yield_();
  }
  await yield_();

  const cookiesBefore = raw.cookiesBefore.map(toCookieSnapshot);
  const cookiesAfter = raw.cookiesAfter.map(toCookieSnapshot);
  const storageAfter: StorageSnapshot = {
    localStorage: toStorageSnapshot(raw.storage.localStorage),
    sessionStorage: toStorageSnapshot(raw.storage.sessionStorage),
  };

  await yield_();
  // analyze()는 동기지만 위 단계에서 충분히 yield했으니 여기서 잠시 양보 후 실행.
  // 실제 운영 캡처에서 가장 무거운 부분이 마스킹(요청/응답 루프)이라 여기까진 끝남.
  const flow = analyze({
    targetUrl: raw.target,
    startedAt: raw.startedAt,
    endedAt: raw.endedAt,
    requests,
    responses,
    cookiesBefore,
    cookiesAfter,
    storageBefore: { localStorage: [], sessionStorage: [] },
    storageAfter,
  });
  await yield_();
  return flow;
}

function makeYielder(): () => Promise<void> {
  // scheduler.yield is a TC39 proposal; not in standard types yet.
  const sched = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (sched?.yield) {
    return () => sched.yield!();
  }
  return () => new Promise<void>((r) => setTimeout(r, 0));
}

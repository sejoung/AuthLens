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
 * 비동기·청크 처리 버전. 큰 캡처(수백 요청)에서 메인 스레드를 막지 않도록
 * 64건마다 `setTimeout(0)`로 양보한다. 모든 마스킹은 동기 작업이지만 누적되면
 * 가시적 freeze가 생긴다.
 */
export async function buildFlowFromCaptureAsync(
  raw: SidecarRawCapture,
): Promise<AuthFlow> {
  const yield_ = () => new Promise<void>((r) => setTimeout(r, 0));
  const CHUNK = 64;

  const requests = [];
  for (let i = 0; i < raw.requests.length; i++) {
    requests.push(toRequestRecord(raw.requests[i]!));
    if (i > 0 && i % CHUNK === 0) await yield_();
  }

  const responses = [];
  for (let i = 0; i < raw.responses.length; i++) {
    responses.push(toResponseRecord(raw.responses[i]!));
    if (i > 0 && i % CHUNK === 0) await yield_();
  }

  const cookiesBefore = raw.cookiesBefore.map(toCookieSnapshot);
  const cookiesAfter = raw.cookiesAfter.map(toCookieSnapshot);
  const storageAfter: StorageSnapshot = {
    localStorage: toStorageSnapshot(raw.storage.localStorage),
    sessionStorage: toStorageSnapshot(raw.storage.sessionStorage),
  };

  await yield_();
  return analyze({
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
}

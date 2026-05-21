import {
  BINARY_CONTENT_TYPE_PREFIXES,
  DEFAULT_BODY_PREVIEW_LIMIT,
  MAX_BODY_PREVIEW_LIMIT,
  generateId,
  maskHeaders,
  maskBodyText,
  nowIso,
  toSensitiveValue,
} from '@/core';
import type {
  CookieSnapshot,
  RequestRecord,
  ResponseRecord,
  StorageSnapshot,
} from '@/core';
import type { RawCapture, RecorderOptions } from './types.js';
import { DEFAULT_RECORDER_OPTIONS } from './types.js';

/**
 * 어떤 transport(playwright, HAR, 테스트)와도 결합 가능한
 * 순수 in-memory recorder. 캡처 이벤트를 받아 RawCapture로 누적한다.
 */
export class InMemoryRecorder {
  private readonly options: Required<Omit<RecorderOptions, 'userAgent'>> & {
    userAgent?: string;
  };
  private readonly requests = new Map<string, RequestRecord>();
  private readonly responses: ResponseRecord[] = [];
  private cookiesBefore: CookieSnapshot[] = [];
  private cookiesAfter: CookieSnapshot[] = [];
  private storageBefore: StorageSnapshot = { localStorage: [], sessionStorage: [] };
  private storageAfter: StorageSnapshot = { localStorage: [], sessionStorage: [] };
  private startedAt: string;
  private endedAt?: string;

  constructor(
    public readonly targetUrl: string,
    options: RecorderOptions = {},
  ) {
    this.options = {
      bodyPreviewLimit: Math.min(
        options.bodyPreviewLimit ?? DEFAULT_BODY_PREVIEW_LIMIT,
        MAX_BODY_PREVIEW_LIMIT,
      ),
      extraSensitiveKeys: options.extraSensitiveKeys ?? [],
      viewport: options.viewport ?? DEFAULT_RECORDER_OPTIONS.viewport,
      headful: options.headful ?? DEFAULT_RECORDER_OPTIONS.headful,
      maxDurationMs:
        options.maxDurationMs ?? DEFAULT_RECORDER_OPTIONS.maxDurationMs,
      userAgent: options.userAgent,
    };
    this.startedAt = nowIso();
  }

  recordRequest(input: {
    url: string;
    method: string;
    headers: Record<string, string>;
    postData?: string;
    resourceType: string;
    frameUrl?: string;
    timestamp?: string;
  }): RequestRecord {
    const record: RequestRecord = {
      id: generateId('req'),
      url: input.url,
      method: input.method,
      headers: maskHeaders(input.headers),
      postData: input.postData ? maskBodyText(input.postData) : undefined,
      resourceType: input.resourceType,
      timestamp: input.timestamp ?? nowIso(),
      frameUrl: input.frameUrl,
    };
    this.requests.set(input.url + '|' + input.method + '|' + record.timestamp, record);
    return record;
  }

  /**
   * URL/method/timestamp 기준으로 매칭. Playwright는 실제 객체 참조로 매칭 가능하지만
   * adapter에서 ID를 직접 넘기는 방식을 권장.
   */
  attachResponse(input: {
    requestId: string;
    url: string;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body?: string;
    bodySize?: number;
    contentType?: string;
    timestamp?: string;
  }): ResponseRecord {
    const isBinary = isBinaryContentType(input.contentType);
    let bodyPreview: ResponseRecord['bodyPreview'];
    if (input.body !== undefined && !isBinary) {
      const truncated =
        input.body.length > this.options.bodyPreviewLimit
          ? input.body.slice(0, this.options.bodyPreviewLimit)
          : input.body;
      bodyPreview = maskBodyText(truncated);
    } else if (isBinary) {
      bodyPreview = toSensitiveValue('body', '[binary content excluded]');
    }
    const record: ResponseRecord = {
      id: generateId('res'),
      requestId: input.requestId,
      url: input.url,
      status: input.status,
      statusText: input.statusText,
      headers: maskHeaders(input.headers),
      contentType: input.contentType,
      bodyPreview,
      bodySize: input.bodySize,
      isBinary,
      timestamp: input.timestamp ?? nowIso(),
    };
    this.responses.push(record);
    return record;
  }

  setCookiesBefore(cookies: CookieSnapshot[]) {
    this.cookiesBefore = cookies;
  }
  setCookiesAfter(cookies: CookieSnapshot[]) {
    this.cookiesAfter = cookies;
  }
  setStorageBefore(snap: StorageSnapshot) {
    this.storageBefore = snap;
  }
  setStorageAfter(snap: StorageSnapshot) {
    this.storageAfter = snap;
  }

  stop(): RawCapture {
    this.endedAt = nowIso();
    return {
      id: generateId('capture'),
      targetUrl: this.targetUrl,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      requests: Array.from(this.requests.values()),
      responses: [...this.responses],
      cookiesBefore: this.cookiesBefore,
      cookiesAfter: this.cookiesAfter,
      storageBefore: this.storageBefore,
      storageAfter: this.storageAfter,
    };
  }

  /** 현재 누적된 통계 (UI 실시간 표시용). */
  stats() {
    return {
      requestCount: this.requests.size,
      responseCount: this.responses.length,
    };
  }
}

function isBinaryContentType(ct?: string): boolean {
  if (!ct) return false;
  const lower = ct.toLowerCase();
  return BINARY_CONTENT_TYPE_PREFIXES.some((p) => lower.startsWith(p));
}

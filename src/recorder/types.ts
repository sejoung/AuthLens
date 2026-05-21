import type {
  CookieSnapshot,
  RequestRecord,
  ResponseRecord,
  StorageSnapshot,
} from '@/core';

/**
 * RawCapture: 분석기에 넘기기 전 단계의 캡처 결과.
 * Recorder가 최종적으로 만들어내는 객체.
 */
export type RawCapture = {
  id: string;
  targetUrl: string;
  startedAt: string;
  endedAt: string;
  requests: RequestRecord[];
  responses: ResponseRecord[];
  cookiesBefore: CookieSnapshot[];
  cookiesAfter: CookieSnapshot[];
  storageBefore: StorageSnapshot;
  storageAfter: StorageSnapshot;
};

export type RecorderOptions = {
  /** response body preview size in bytes */
  bodyPreviewLimit?: number;
  /** 추가 마스킹 키 */
  extraSensitiveKeys?: string[];
  /** viewport */
  viewport?: { width: number; height: number };
  /** user-agent (기본 Playwright UA 사용) */
  userAgent?: string;
  /** headful 모드 (기본 true — 사용자가 직접 로그인) */
  headful?: boolean;
  /** 캡처 최대 시간 (ms). 초과 시 자동 종료. */
  maxDurationMs?: number;
};

export const DEFAULT_RECORDER_OPTIONS: Required<Omit<RecorderOptions, 'userAgent'>> & {
  userAgent?: string;
} = {
  bodyPreviewLimit: 8 * 1024,
  extraSensitiveKeys: [],
  viewport: { width: 1280, height: 800 },
  headful: true,
  maxDurationMs: 10 * 60 * 1000,
};

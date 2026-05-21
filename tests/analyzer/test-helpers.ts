import { generateId, toSensitiveValue, maskHeaders } from '@/core';
import type {
  CookieSnapshot,
  HeaderMap,
  RequestRecord,
  ResponseRecord,
  StorageSnapshot,
} from '@/core';

let counter = 0;
function nextTime(): string {
  counter += 100;
  return new Date(Date.UTC(2026, 0, 1, 0, 0, 0, counter)).toISOString();
}

export function resetTime() {
  counter = 0;
}

export function makeRequest(partial: Partial<RequestRecord> = {}): RequestRecord {
  return {
    id: generateId('req'),
    url: 'https://example.com/',
    method: 'GET',
    headers: {},
    resourceType: 'document',
    timestamp: partial.timestamp ?? nextTime(),
    ...partial,
  };
}

export function makeResponse(
  requestId: string,
  partial: Partial<ResponseRecord> = {},
): ResponseRecord {
  return {
    id: generateId('res'),
    requestId,
    url: 'https://example.com/',
    status: 200,
    statusText: 'OK',
    headers: {},
    timestamp: partial.timestamp ?? nextTime(),
    ...partial,
  };
}

export function makeHeaders(input: Record<string, string>): HeaderMap {
  return maskHeaders(input);
}

export function makePostData(body: string) {
  return toSensitiveValue('body', body);
}

export function makeCookie(partial: Partial<CookieSnapshot> & { name: string }): CookieSnapshot {
  return {
    name: partial.name,
    domain: partial.domain ?? 'example.com',
    path: partial.path ?? '/',
    value: partial.value ?? toSensitiveValue('cookie', 'value'),
    httpOnly: partial.httpOnly ?? false,
    secure: partial.secure ?? false,
    sameSite: partial.sameSite,
    expires: partial.expires,
  };
}

export const EMPTY_STORAGE: StorageSnapshot = {
  localStorage: [],
  sessionStorage: [],
};

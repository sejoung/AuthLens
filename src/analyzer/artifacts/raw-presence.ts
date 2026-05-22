import type { AuthFlow, SensitiveValue } from '@/core';

/**
 * Flow 안에 raw 민감 값이 하나라도 살아있는지 검사.
 * UI의 "Include raw values" 토글 활성 조건 + Report의 raw 노출 판단에 사용.
 */
export function flowContainsRaw(flow: AuthFlow | undefined): boolean {
  if (!flow) return false;
  for (const c of flow.cookiesAfter) {
    if (hasRaw(c.value)) return true;
  }
  for (const req of flow.requests) {
    for (const v of Object.values(req.headers)) {
      if (hasRaw(v)) return true;
    }
    if (req.postData && hasRaw(req.postData)) return true;
  }
  for (const res of flow.responses) {
    for (const v of Object.values(res.headers)) {
      if (hasRaw(v)) return true;
    }
    if (res.bodyPreview && hasRaw(res.bodyPreview)) return true;
  }
  for (const e of flow.storageAfter.localStorage) {
    if (hasRaw(e.value)) return true;
  }
  for (const e of flow.storageAfter.sessionStorage) {
    if (hasRaw(e.value)) return true;
  }
  return false;
}

function hasRaw(v: SensitiveValue): boolean {
  return v.raw !== undefined && v.sensitivity !== 'none';
}

/** SensitiveValue에서 표시할 문자열 선택 (showRaw=true일 때만 raw 사용). */
export function displaySensitive(v: SensitiveValue, showRaw: boolean): string {
  if (showRaw && v.raw !== undefined) return v.raw;
  return v.masked;
}

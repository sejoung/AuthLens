import type { AuthFlow, RequestRecord } from '@/core';

export type LogoutEndpoint = {
  request: RequestRecord;
  /** 응답 status (있다면) */
  status?: number;
  /** 응답에서 세션 쿠키가 정리되었는지 (`Max-Age=0` 또는 `Expires=` 과거) */
  clearedSessionCookie?: boolean;
};

const LOGOUT_PATH_RE = /\/(logout|signout|sign-out|sign_out|log-out|log_out|session\/destroy)\b/i;

export function findLogoutEndpoints(flow: AuthFlow): LogoutEndpoint[] {
  const out: LogoutEndpoint[] = [];
  for (const req of flow.requests) {
    let pathname = '';
    try {
      pathname = new URL(req.url).pathname;
    } catch {
      continue;
    }
    if (!LOGOUT_PATH_RE.test(pathname)) continue;
    const res = flow.responses.find((r) => r.requestId === req.id);
    out.push({
      request: req,
      status: res?.status,
      clearedSessionCookie: didClearSession(res),
    });
  }
  return out;
}

function didClearSession(
  res: { headers: Record<string, { masked: string; raw?: string }> } | undefined,
): boolean | undefined {
  if (!res) return undefined;
  for (const [k, v] of Object.entries(res.headers)) {
    if (k.toLowerCase() !== 'set-cookie') continue;
    const value = v.raw ?? v.masked;
    if (/Max-Age=0\b|Expires=\s*(Thu, 01 Jan 1970|Mon, 01 Jan 1900)/i.test(value)) {
      return true;
    }
  }
  return undefined;
}

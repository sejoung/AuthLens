import {
  decodeJwt,
  extractJwtCandidates,
  looksLikeJwt,
  type AuthFlow,
  type DecodedJwt,
} from '@/core';

export type JwtSource =
  | 'request-header'
  | 'response-header'
  | 'response-body'
  | 'cookie'
  | 'storage-local'
  | 'storage-session';

export type JwtLocation = {
  source: JwtSource;
  /** 발견된 위치의 식별자: 헤더명/쿠키명/스토리지 키/요청 URL */
  label: string;
  /** 어느 request/response에서 나왔는지 (가능한 경우) */
  requestId?: string;
  decoded: DecodedJwt;
};

/**
 * 분석된 flow에서 raw JWT가 살아있는 모든 위치를 찾아 디코드해 반환한다.
 * masking 정책상 raw가 없으면(`policy.revealRaw=false`로 캡처) 디코드 불가.
 */
export function findJwts(flow: AuthFlow): JwtLocation[] {
  const out: JwtLocation[] = [];
  const seen = new Set<string>();

  const add = (loc: Omit<JwtLocation, 'decoded'> & { token: string }) => {
    if (seen.has(loc.token)) return;
    const decoded = decodeJwt(loc.token);
    if (!decoded) return;
    seen.add(loc.token);
    out.push({
      source: loc.source,
      label: loc.label,
      requestId: loc.requestId,
      decoded,
    });
  };

  // localStorage / sessionStorage
  for (const entry of flow.storageAfter.localStorage) {
    if (!entry.value.raw) continue;
    if (looksLikeJwt(entry.value.raw)) {
      add({ source: 'storage-local', label: entry.key, token: entry.value.raw });
    } else {
      for (const t of extractJwtCandidates(entry.value.raw)) {
        add({ source: 'storage-local', label: entry.key, token: t });
      }
    }
  }
  for (const entry of flow.storageAfter.sessionStorage) {
    if (!entry.value.raw) continue;
    if (looksLikeJwt(entry.value.raw)) {
      add({ source: 'storage-session', label: entry.key, token: entry.value.raw });
    } else {
      for (const t of extractJwtCandidates(entry.value.raw)) {
        add({ source: 'storage-session', label: entry.key, token: t });
      }
    }
  }

  // Cookies
  for (const cookie of flow.cookiesAfter) {
    if (!cookie.value.raw) continue;
    if (looksLikeJwt(cookie.value.raw)) {
      add({ source: 'cookie', label: cookie.name, token: cookie.value.raw });
    }
  }

  // Authorization headers in requests
  for (const req of flow.requests) {
    for (const [k, v] of Object.entries(req.headers)) {
      if (k.toLowerCase() !== 'authorization' || !v.raw) continue;
      const bearer = /^Bearer\s+(.+)$/i.exec(v.raw);
      const candidate = bearer ? bearer[1] : v.raw;
      if (candidate && looksLikeJwt(candidate)) {
        add({
          source: 'request-header',
          label: `${k} (${req.method} ${pathOf(req.url)})`,
          requestId: req.id,
          token: candidate,
        });
      }
    }
  }

  // Response bodies — scan for embedded JWTs (e.g. inside JSON `access_token` fields)
  for (const res of flow.responses) {
    const text = res.bodyPreview?.raw;
    if (!text) continue;
    for (const token of extractJwtCandidates(text)) {
      add({
        source: 'response-body',
        label: `${pathOf(res.url)} response`,
        requestId: res.requestId,
        token,
      });
    }
  }

  return out;
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

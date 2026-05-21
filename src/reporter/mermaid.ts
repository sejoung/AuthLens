import type { AuthEvent, AuthFlow } from '@/core';

/**
 * Mermaid sequenceDiagram 생성.
 *
 * 노드는 Browser, App, Auth, API 4개를 기본으로 두고
 * 인증 흐름에 중요한 이벤트만 화살표로 표현한다.
 */
export function generateMermaidDiagram(flow: AuthFlow): string {
  const lines: string[] = ['sequenceDiagram'];
  lines.push('  participant Browser');
  lines.push('  participant App');
  if (hasExternalIdpEvent(flow)) {
    lines.push('  participant Auth as Auth Server');
  }
  if (hasProfileApi(flow)) {
    lines.push('  participant API');
  }

  for (const event of flow.events) {
    const line = renderEvent(event, flow);
    if (line) lines.push('  ' + line);
  }

  return lines.join('\n');
}

function renderEvent(event: AuthEvent, flow: AuthFlow): string | undefined {
  switch (event.type) {
    case 'page_load': {
      return `Browser->>App: GET ${shortPath(event.url)}`;
    }
    case 'login_request_detected': {
      const req = flow.requests.find((r) => r.id === event.requestId);
      if (!req) return undefined;
      return `Browser->>App: ${req.method.toUpperCase()} ${shortPath(req.url)}`;
    }
    case 'redirect_detected': {
      const target = event.isCrossDomain ? 'Auth' : 'App';
      return `App->>${target}: ${event.status} → ${shortPath(event.toUrl)}`;
    }
    case 'cookie_changed': {
      if (event.change === 'added') {
        return `App-->>Browser: Set-Cookie ${event.cookieName}${event.httpOnly ? ' (HttpOnly)' : ''}`;
      }
      return undefined;
    }
    case 'token_stored': {
      return `Note over Browser: Token stored in ${event.storage} (${event.format})`;
    }
    case 'csrf_detected': {
      return `Note right of Browser: CSRF token via ${event.source}`;
    }
    case 'profile_request_detected': {
      return `Browser->>API: GET ${shortPath(event.url)}`;
    }
    case 'session_verified': {
      return `API-->>Browser: 200 (session verified)`;
    }
    case 'unknown':
      return undefined;
  }
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname || '/';
  } catch {
    // 너무 긴 URL은 잘라줌
    return url.length > 60 ? url.slice(0, 57) + '...' : url;
  }
}

function hasExternalIdpEvent(flow: AuthFlow): boolean {
  return flow.events.some(
    (e) => e.type === 'redirect_detected' && e.isCrossDomain,
  );
}

function hasProfileApi(flow: AuthFlow): boolean {
  return flow.events.some((e) => e.type === 'profile_request_detected');
}

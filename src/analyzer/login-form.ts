/**
 * 로그인 페이지의 HTML 응답에서 `<form>`을 추출해 login 메커니즘 분석.
 *
 * 정확한 HTML 파서 대신 regex로 추출 — 어차피 우리가 보는 건 응답 본문 미리보기
 * (8KB 캡)라 부분 파싱이면 충분. 안 잡히는 경우 undefined를 반환해 안전 fallback.
 */

import type { AuthFlow, ResponseRecord } from '@/core';

export type LoginFormField = {
  name: string;
  type: string; // text/password/email/hidden/...
  /** hidden input의 value (CSRF token 등 — 보통 raw로 들어옴) */
  value?: string;
};

export type LoginFormAnalysis = {
  /** form action URL (절대 또는 상대) */
  action?: string;
  /** form method (POST/GET) */
  method: string;
  fields: LoginFormField[];
  /** username-like 필드 이름 (있다면) */
  usernameFieldName?: string;
  /** password-like 필드 이름 */
  passwordFieldName?: string;
  /** CSRF/anti-XSRF hidden input 후보 */
  csrfField?: LoginFormField;
  /** 추출 출처: 어느 response 본문에서 왔는지 */
  fromResponseId: string;
  fromUrl: string;
};

const USERNAME_NAMES = /^(email|user(name)?|login|userid|user_id|account|id|name)$/i;
// password 필드는 `<input type="password">`로 식별 — 이름 패턴 매칭 불필요.
// substring-match: csrf/xsrf 변형 + 명시적으로 알려진 다른 토큰 이름들.
// `_token`은 너무 광범위해서 정확히 그 이름일 때만 매칭.
const CSRF_NAMES = /csrf|xsrf|authenticity[_-]?token|^_token$/i;

/**
 * 흐름 내 HTML 응답들에서 login form을 찾는다. 후보는:
 *   - `/login`, `/signin`, `/sign-in` 같은 URL의 GET response
 *   - 또는 `password` type input이 들어 있는 첫 HTML response
 */
export function findLoginForm(flow: AuthFlow): LoginFormAnalysis | undefined {
  const candidates = flow.responses
    .filter((r) => isHtml(r))
    .filter((r) => r.bodyPreview?.raw || r.bodyPreview?.masked);

  // 우선순위: URL이 login 관련이면 먼저, 다음으로는 password 필드가 있는 응답
  candidates.sort((a, b) => {
    const aLogin = isLoginUrl(a.url);
    const bLogin = isLoginUrl(b.url);
    if (aLogin !== bLogin) return aLogin ? -1 : 1;
    return 0;
  });

  for (const res of candidates) {
    const html = res.bodyPreview?.raw ?? res.bodyPreview?.masked ?? '';
    const form = extractForm(html);
    if (!form) continue;
    if (!form.fields.some((f) => f.type.toLowerCase() === 'password')) continue;

    const usernameField = form.fields.find((f) => USERNAME_NAMES.test(f.name));
    const passwordField = form.fields.find((f) => f.type.toLowerCase() === 'password');
    const csrfField = form.fields.find(
      (f) => f.type.toLowerCase() === 'hidden' && CSRF_NAMES.test(f.name),
    );

    return {
      action: form.action,
      method: form.method,
      fields: form.fields,
      usernameFieldName: usernameField?.name,
      passwordFieldName: passwordField?.name,
      csrfField,
      fromResponseId: res.id,
      fromUrl: res.url,
    };
  }
  return undefined;
}

function isHtml(res: ResponseRecord): boolean {
  const ct = res.contentType?.toLowerCase() ?? '';
  return ct.includes('text/html') || ct.includes('application/xhtml');
}

function isLoginUrl(url: string): boolean {
  try {
    const p = new URL(url).pathname.toLowerCase();
    return /\/(login|signin|sign-in|sign_in|auth)\b/.test(p);
  } catch {
    return false;
  }
}

type ExtractedForm = {
  action?: string;
  method: string;
  fields: LoginFormField[];
};

/** 첫 `<form>`만 추출 (가장 단순한 휴리스틱). */
function extractForm(html: string): ExtractedForm | undefined {
  const formMatch = /<form\b([^>]*)>([\s\S]*?)<\/form>/i.exec(html);
  if (!formMatch) return undefined;
  const attrs = parseAttrs(formMatch[1] ?? '');
  const body = formMatch[2] ?? '';
  const fields: LoginFormField[] = [];

  for (const m of body.matchAll(/<input\b([^>]*)\/?>/gi)) {
    const a = parseAttrs(m[1] ?? '');
    if (!a.name) continue;
    fields.push({
      name: a.name,
      type: a.type ?? 'text',
      value: a.type === 'hidden' ? a.value : undefined,
    });
  }
  // <select>, <textarea>도 잡아 보조
  for (const m of body.matchAll(/<(select|textarea)\b([^>]*)>/gi)) {
    const a = parseAttrs(m[2] ?? '');
    if (!a.name) continue;
    if (fields.some((f) => f.name === a.name)) continue;
    fields.push({ name: a.name, type: m[1]?.toLowerCase() ?? 'text' });
  }

  return {
    action: attrs.action,
    method: (attrs.method ?? 'GET').toUpperCase(),
    fields,
  };
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  // matches: name="value", name='value', name=value (no quotes)
  const re = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const key = m[1]?.toLowerCase();
    if (!key) continue;
    out[key] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

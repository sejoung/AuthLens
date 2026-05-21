import type { RequestRecord } from '@/core';

export type CodeExportOptions = {
  /** raw 헤더/바디를 포함할지 (기본 false → 마스킹된 값으로 출력). */
  includeRaw?: boolean;
};

/**
 * RequestRecord를 curl 명령어로 변환.
 * 민감 헤더는 기본적으로 마스킹된 값 사용.
 */
export function toCurlCommand(
  req: RequestRecord,
  opts: CodeExportOptions = {},
): string {
  const parts: string[] = [`curl -X ${req.method.toUpperCase()} \\`];
  parts.push(`  ${quote(req.url)} \\`);

  for (const [key, value] of Object.entries(req.headers)) {
    const display = opts.includeRaw && value.raw ? value.raw : value.masked;
    parts.push(`  -H ${quote(`${key}: ${display}`)} \\`);
  }

  if (req.postData) {
    const body =
      opts.includeRaw && req.postData.raw ? req.postData.raw : req.postData.masked;
    parts.push(`  --data ${quote(body)} \\`);
  }

  // 마지막 line continuation 제거
  const last = parts[parts.length - 1];
  if (last && last.endsWith(' \\')) {
    parts[parts.length - 1] = last.slice(0, -2);
  }
  return parts.join('\n');
}

/**
 * RequestRecord를 fetch() 호출로 변환.
 */
export function toFetchSnippet(
  req: RequestRecord,
  opts: CodeExportOptions = {},
): string {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    headers[key] = opts.includeRaw && value.raw ? value.raw : value.masked;
  }
  const options: Record<string, unknown> = {
    method: req.method.toUpperCase(),
  };
  if (Object.keys(headers).length > 0) options.headers = headers;
  if (req.postData) {
    options.body =
      opts.includeRaw && req.postData.raw ? req.postData.raw : req.postData.masked;
  }
  return `await fetch(${quote(req.url)}, ${JSON.stringify(options, null, 2)});`;
}

function quote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

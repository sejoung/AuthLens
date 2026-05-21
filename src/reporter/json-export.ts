import { SCHEMA_VERSION, TOOL_NAME, TOOL_VERSION } from '@/core';
import type { AuthFlow } from '@/core';

export type JsonExportOptions = {
  /** raw 값 포함 여부 — 기본 false. */
  includeRaw?: boolean;
};

export type AuthFlowExport = {
  schemaVersion: string;
  tool: string;
  toolVersion: string;
  generatedAt: string;
  flow: AuthFlow;
  /** raw가 export에 포함됐는지 명시. UI에서 경고 표시용. */
  rawIncluded: boolean;
};

/**
 * AuthFlow를 JSON 직렬화 가능한 export 객체로 변환.
 * includeRaw=false인 경우 모든 raw 값을 제거.
 */
export function generateJsonExport(
  flow: AuthFlow,
  opts: JsonExportOptions = {},
): AuthFlowExport {
  const cleaned = opts.includeRaw ? flow : stripRaw(flow);
  return {
    schemaVersion: SCHEMA_VERSION,
    tool: TOOL_NAME,
    toolVersion: TOOL_VERSION,
    generatedAt: new Date().toISOString(),
    flow: cleaned,
    rawIncluded: opts.includeRaw === true,
  };
}

export function stringifyJsonExport(
  flow: AuthFlow,
  opts: JsonExportOptions = {},
  indent = 2,
): string {
  return JSON.stringify(generateJsonExport(flow, opts), null, indent);
}

function stripRaw<T>(value: T): T {
  return deepStripRaw(value) as T;
}

function deepStripRaw(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(deepStripRaw);
  if (typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'raw') {
      // SensitiveValue.raw 필드는 제거
      continue;
    }
    out[k] = deepStripRaw(v);
  }
  return out;
}

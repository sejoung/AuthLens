/**
 * Crypto.randomUUID이 없는 환경(node <19 등) 대비를 위해 fallback 제공.
 */
export function generateId(prefix?: string): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const raw = g.crypto?.randomUUID
    ? g.crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return prefix ? `${prefix}_${raw}` : raw;
}

export function nowIso(): string {
  return new Date().toISOString();
}

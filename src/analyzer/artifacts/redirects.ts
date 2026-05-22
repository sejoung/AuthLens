import { REDIRECT_STATUS_CODES } from '@/core';
import type { RedirectStep, ResponseRecord } from '@/core';

export function extractRedirects(responses: ResponseRecord[]): RedirectStep[] {
  const out: RedirectStep[] = [];
  for (const res of responses) {
    if (!REDIRECT_STATUS_CODES.has(res.status)) continue;
    const location = Object.entries(res.headers).find(
      ([k]) => k.toLowerCase() === 'location',
    )?.[1]?.masked;
    if (!location) continue;
    const toUrl = absoluteUrl(location, res.url);
    out.push({
      fromUrl: res.url,
      toUrl,
      status: res.status,
      timestamp: res.timestamp,
    });
  }
  return out;
}

function absoluteUrl(target: string, base: string): string {
  try {
    return new URL(target, base).toString();
  } catch {
    return target;
  }
}

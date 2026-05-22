import type {
  CookieDiff,
  CookieSnapshot,
  StorageDiff,
  StorageEntry,
  StorageSnapshot,
} from '@/core';

function cookieKey(c: CookieSnapshot): string {
  return `${c.name}|${c.domain}|${c.path}`;
}

export function diffCookies(
  before: CookieSnapshot[],
  after: CookieSnapshot[],
): CookieDiff {
  const beforeMap = new Map<string, CookieSnapshot>();
  for (const c of before) beforeMap.set(cookieKey(c), c);
  const afterMap = new Map<string, CookieSnapshot>();
  for (const c of after) afterMap.set(cookieKey(c), c);

  const added: CookieSnapshot[] = [];
  const removed: CookieSnapshot[] = [];
  const changed: Array<{ before: CookieSnapshot; after: CookieSnapshot }> = [];

  for (const [key, cookie] of afterMap) {
    const prev = beforeMap.get(key);
    if (!prev) {
      added.push(cookie);
    } else if (cookieDiffers(prev, cookie)) {
      changed.push({ before: prev, after: cookie });
    }
  }
  for (const [key, cookie] of beforeMap) {
    if (!afterMap.has(key)) {
      removed.push(cookie);
    }
  }

  return { added, removed, changed };
}

function cookieDiffers(a: CookieSnapshot, b: CookieSnapshot): boolean {
  if (a.value.masked !== b.value.masked) return true;
  if (a.httpOnly !== b.httpOnly) return true;
  if (a.secure !== b.secure) return true;
  if (a.sameSite !== b.sameSite) return true;
  if (a.expires !== b.expires) return true;
  return false;
}

function entryDiff(
  before: StorageEntry[],
  after: StorageEntry[],
): {
  added: StorageEntry[];
  removed: StorageEntry[];
  changed: Array<{ before: StorageEntry; after: StorageEntry }>;
} {
  const beforeMap = new Map<string, StorageEntry>();
  for (const e of before) beforeMap.set(e.key, e);
  const afterMap = new Map<string, StorageEntry>();
  for (const e of after) afterMap.set(e.key, e);

  const added: StorageEntry[] = [];
  const removed: StorageEntry[] = [];
  const changed: Array<{ before: StorageEntry; after: StorageEntry }> = [];

  for (const [key, entry] of afterMap) {
    const prev = beforeMap.get(key);
    if (!prev) {
      added.push(entry);
    } else if (prev.value.masked !== entry.value.masked) {
      changed.push({ before: prev, after: entry });
    }
  }
  for (const [key, entry] of beforeMap) {
    if (!afterMap.has(key)) removed.push(entry);
  }
  return { added, removed, changed };
}

export function diffStorage(
  before: StorageSnapshot,
  after: StorageSnapshot,
): StorageDiff {
  return {
    localStorage: entryDiff(before.localStorage, after.localStorage),
    sessionStorage: entryDiff(before.sessionStorage, after.sessionStorage),
  };
}

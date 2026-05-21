import type { SensitiveValue } from './sensitive.js';

export type SameSitePolicy = 'Strict' | 'Lax' | 'None';

export type CookieSnapshot = {
  name: string;
  domain: string;
  path: string;
  value: SensitiveValue;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: SameSitePolicy;
  expires?: number;
};

export type StorageEntry = {
  key: string;
  value: SensitiveValue;
};

export type StorageSnapshot = {
  localStorage: StorageEntry[];
  sessionStorage: StorageEntry[];
};

export type CookieDiff = {
  added: CookieSnapshot[];
  removed: CookieSnapshot[];
  changed: Array<{
    before: CookieSnapshot;
    after: CookieSnapshot;
  }>;
};

export type StorageDiff = {
  localStorage: {
    added: StorageEntry[];
    removed: StorageEntry[];
    changed: Array<{ before: StorageEntry; after: StorageEntry }>;
  };
  sessionStorage: {
    added: StorageEntry[];
    removed: StorageEntry[];
    changed: Array<{ before: StorageEntry; after: StorageEntry }>;
  };
};

import { AuthLensError, toSensitiveValue, generateId } from '@/core';
import type {
  CookieSnapshot,
  StorageEntry,
  StorageSnapshot,
} from '@/core';
import type { RawCapture, RecorderOptions } from './types.js';
import { DEFAULT_RECORDER_OPTIONS } from './types.js';
import { InMemoryRecorder } from './in-memory-recorder.js';

/**
 * Playwright를 사용한 캡처 세션.
 *
 * 사용 예:
 *   const session = await PlaywrightCaptureSession.start('https://app.example.com', {});
 *   // 사용자가 직접 브라우저에서 로그인 수행
 *   const raw = await session.stop();
 */
export class PlaywrightCaptureSession {
  private constructor(
    public readonly targetUrl: string,
    private readonly browser: PWBrowser,
    private readonly context: PWBrowserContext,
    private readonly page: PWPage,
    private readonly recorder: InMemoryRecorder,
    private readonly requestIdMap: Map<unknown, string>,
    private readonly options: RecorderOptions,
  ) {}

  static async start(
    targetUrl: string,
    options: RecorderOptions = {},
  ): Promise<PlaywrightCaptureSession> {
    let playwright: PWModule;
    try {
      // eslint-disable-next-line @typescript-eslint/consistent-type-imports
      playwright = (await import('playwright')) as unknown as PWModule;
    } catch (e) {
      throw new AuthLensError(
        'BrowserLaunchFailed',
        'Playwright is not installed. Run `npm install playwright`.',
      );
    }
    let browser: PWBrowser;
    try {
      browser = await playwright.chromium.launch({
        headless: options.headful === false,
      });
    } catch (e) {
      throw new AuthLensError(
        'BrowserLaunchFailed',
        (e as Error).message,
      );
    }

    const merged = { ...DEFAULT_RECORDER_OPTIONS, ...options };
    const context = await browser.newContext({
      viewport: merged.viewport,
      userAgent: merged.userAgent,
    });
    const page = await context.newPage();

    const recorder = new InMemoryRecorder(targetUrl, merged);
    const requestIdMap = new Map<unknown, string>();

    page.on('request', (req: PWRequest) => {
      try {
        const headers = req.headers();
        const record = recorder.recordRequest({
          url: req.url(),
          method: req.method(),
          headers,
          postData: req.postData() ?? undefined,
          resourceType: req.resourceType(),
          frameUrl: safeFrameUrl(req),
        });
        requestIdMap.set(req, record.id);
      } catch {
        // 안전: 캡처 중 에러는 침묵 (단 로그는 남기지 않음 — 정책)
      }
    });

    page.on('response', async (res: PWResponse) => {
      try {
        const req = res.request();
        const requestId = requestIdMap.get(req);
        if (!requestId) return;
        const contentType =
          res.headers()['content-type'] ?? res.headers()['Content-Type'];
        let body: string | undefined;
        let bodySize: number | undefined;
        if (!isBinaryContentType(contentType)) {
          try {
            const buf = await res.body();
            bodySize = buf.length;
            body = buf
              .slice(0, merged.bodyPreviewLimit)
              .toString('utf8');
          } catch {
            // 일부 응답은 body 읽을 수 없음 (e.g. 304)
          }
        }
        recorder.attachResponse({
          requestId,
          url: res.url(),
          status: res.status(),
          statusText: res.statusText(),
          headers: res.headers(),
          body,
          bodySize,
          contentType,
        });
      } catch {
        // 침묵
      }
    });

    // before snapshot
    const cookiesBefore = mapCookies(await context.cookies());
    recorder.setCookiesBefore(cookiesBefore);
    recorder.setStorageBefore({ localStorage: [], sessionStorage: [] });

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    return new PlaywrightCaptureSession(
      targetUrl,
      browser,
      context,
      page,
      recorder,
      requestIdMap,
      merged,
    );
  }

  stats() {
    return this.recorder.stats();
  }

  async stop(): Promise<RawCapture> {
    let storage: StorageSnapshot = { localStorage: [], sessionStorage: [] };
    try {
      const data = await this.page.evaluate<{
        localStorage: Array<{ key: string; value: string }>;
        sessionStorage: Array<{ key: string; value: string }>;
      }>(
        '(() => {' +
          'const dump = (s) => { const out = []; for (let i=0;i<s.length;i++) { const k=s.key(i); if (k!=null) out.push({key:k,value:s.getItem(k)||""}); } return out; };' +
          'return { localStorage: dump(localStorage), sessionStorage: dump(sessionStorage) };' +
          '})()',
      );
      storage = {
        localStorage: data.localStorage.map(toStorageEntry),
        sessionStorage: data.sessionStorage.map(toStorageEntry),
      };
    } catch {
      // 일부 페이지는 storage 접근 불가 (cross-origin) — 비워둠
    }
    this.recorder.setStorageAfter(storage);

    try {
      const cookiesAfter = mapCookies(await this.context.cookies());
      this.recorder.setCookiesAfter(cookiesAfter);
    } catch {
      // 무시
    }

    const raw = this.recorder.stop();
    try {
      await this.context.close();
    } finally {
      await this.browser.close();
    }
    return raw;
  }
}

function toStorageEntry(e: { key: string; value: string }): StorageEntry {
  return {
    key: e.key,
    value: toSensitiveValue(e.key, e.value),
  };
}

function mapCookies(raw: PWCookie[]): CookieSnapshot[] {
  return raw.map((c) => ({
    name: c.name,
    domain: c.domain,
    path: c.path,
    value: toSensitiveValue(c.name, c.value),
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: normalizeSameSite(c.sameSite),
    expires: c.expires === -1 ? undefined : c.expires,
  }));
}

function normalizeSameSite(
  v: PWCookie['sameSite'],
): 'Strict' | 'Lax' | 'None' | undefined {
  if (!v) return undefined;
  const lower = String(v).toLowerCase();
  if (lower === 'strict') return 'Strict';
  if (lower === 'lax') return 'Lax';
  if (lower === 'none') return 'None';
  return undefined;
}

function isBinaryContentType(ct?: string): boolean {
  if (!ct) return false;
  const lower = ct.toLowerCase();
  return (
    lower.startsWith('image/') ||
    lower.startsWith('video/') ||
    lower.startsWith('audio/') ||
    lower.startsWith('font/') ||
    lower.startsWith('application/octet-stream')
  );
}

function safeFrameUrl(req: PWRequest): string | undefined {
  try {
    return req.frame()?.url();
  } catch {
    return undefined;
  }
}

// Type aliases to avoid hard dependency on playwright types.
// Adapter only uses subset of API. These mirror Playwright's shape.
type PWBrowser = {
  newContext(opts: {
    viewport?: { width: number; height: number };
    userAgent?: string;
  }): Promise<PWBrowserContext>;
  close(): Promise<void>;
};
type PWBrowserContext = {
  newPage(): Promise<PWPage>;
  cookies(): Promise<PWCookie[]>;
  close(): Promise<void>;
};
type PWPage = {
  on(event: 'request', cb: (req: PWRequest) => void): void;
  on(event: 'response', cb: (res: PWResponse) => void): void;
  goto(url: string, opts?: { waitUntil?: string }): Promise<unknown>;
  evaluate<T>(script: string): Promise<T>;
};
type PWRequest = {
  url(): string;
  method(): string;
  headers(): Record<string, string>;
  postData(): string | null;
  resourceType(): string;
  frame(): { url(): string } | null;
};
type PWResponse = {
  request(): PWRequest;
  url(): string;
  status(): number;
  statusText(): string;
  headers(): Record<string, string>;
  body(): Promise<Buffer>;
};
type PWCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: string;
  expires?: number;
};
type PWModule = {
  chromium: {
    launch(opts: { headless?: boolean }): Promise<PWBrowser>;
  };
};

// Defensive: prevent eslint unused
void generateId;

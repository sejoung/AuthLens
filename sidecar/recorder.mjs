#!/usr/bin/env node
/**
 * AuthLens Playwright sidecar.
 *
 * Usage:
 *   node sidecar/recorder.mjs <target-url> [--headless] [--body-limit <bytes>]
 *
 * Streams NDJSON events to stdout:
 *   {"type":"started","target":"...","startedAt":"..."}
 *   {"type":"request","payload":{...}}
 *   {"type":"response","payload":{...}}
 *   {"type":"finished","payload":{rawCapture...}}
 *   {"type":"error","message":"..."}
 *
 * Reads commands from stdin (line-delimited):
 *   "stop"   — finalize capture, write `finished` event, exit cleanly.
 */

import { chromium } from 'playwright';
import readline from 'node:readline';

const args = process.argv.slice(2);
const target = args[0];
if (!target) {
  emit({ type: 'error', message: 'Missing target URL argument' });
  process.exit(1);
}

const headless = args.includes('--headless');
const bodyLimitIdx = args.indexOf('--body-limit');
const bodyLimit = bodyLimitIdx >= 0 ? Number(args[bodyLimitIdx + 1]) || 8192 : 8192;

function emit(event) {
  try {
    process.stdout.write(JSON.stringify(event) + '\n');
  } catch (e) {
    // stdout may have been closed by parent — nothing we can do.
  }
}

/**
 * Like emit(), but resolves only after the data has been handed to the OS.
 * Use for the final `finished` event so it isn't truncated when we exit.
 *
 * `process.exit()` does not wait for stdout to drain — calling exit right after
 * a plain write can lose the trailing line. The write callback fires after the
 * data is flushed to the kernel pipe buffer, which is the guarantee we need.
 */
function emitFlush(event) {
  return new Promise((resolve) => {
    try {
      process.stdout.write(JSON.stringify(event) + '\n', () => resolve());
    } catch {
      resolve();
    }
  });
}

function isBinaryContentType(ct) {
  if (!ct) return false;
  const lower = String(ct).toLowerCase();
  return [
    'image/',
    'video/',
    'audio/',
    'font/',
    'application/octet-stream',
    'application/pdf',
    'application/zip',
  ].some((p) => lower.startsWith(p));
}

function nowIso() {
  return new Date().toISOString();
}

let reqCounter = 0;
let resCounter = 0;
const requestIds = new WeakMap();
const requests = [];
const responses = [];

let browser, context, page;

async function main() {
  const startedAt = nowIso();

  try {
    browser = await chromium.launch({ headless });
  } catch (e) {
    emit({ type: 'error', message: `BrowserLaunchFailed: ${e.message ?? e}` });
    process.exit(2);
  }

  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const cookiesBefore = (await context.cookies()).map(toCookieDto);

  page = await context.newPage();

  page.on('request', (req) => {
    try {
      const id = `req-${++reqCounter}`;
      const record = {
        id,
        url: req.url(),
        method: req.method(),
        headers: req.headers(),
        postData: req.postData() ?? undefined,
        resourceType: req.resourceType(),
        timestamp: nowIso(),
        frameUrl: safeFrameUrl(req),
      };
      requestIds.set(req, id);
      requests.push(record);
      emit({ type: 'request', payload: record });
    } catch {
      /* ignore */
    }
  });

  page.on('response', async (res) => {
    try {
      const req = res.request();
      const requestId = requestIds.get(req);
      if (!requestId) return;
      const headers = res.headers();
      const contentType = headers['content-type'] ?? headers['Content-Type'];
      const isBin = isBinaryContentType(contentType);
      let body, bodySize;
      if (!isBin) {
        try {
          const buf = await res.body();
          bodySize = buf.length;
          body = buf.slice(0, bodyLimit).toString('utf8');
        } catch {
          /* may fail for cached/redirect responses */
        }
      }
      const record = {
        id: `res-${++resCounter}`,
        requestId,
        url: res.url(),
        status: res.status(),
        statusText: res.statusText(),
        headers,
        contentType,
        body,
        bodySize,
        isBinary: isBin,
        timestamp: nowIso(),
      };
      responses.push(record);
      emit({ type: 'response', payload: record });
    } catch {
      /* ignore */
    }
  });

  try {
    await page.goto(target, { waitUntil: 'domcontentloaded' });
  } catch (e) {
    // Page may still be useful; just report.
    emit({ type: 'error', message: `navigation: ${e.message ?? e}` });
  }

  emit({ type: 'started', target, startedAt });

  // Wait for "stop" command on stdin.
  await waitForStop();

  // Final snapshots — each guarded by a timeout so a wedged/closed browser
  // can never block the `finished` event from being emitted.
  let storage = { localStorage: [], sessionStorage: [] };
  try {
    storage = await withTimeout(
      page.evaluate(() => {
        const dump = (s) => {
          const out = [];
          for (let i = 0; i < s.length; i++) {
            const k = s.key(i);
            if (k != null) out.push({ key: k, value: s.getItem(k) ?? '' });
          }
          return out;
        };
        return {
          localStorage: dump(localStorage),
          sessionStorage: dump(sessionStorage),
        };
      }),
      5000,
    );
  } catch (e) {
    process.stderr.write(`storage snapshot failed: ${e.message ?? e}\n`);
  }

  let cookiesAfter = [];
  try {
    cookiesAfter = (await withTimeout(context.cookies(), 3000)).map(toCookieDto);
  } catch (e) {
    process.stderr.write(`cookie snapshot failed: ${e.message ?? e}\n`);
  }

  // Flush the final event before tearing down — process.exit can drop
  // unflushed stdout.
  await emitFlush({
    type: 'finished',
    payload: {
      target,
      startedAt,
      endedAt: nowIso(),
      requests,
      responses,
      cookiesBefore,
      cookiesAfter,
      storage,
    },
  });

  // Browser teardown — give Playwright plenty of time. Force-exiting while
  // Chromium is still cleaning up its child processes / GPU helpers leaves
  // orphaned processes and triggers OS "browser quit unexpectedly" dialogs.
  try {
    await withTimeout(context.close(), 10000);
  } catch (e) {
    process.stderr.write(`context.close failed: ${e.message ?? e}\n`);
  }
  try {
    await withTimeout(browser.close(), 10000);
  } catch (e) {
    process.stderr.write(`browser.close failed: ${e.message ?? e}\n`);
  }
  // Fallback force-exit only if the event loop hasn't drained after 5s
  // (we already flushed `finished` via emitFlush, so stdout is safe).
  setTimeout(() => process.exit(0), 5000).unref();
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

function waitForStop() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin });
    rl.on('line', (line) => {
      if (line.trim() === 'stop') {
        rl.close();
        resolve();
      }
    });
    rl.on('close', () => resolve());
  });
}

function toCookieDto(c) {
  return {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite,
    expires: c.expires === -1 ? undefined : c.expires,
  };
}

function safeFrameUrl(req) {
  try {
    return req.frame()?.url();
  } catch {
    return undefined;
  }
}

process.on('SIGTERM', async () => {
  try { await context?.close(); } catch {}
  try { await browser?.close(); } catch {}
  process.exit(0);
});

main().catch((e) => {
  emit({ type: 'error', message: `fatal: ${e.message ?? e}` });
  process.exit(3);
});

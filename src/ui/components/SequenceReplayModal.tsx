import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RequestRecord } from '@/core';
import {
  isTauri,
  replayQuota,
  replaySend,
  type ReplayQuota,
  type ReplayResponse,
} from '../tauri/bridge.js';
import { Spinner } from './Spinner.js';

type StepResult =
  | { state: 'pending' }
  | { state: 'running' }
  | { state: 'done'; response: ReplayResponse; retried?: boolean }
  | { state: 'error'; error: string };

type Props = {
  /** Initial sequence of requests to replay, in order. */
  requests: RequestRecord[];
  showRaw: boolean;
  onClose: () => void;
};

/**
 * Sequence replay sandbox — runs multiple captured requests in order with
 * mandatory cooldown between sends (server-enforced) and a per-session cap
 * (also server-enforced). On 401, optionally retries by first replaying a
 * user-marked "refresh" step.
 *
 * Intentionally light on features compared to writing a Newman/Playwright
 * script — the sandbox cap (10 sends/session) means this is *only* useful
 * for confirming a small sequence still works after a change. Anything
 * larger should be exported to Postman.
 */
export function SequenceReplayModal({ requests, showRaw, onClose }: Props) {
  const { t } = useTranslation();
  const [hostAuthorized, setHostAuthorized] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshIndex, setRefreshIndex] = useState<number>(() => guessRefreshIndex(requests));
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<StepResult[]>(() => requests.map(() => ({ state: 'pending' })));
  const [quota, setQuota] = useState<ReplayQuota | undefined>();
  const [error, setError] = useState<string | undefined>();

  const sequence = requests;
  const distinctHosts = useMemo(() => {
    const s = new Set<string>();
    for (const r of sequence) {
      try { s.add(new URL(r.url).host); } catch { /* ignore */ }
    }
    return [...s];
  }, [sequence]);

  useEffect(() => {
    if (!isTauri()) return;
    void replayQuota().then(setQuota).catch(() => undefined);
  }, []);

  const liveReady =
    isTauri() &&
    hostAuthorized &&
    (quota?.remaining ?? 0) >= sequence.length &&
    sequence.length > 0;

  async function run() {
    setError(undefined);
    setRunning(true);
    const next: StepResult[] = sequence.map(() => ({ state: 'pending' }));
    setResults([...next]);

    try {
      for (let i = 0; i < sequence.length; i++) {
        next[i] = { state: 'running' };
        setResults([...next]);
        const step = sequence[i]!;
        const resp = await sendStep(step, showRaw);
        next[i] = { state: 'done', response: resp };
        setResults([...next]);

        // Auto-refresh on 401 — replay the refresh step then retry once.
        if (
          autoRefresh &&
          resp.status === 401 &&
          refreshIndex >= 0 &&
          refreshIndex !== i &&
          !((next[i] as { retried?: boolean }).retried)
        ) {
          const refreshStep = sequence[refreshIndex];
          if (refreshStep) {
            await sendStep(refreshStep, showRaw);
            const retry = await sendStep(step, showRaw);
            next[i] = { state: 'done', response: retry, retried: true };
            setResults([...next]);
          }
        }

        // Refresh quota after each call. Server-side cooldown is enforced;
        // if we're up against it the next replaySend will surface an error
        // which we'll catch below.
        try {
          setQuota(await replayQuota());
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="seq-replay-title">
      <div className="modal modal--wide">
        <div className="row row--between" style={{ marginBottom: 'var(--space-3)' }}>
          <h2 className="modal__title" id="seq-replay-title">
            {t('sequenceReplay.title')} <span className="badge badge--warning">Labs</span>
          </h2>
          <button className="btn btn--secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>

        <p className="muted text-sm">{t('sequenceReplay.lede')}</p>

        <div className="card" style={{ marginTop: 'var(--space-3)' }}>
          <table className="request-list">
            <thead>
              <tr>
                <th style={{ width: 28 }}>#</th>
                <th className="col-method">{t('capture.headerMethod')}</th>
                <th>URL</th>
                <th style={{ width: 90 }}>{t('sequenceReplay.refresh')}</th>
                <th style={{ width: 220 }}>{t('sequenceReplay.result')}</th>
              </tr>
            </thead>
            <tbody>
              {sequence.map((r, i) => (
                <tr key={r.id}>
                  <td className="muted text-xs">{i + 1}</td>
                  <td className="col-method"><span className="badge badge--info">{r.method}</span></td>
                  <td><code title={r.url}>{shortUrl(r.url)}</code></td>
                  <td>
                    <label className="row text-xs" style={{ gap: 4 }}>
                      <input
                        type="radio"
                        name="seq-refresh"
                        checked={refreshIndex === i}
                        onChange={() => setRefreshIndex(i)}
                        disabled={running}
                      />
                      {t('sequenceReplay.markRefresh')}
                    </label>
                  </td>
                  <td><ResultCell r={results[i] ?? { state: 'pending' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ marginTop: 'var(--space-3)' }}>
          <div className="stack" style={{ gap: 'var(--space-3)' }}>
            <label className="row text-sm" style={{ gap: 6 }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                disabled={running}
              />
              {t('sequenceReplay.autoRefreshLabel')}
            </label>
            <label className="row text-sm" style={{ gap: 6 }}>
              <input
                type="checkbox"
                checked={hostAuthorized}
                onChange={(e) => setHostAuthorized(e.target.checked)}
                disabled={running}
              />
              <span>
                {t('sequenceReplay.authorizeHosts', { hosts: distinctHosts.join(', ') || '—' })}
              </span>
            </label>
            <div className="muted text-xs">
              {t('sequenceReplay.quotaLine', {
                remaining: quota?.remaining ?? '?',
                cap: quota?.cap ?? '?',
                cooldown: quota?.cooldownMs ?? 1500,
              })}
            </div>
            {error && <div className="badge badge--danger">{error}</div>}
          </div>
          <div className="row row--end" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <button className="btn btn--secondary" onClick={onClose} disabled={running}>
              {t('common.close')}
            </button>
            <button
              className="btn btn--primary"
              onClick={() => void run()}
              disabled={running || !liveReady}
            >
              {running ? <Spinner /> : null}
              {running ? t('sequenceReplay.running') : t('sequenceReplay.runButton', { count: sequence.length })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultCell({ r }: { r: StepResult }) {
  const { t } = useTranslation();
  if (r.state === 'pending') return <span className="muted text-xs">—</span>;
  if (r.state === 'running')
    return (
      <span className="row text-xs" style={{ gap: 4 }}>
        <Spinner />
        {t('sequenceReplay.runningStep')}
      </span>
    );
  if (r.state === 'error') return <span className="badge badge--danger">{r.error}</span>;
  const cls = r.response.status >= 500
    ? 'danger'
    : r.response.status >= 400
      ? 'warning'
      : r.response.status >= 300
        ? 'info'
        : 'success';
  return (
    <span className="row text-xs" style={{ gap: 4, alignItems: 'center' }}>
      <span className={`badge badge--${cls}`}>{r.response.status}</span>
      <span className="muted">{r.response.durationMs}ms</span>
      {r.retried && <span className="badge badge--info">{t('sequenceReplay.retried')}</span>}
    </span>
  );
}

async function sendStep(request: RequestRecord, showRaw: boolean): Promise<ReplayResponse> {
  return replaySend({
    method: request.method.toUpperCase(),
    url: request.url,
    headers: serializeHeadersFor(request, showRaw),
    body: request.postData ? (showRaw && request.postData.raw) || request.postData.masked : undefined,
  });
}

function serializeHeadersFor(req: RequestRecord, showRaw: boolean): Array<[string, string]> {
  return Object.entries(req.headers).map(([k, v]) => [k, showRaw && v.raw ? v.raw : v.masked]);
}

/** Heuristic — if any step looks like a token/refresh endpoint, mark it. */
function guessRefreshIndex(requests: RequestRecord[]): number {
  const idx = requests.findIndex((r) => /\/(token|refresh)\b/i.test(r.url));
  return idx;
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url;
  }
}

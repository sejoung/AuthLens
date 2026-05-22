import { useEffect, useState } from 'react';
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

type Props = {
  request: RequestRecord;
  showRaw: boolean;
  onClose: () => void;
};

type Mode = 'dry-run' | 'live';

/**
 * Replay sandbox modal — opens from a Discovered API endpoint row when the
 * experimental setting is on. All sends require explicit per-host authorization;
 * dry-run preview is always available without enabling live mode.
 */
export function ReplayModal({ request, showRaw, onClose }: Props) {
  const { t } = useTranslation();
  const [method, setMethod] = useState(request.method.toUpperCase());
  const [url, setUrl] = useState(request.url);
  const [headersText, setHeadersText] = useState(serializeHeaders(request, showRaw));
  const [body, setBody] = useState(
    request.postData ? (showRaw && request.postData.raw) || request.postData.masked : '',
  );
  const [mode, setMode] = useState<Mode>('dry-run');
  const [authorizedHost, setAuthorizedHost] = useState<string | undefined>();
  const [quota, setQuota] = useState<ReplayQuota | undefined>();
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<ReplayResponse | undefined>();
  const [error, setError] = useState<string | undefined>();

  const targetHost = (() => {
    try {
      return new URL(url).host;
    } catch {
      return undefined;
    }
  })();

  useEffect(() => {
    if (!isTauri()) return;
    void replayQuota().then(setQuota).catch(() => {
      /* not fatal */
    });
  }, []);

  // Authorization is for a specific host. Changing URL to a different host
  // resets the authorization checkbox.
  useEffect(() => {
    if (authorizedHost && authorizedHost !== targetHost) {
      setAuthorizedHost(undefined);
    }
  }, [targetHost, authorizedHost]);

  const liveAllowed =
    mode === 'live' &&
    targetHost !== undefined &&
    authorizedHost === targetHost &&
    isTauri() &&
    (quota?.remaining ?? 0) > 0;

  const send = async () => {
    setError(undefined);
    if (mode === 'dry-run') {
      // Dry-run never hits the network.
      setResponse({
        status: 0,
        statusText: t('replay.dryRunStatus'),
        headers: [],
        body: t('replay.dryRunBody'),
        bodyTruncated: false,
        durationMs: 0,
        finalUrl: url,
      });
      return;
    }
    if (!liveAllowed) return;
    setSending(true);
    try {
      const result = await replaySend({
        method,
        url,
        headers: parseHeaders(headersText),
        body: body || undefined,
      });
      setResponse(result);
      // refresh quota
      try {
        setQuota(await replayQuota());
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="replay-title">
      <div className="modal modal--wide">
        <div className="row row--between" style={{ marginBottom: 'var(--space-3)' }}>
          <h2 className="modal__title" id="replay-title">
            {t('replay.title')} <span className="badge badge--warning">Labs</span>
          </h2>
          <button className="btn btn--secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>

        <div className="reveal-warning" style={{ marginBottom: 'var(--space-3)' }}>
          {t('replay.labsWarning')}
        </div>

        <div className="replay-editor">
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <select
              className="input"
              style={{ maxWidth: 110 }}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/endpoint"
            />
          </div>

          <label className="text-xs muted">{t('replay.headersLabel')}</label>
          <textarea
            className="input replay-editor__area"
            value={headersText}
            onChange={(e) => setHeadersText(e.target.value)}
            rows={6}
            placeholder={'Authorization: Bearer ...\nContent-Type: application/json'}
            spellCheck={false}
          />

          <label className="text-xs muted">{t('replay.bodyLabel')}</label>
          <textarea
            className="input replay-editor__area"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder={t('replay.bodyPlaceholder')}
            spellCheck={false}
          />
        </div>

        <div className="replay-controls">
          <fieldset className="replay-mode" role="radiogroup" aria-labelledby="replay-mode-label">
            <legend id="replay-mode-label" className="text-xs muted">
              {t('replay.modeLabel')}
            </legend>
            <label className="row text-sm" style={{ gap: 'var(--space-2)' }}>
              <input
                type="radio"
                name="replay-mode"
                checked={mode === 'dry-run'}
                onChange={() => setMode('dry-run')}
              />
              {t('replay.modeDryRun')}
            </label>
            <label className="row text-sm" style={{ gap: 'var(--space-2)' }}>
              <input
                type="radio"
                name="replay-mode"
                checked={mode === 'live'}
                onChange={() => setMode('live')}
                disabled={!isTauri()}
              />
              {t('replay.modeLive')}
              {!isTauri() && (
                <span className="muted text-xs"> ({t('replay.liveTauriOnly')})</span>
              )}
            </label>
          </fieldset>

          {mode === 'live' && (
            <div className="replay-auth">
              <label className="row text-sm" style={{ gap: 'var(--space-2)' }}>
                <input
                  type="checkbox"
                  checked={authorizedHost === targetHost && !!targetHost}
                  disabled={!targetHost}
                  onChange={(e) => setAuthorizedHost(e.target.checked ? targetHost : undefined)}
                />
                <span>
                  {t('replay.authorizeCheckbox', { host: targetHost ?? '?' })}
                </span>
              </label>
              {quota && (
                <div className="muted text-xs">
                  {t('replay.quotaUsage', {
                    used: quota.cap - quota.remaining,
                    cap: quota.cap,
                  })}{' '}
                  · {t('replay.cooldownNote', { ms: quota.cooldownMs })}
                </div>
              )}
            </div>
          )}

          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void send()}
              disabled={sending || (mode === 'live' && !liveAllowed)}
            >
              {sending && <Spinner />} {mode === 'dry-run' ? t('replay.previewSend') : t('replay.send')}
            </button>
          </div>
        </div>

        {error && (
          <div className="reveal-warning" role="alert" style={{ marginTop: 'var(--space-3)' }}>
            {error}
          </div>
        )}

        {response && (
          <div className="replay-response">
            <div className="row" style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
              {response.status > 0 ? (
                <span
                  className={`badge ${
                    response.status >= 400 ? 'badge--danger' : 'badge--success'
                  }`}
                >
                  {response.status} {response.statusText}
                </span>
              ) : (
                <span className="badge badge--info">{response.statusText}</span>
              )}
              {response.durationMs > 0 && (
                <span className="muted text-xs">{response.durationMs}ms</span>
              )}
              {response.finalUrl !== url && (
                <span className="muted text-xs">→ {response.finalUrl}</span>
              )}
            </div>
            {response.headers.length > 0 && (
              <details className="jwt-card__details">
                <summary className="text-sm muted">{t('replay.responseHeaders')}</summary>
                <dl className="kv-table" style={{ marginTop: 'var(--space-2)' }}>
                  {response.headers.map(([k, v], i) => (
                    <div key={`${k}-${i}`} style={{ display: 'contents' }}>
                      <dt className="kv-table__key">{k}</dt>
                      <dd className="kv-table__val">
                        <code>{v}</code>
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
            <pre className="login-tx__body" style={{ marginTop: 'var(--space-2)' }}>
              {response.body || '(empty)'}
              {response.bodyTruncated && '\n\n[truncated]'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function serializeHeaders(req: RequestRecord, showRaw: boolean): string {
  return Object.entries(req.headers)
    .map(([k, v]) => {
      const value = showRaw && v.raw ? v.raw : v.masked;
      return `${k}: ${value}`;
    })
    .join('\n');
}

function parseHeaders(text: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(':');
    if (idx < 0) continue;
    out.push([trimmed.slice(0, idx).trim(), trimmed.slice(idx + 1).trim()]);
  }
  return out;
}

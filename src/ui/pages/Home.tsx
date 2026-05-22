import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { store, useAppState } from '../state/store.js';
import { createDemoAuthFlow } from '../demo/sampleFlow.js';

export function HomePage() {
  const state = useAppState();
  const { t } = useTranslation();
  const [url, setUrl] = useState(state.targetUrl);
  const [error, setError] = useState<string | undefined>();

  const submit = async (mode: 'capture' | 'demo') => {
    setError(undefined);
    const trimmed = url.trim();
    if (!trimmed) {
      setError(t('home.errorMissing'));
      return;
    }
    // Auto-prepend https:// if user didn't include a scheme.
    // Heuristic: starts with a host-like token (not /, ?, #) and no `://` present.
    const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed.replace(/^\/+/, '')}`;
    try {
      const parsed = new URL(normalized);
      if (!/^https?:$/.test(parsed.protocol)) {
        setError(t('home.errorScheme'));
        return;
      }
    } catch {
      setError(t('home.errorInvalid'));
      return;
    }

    // Reflect the normalized value back into the input so the user sees what
    // will actually be used.
    if (normalized !== url) setUrl(normalized);

    store.setTargetUrl(normalized);
    if (mode === 'capture') {
      await store.startCapture(normalized);
    } else {
      const flow = createDemoAuthFlow(normalized, {
        revealRaw: state.settings.revealRawByDefault,
      });
      store.setActiveFlow(flow);
      await store.saveActiveFlow();
    }
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-8)' }}>
      <header className="page-header">
        <span className="page-header__eyebrow">{t('home.eyebrow')}</span>
        <h1 className="page-header__title">{t('home.title')}</h1>
        <p className="page-header__lede">{t('home.lede')}</p>
      </header>

      <div className="notice-banner" role="note">
        <span aria-hidden="true">◎</span>
        <div>
          <div className="notice-banner__title">{t('home.noticeTitle')}</div>
          <p className="notice-banner__body">{t('home.noticeBody')}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="card__title">{t('home.startCardTitle')}</h2>
        <p className="card__lede">{t('home.startCardLede')}</p>
        <div className="stack" style={{ marginTop: 'var(--space-5)' }}>
          <label className="text-sm muted" htmlFor="target-url">
            {t('home.urlLabel')}
          </label>
          <input
            id="target-url"
            className="input"
            type="url"
            placeholder={t('home.urlPlaceholder')}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          {error && (
            <span className="text-xs" style={{ color: 'var(--color-danger)' }} role="alert">
              {error}
            </span>
          )}
          <div className="row" style={{ marginTop: 'var(--space-2)' }}>
            <button className="btn btn--primary" onClick={() => submit('capture')}>
              {t('home.startCapture')}
            </button>
            {/* Demo is only useful in browser preview mode where the real
                Playwright backend isn't available. In Tauri builds users
                should always do a real capture. */}
            {!state.backendAvailable && (
              <button className="btn btn--secondary" onClick={() => submit('demo')}>
                {t('home.openDemo')}
              </button>
            )}
          </div>
        </div>
      </div>

      <RecentSessionList />
    </div>
  );
}

function RecentSessionList() {
  const state = useAppState();
  const { t } = useTranslation();
  if (state.recentSessions.length === 0) {
    return (
      <div className="card">
        <h2 className="card__title">{t('home.recentTitle')}</h2>
        <div className="empty-state">{t('home.recentEmpty')}</div>
      </div>
    );
  }
  return (
    <div className="card">
      <h2 className="card__title">{t('home.recentTitle')}</h2>
      <table className="request-list recent-list">
        <thead>
          <tr>
            <th>{t('home.headerTarget')}</th>
            <th className="col-auth-type">{t('home.headerAuthType')}</th>
            <th className="col-started-at">{t('home.headerStarted')}</th>
            <th className="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          {state.recentSessions.map((s) => (
            <tr key={s.id}>
              <td>
                {/* The URL itself is the open action — a larger, more
                    natural click target than a separate "Open" button.
                    Rendered as a button (not <a>) so we don't navigate
                    the webview anywhere; this only loads the saved
                    session into state. */}
                <button
                  type="button"
                  className="link-button"
                  title={t('home.openSessionHint', { url: s.targetUrl })}
                  onClick={() => store.loadSession(s.id)}
                >
                  {s.targetUrl}
                </button>
              </td>
              <td className="col-auth-type">
                <span className="badge">{s.authType ?? 'unknown'}</span>
              </td>
              <td className="col-started-at muted">{formatStartedAt(s.startedAt)}</td>
              <td className="col-actions row row--end">
                <button
                  className="btn btn--danger"
                  onClick={() => store.deleteSession(s.id)}
                  aria-label={t('home.deleteSessionAria', { url: s.targetUrl })}
                >
                  {t('common.delete')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Recent-list date format. Locale-aware date+time joined by a space, like
 * "2026-05-22 16:55" or "5/22/2026, 4:55 PM" depending on locale. Kept short
 * so a 170px column doesn't overflow into the actions cell beside it.
 */
function formatStartedAt(iso: string): string {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString(undefined, {
      year: '2-digit',
      month: 'numeric',
      day: 'numeric',
    });
    const time = d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${date} ${time}`;
  } catch {
    return iso;
  }
}

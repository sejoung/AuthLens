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
    try {
      const parsed = new URL(trimmed);
      if (!/^https?:$/.test(parsed.protocol)) {
        setError(t('home.errorScheme'));
        return;
      }
    } catch {
      setError(t('home.errorInvalid'));
      return;
    }

    store.setTargetUrl(url);
    if (mode === 'capture') {
      await store.startCapture(url);
    } else {
      const flow = createDemoAuthFlow(url, {
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
            <button className="btn btn--secondary" onClick={() => submit('demo')}>
              {t('home.openDemo')}
            </button>
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
      <table className="request-list">
        <thead>
          <tr>
            <th>{t('home.headerTarget')}</th>
            <th className="col-tags">{t('home.headerAuthType')}</th>
            <th className="col-time">{t('home.headerStarted')}</th>
            <th className="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          {state.recentSessions.map((s) => (
            <tr key={s.id}>
              <td title={s.targetUrl}>{s.targetUrl}</td>
              <td className="col-tags">
                <span className="badge">{s.authType ?? 'unknown'}</span>
              </td>
              <td className="col-time muted">{s.startedAt}</td>
              <td className="col-actions row row--end">
                <button className="btn btn--secondary" onClick={() => store.loadSession(s.id)}>
                  {t('common.open')}
                </button>
                <button className="btn btn--danger" onClick={() => store.deleteSession(s.id)}>
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

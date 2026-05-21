import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { store, useAppState } from '../state/store.js';
import { createDemoAuthFlow } from '../demo/sampleFlow.js';

export function CapturePage() {
  const state = useAppState();
  const { t } = useTranslation();
  const backend = state.backendAvailable;

  // In browser-only preview (no Tauri backend), we keep the simulated stream so the
  // UI stays functional. In a Tauri build the real Playwright sidecar drives state.
  useEffect(() => {
    if (backend) return; // real backend will emit events
    if (state.captureStatus !== 'running') return;
    let cancelled = false;
    const interval = setInterval(() => {
      if (cancelled) return;
      const order = [
        { method: 'GET', path: '/', isLoginCandidate: false, status: 200 },
        { method: 'GET', path: '/login', isLoginCandidate: false, status: 200 },
        { method: 'POST', path: '/api/login', isLoginCandidate: true, status: 200 },
        { method: 'GET', path: '/api/me', isLoginCandidate: false, status: 200 },
      ];
      const next = order[state.liveRequests.length];
      if (!next) {
        clearInterval(interval);
        return;
      }
      store.appendLiveRequest({
        id: `live-${Date.now()}`,
        method: next.method,
        url: state.targetUrl + next.path,
        status: next.status,
        timestamp: new Date().toISOString(),
        isLoginCandidate: next.isLoginCandidate,
      });
    }, 600);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [backend, state.captureStatus, state.targetUrl, state.liveRequests.length]);

  const stop = async () => {
    if (backend) {
      await store.requestStopCapture();
      return;
    }
    store.stopCapture();
    const flow = createDemoAuthFlow(state.targetUrl, {
      revealRaw: state.settings.revealRawByDefault,
    });
    store.setActiveFlow(flow);
    void store.saveActiveFlow();
  };

  if (state.captureStatus !== 'running' && !state.activeFlow) {
    return (
      <div className="empty-state">
        <p>{t('capture.noActive')}</p>
        <button className="btn btn--primary" onClick={() => store.navigate('home')}>
          {t('common.goHome')}
        </button>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-6)' }}>
      <header className="page-header">
        <span className="page-header__eyebrow">{t('capture.eyebrow')}</span>
        <h1 className="page-header__title">{t('capture.title')}</h1>
        <p className="page-header__lede">
          {backend ? t('capture.ledeBackend') : t('capture.ledePreview')}
        </p>
      </header>

      {!backend && (
        <div className="notice-banner" role="note">
          <span aria-hidden="true">◎</span>
          <div>
            <div className="notice-banner__title">{t('capture.previewTitle')}</div>
            <p className="notice-banner__body">{t('capture.previewBody')}</p>
          </div>
        </div>
      )}
      {backend && (
        <div className="notice-banner" role="note">
          <span aria-hidden="true">◎</span>
          <div>
            <div className="notice-banner__title">{t('capture.backendTitle')}</div>
            <p className="notice-banner__body">{t('capture.backendBody')}</p>
          </div>
        </div>
      )}

      {state.captureError && (
        <div className="reveal-warning" role="alert">
          {state.captureError}
        </div>
      )}

      <div className="card">
        <div className="row row--between">
          <div className="stack" style={{ gap: 'var(--space-1)' }}>
            <div className="text-xs muted">{t('capture.labelTarget')}</div>
            <code>{state.targetUrl || '—'}</code>
          </div>
          <div className="row" style={{ gap: 'var(--space-6)' }}>
            <Metric label={t('capture.labelRequests')} value={state.captureStats.requestCount} />
            <Metric
              label={t('capture.labelAuthCandidates')}
              value={state.captureStats.authCandidateCount}
            />
          </div>
          <button className="btn btn--danger" onClick={stop}>
            {t('capture.stop')}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="card__title">{t('capture.liveNetwork')}</h2>
        {state.liveRequests.length === 0 ? (
          <div className="empty-state">{t('capture.waiting')}</div>
        ) : (
          <table className="request-list">
            <thead>
              <tr>
                <th>{t('capture.headerTime')}</th>
                <th>{t('capture.headerMethod')}</th>
                <th>{t('capture.headerUrl')}</th>
                <th>{t('capture.headerStatus')}</th>
                <th>{t('capture.headerTags')}</th>
              </tr>
            </thead>
            <tbody>
              {state.liveRequests.map((r) => (
                <tr key={r.id} className={r.isLoginCandidate ? 'is-login' : ''}>
                  <td className="muted text-xs">{shortTime(r.timestamp)}</td>
                  <td>
                    <span className={`badge badge--${methodClass(r.method)}`}>{r.method}</span>
                  </td>
                  <td>
                    <code>{r.url}</code>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        r.status && r.status >= 400 ? 'badge--danger' : 'badge--success'
                      }`}
                    >
                      {r.status ?? '—'}
                    </span>
                  </td>
                  <td>
                    {r.isLoginCandidate ? (
                      <span className="badge badge--info">{t('capture.loginCandidate')}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="stack" style={{ gap: 0, alignItems: 'flex-end' }}>
      <div className="text-xs muted">{label}</div>
      <div className="text-sm" style={{ fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString();
}

function methodClass(m: string): string {
  switch (m.toUpperCase()) {
    case 'GET':
      return 'get';
    case 'POST':
      return 'post';
    case 'PUT':
    case 'PATCH':
      return 'put';
    case 'DELETE':
      return 'delete';
    default:
      return 'info';
  }
}

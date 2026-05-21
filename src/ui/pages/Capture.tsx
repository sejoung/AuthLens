import { useEffect } from 'react';
import { store, useAppState } from '../state/store.js';
import { createDemoAuthFlow } from '../demo/sampleFlow.js';

export function CapturePage() {
  const state = useAppState();

  // In a Tauri build, Playwright runs in the Rust backend.
  // For the web preview, we simulate live requests so the UI is functional.
  useEffect(() => {
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
  }, [state.captureStatus, state.targetUrl, state.liveRequests.length]);

  const stop = () => {
    store.stopCapture();
    // synthesize flow from demo data using the entered URL
    const flow = createDemoAuthFlow(state.targetUrl);
    store.setActiveFlow(flow);
    void store.saveActiveFlow();
  };

  if (state.captureStatus !== 'running' && !state.activeFlow) {
    return (
      <div className="empty-state">
        <p>No active capture. Start one from the Home page.</p>
        <button className="btn btn--primary" onClick={() => store.navigate('home')}>
          Go Home
        </button>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-6)' }}>
      <header className="page-header">
        <span className="page-header__eyebrow">Capture</span>
        <h1 className="page-header__title">Recording session</h1>
        <p className="page-header__lede">
          Sign in on the browser window. AuthLens is observing requests, responses, and
          storage changes. No automation is performed.
        </p>
      </header>

      <div className="card">
        <div className="row row--between">
          <div className="stack" style={{ gap: 'var(--space-1)' }}>
            <div className="text-xs muted">Target</div>
            <code>{state.targetUrl || '—'}</code>
          </div>
          <div className="row" style={{ gap: 'var(--space-6)' }}>
            <Metric label="Requests" value={state.captureStats.requestCount} />
            <Metric label="Auth candidates" value={state.captureStats.authCandidateCount} />
          </div>
          <button className="btn btn--danger" onClick={stop}>
            Stop Capture
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="card__title">Live network</h2>
        {state.liveRequests.length === 0 ? (
          <div className="empty-state">Waiting for traffic…</div>
        ) : (
          <table className="request-list">
            <thead>
              <tr>
                <th>Time</th>
                <th>Method</th>
                <th>URL</th>
                <th>Status</th>
                <th>Tags</th>
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
                      <span className="badge badge--info">Login Candidate</span>
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

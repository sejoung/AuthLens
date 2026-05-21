import { useState } from 'react';
import { store, useAppState } from '../state/store.js';
import { createDemoAuthFlow } from '../demo/sampleFlow.js';

export function HomePage() {
  const state = useAppState();
  const [url, setUrl] = useState(state.targetUrl);
  const [error, setError] = useState<string | undefined>();

  const submit = async (mode: 'capture' | 'demo') => {
    setError(undefined);
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Please enter a URL.');
      return;
    }
    try {
      // Validate URL — let WHATWG URL throw if invalid.
      const parsed = new URL(trimmed);
      if (!/^https?:$/.test(parsed.protocol)) {
        setError('Only http and https URLs are supported.');
        return;
      }
    } catch {
      setError('That does not look like a valid URL.');
      return;
    }

    store.setTargetUrl(url);
    if (mode === 'capture') {
      await store.startCapture(url);
    } else {
      // Demo: jump straight to analysis with sample data
      const flow = createDemoAuthFlow(url);
      store.setActiveFlow(flow);
      await store.saveActiveFlow();
    }
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-8)' }}>
      <header className="page-header">
        <span className="page-header__eyebrow">Home</span>
        <h1 className="page-header__title">Inspect an authentication flow</h1>
        <p className="page-header__lede">
          Enter a web application URL. AuthLens helps you visualize and document how its
          authentication works — you sign in, we observe.
        </p>
      </header>

      <div className="notice-banner" role="note">
        <span aria-hidden="true">◎</span>
        <div>
          <div className="notice-banner__title">Authorized systems only</div>
          <p className="notice-banner__body">
            Use AuthLens for internal debugging, QA, documentation, and authentication flow
            analysis. Unauthorized use against third-party services may violate laws or terms
            of service.
          </p>
        </div>
      </div>

      <div className="card">
        <h2 className="card__title">Start a capture</h2>
        <p className="card__lede">
          AuthLens will open a browser session for the URL below. Sign in normally — we record
          requests, responses, cookies, and storage changes.
        </p>
        <div className="stack" style={{ marginTop: 'var(--space-5)' }}>
          <label className="text-sm muted" htmlFor="target-url">
            Target URL
          </label>
          <input
            id="target-url"
            className="input"
            type="url"
            placeholder="https://app.example.com/login"
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
              Start Capture
            </button>
            <button className="btn btn--secondary" onClick={() => submit('demo')}>
              Open demo flow
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
  if (state.recentSessions.length === 0) {
    return (
      <div className="card">
        <h2 className="card__title">Recent captures</h2>
        <div className="empty-state">
          Start by entering a web application URL. AuthLens will help you visualize and document
          its authentication flow.
        </div>
      </div>
    );
  }
  return (
    <div className="card">
      <h2 className="card__title">Recent captures</h2>
      <table className="request-list">
        <thead>
          <tr>
            <th>Target</th>
            <th>Auth Type</th>
            <th>Started</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {state.recentSessions.map((s) => (
            <tr key={s.id}>
              <td>{s.targetUrl}</td>
              <td>
                <span className="badge">{s.authType ?? 'unknown'}</span>
              </td>
              <td className="muted">{s.startedAt}</td>
              <td className="row row--end">
                <button className="btn btn--secondary" onClick={() => store.loadSession(s.id)}>
                  Open
                </button>
                <button className="btn btn--danger" onClick={() => store.deleteSession(s.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

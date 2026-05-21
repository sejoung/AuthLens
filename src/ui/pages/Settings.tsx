import { useState } from 'react';
import { store, useAppState } from '../state/store.js';

export function SettingsPage() {
  const state = useAppState();
  const { settings } = state;
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="stack" style={{ gap: 'var(--space-6)' }}>
      <header className="page-header">
        <span className="page-header__eyebrow">Settings</span>
        <h1 className="page-header__title">Capture & masking policy</h1>
        <p className="page-header__lede">
          Defaults err on the side of safety: small body capture limit, masked sensitive values,
          and disabled experimental features.
        </p>
      </header>

      <div className="card">
        <h2 className="card__title">Masking policy</h2>
        <div className="stack">
          <label className="row text-sm">
            <input
              type="checkbox"
              checked={settings.revealRawByDefault}
              onChange={(e) =>
                store.updateSettings({ revealRawByDefault: e.target.checked })
              }
            />
            <span>
              Reveal raw values by default
              <div className="muted text-xs">
                Not recommended. Raw values are still hidden from exports unless explicitly
                opted-in per export.
              </div>
            </span>
          </label>
        </div>
      </div>

      <div className="card">
        <h2 className="card__title">Capture options</h2>
        <div className="stack">
          <label className="row text-sm">
            <span style={{ flex: 1 }}>Response body preview limit (bytes)</span>
            <input
              type="number"
              className="input"
              style={{ maxWidth: 160 }}
              min={1024}
              max={65536}
              step={1024}
              value={settings.bodyPreviewLimit}
              onChange={(e) =>
                store.updateSettings({ bodyPreviewLimit: Number(e.target.value) })
              }
            />
          </label>
          <label className="row text-sm">
            <input
              type="checkbox"
              checked={settings.headful}
              onChange={(e) => store.updateSettings({ headful: e.target.checked })}
            />
            <span>
              Open browser in headful mode
              <div className="muted text-xs">
                Required for manual login. Disabling is rarely useful.
              </div>
            </span>
          </label>
        </div>
      </div>

      <div className="card">
        <h2 className="card__title">Experimental features</h2>
        <p className="muted text-sm">
          Off by default. Read the safety notes in the documentation before enabling.
        </p>
        <label className="row text-sm" style={{ marginTop: 'var(--space-3)' }}>
          <input
            type="checkbox"
            checked={settings.experimentalReplay}
            onChange={(e) =>
              store.updateSettings({ experimentalReplay: e.target.checked })
            }
          />
          <span>
            Enable replay sandbox
            <div className="muted text-xs">
              Replay sends the selected request to a mock endpoint after stripping sensitive
              values. Never replays against the original origin automatically.
            </div>
          </span>
        </label>
      </div>

      <div className="card">
        <h2 className="card__title">Data</h2>
        <p className="muted text-sm">
          Captures are stored locally. Delete them anytime.
        </p>
        <div className="row" style={{ marginTop: 'var(--space-3)' }}>
          {!confirmDelete ? (
            <button className="btn btn--danger" onClick={() => setConfirmDelete(true)}>
              Delete all captures
            </button>
          ) : (
            <>
              <span className="text-sm reveal-warning">
                This will remove every saved capture. This cannot be undone.
              </span>
              <button
                className="btn btn--danger"
                onClick={async () => {
                  await store.deleteAll();
                  setConfirmDelete(false);
                }}
              >
                Yes, delete everything
              </button>
              <button className="btn btn--secondary" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

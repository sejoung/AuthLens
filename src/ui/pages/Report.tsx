import { useMemo, useState } from 'react';
import { diffCookies, diffStorage } from '@/analyzer';
import { generateMarkdownReport, stringifyJsonExport } from '@/reporter';
import { store, useAppState } from '../state/store.js';

type Tab = 'markdown' | 'json';

export function ReportPage() {
  const state = useAppState();
  const [tab, setTab] = useState<Tab>('markdown');
  const [includeRaw, setIncludeRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const flow = state.activeFlow;
  const { markdown, json } = useMemo(() => {
    if (!flow) return { markdown: '', json: '' };
    const cookieDiff = diffCookies(flow.cookiesBefore, flow.cookiesAfter);
    const storageDiff = diffStorage(flow.storageBefore, flow.storageAfter);
    return {
      markdown: generateMarkdownReport(flow, cookieDiff, storageDiff, { includeRaw }),
      json: stringifyJsonExport(flow, { includeRaw }),
    };
  }, [flow, includeRaw]);

  if (!flow) {
    return (
      <div className="empty-state">
        <p>No report yet. Open a captured flow from Home or Analysis first.</p>
        <button className="btn btn--primary" onClick={() => store.navigate('home')}>
          Go Home
        </button>
      </div>
    );
  }

  const text = tab === 'markdown' ? markdown : json;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback: select text
    }
  };

  const download = () => {
    const blob = new Blob([text], { type: tab === 'markdown' ? 'text/markdown' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `authlens-report.${tab === 'markdown' ? 'md' : 'json'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-6)' }}>
      <header className="page-header">
        <span className="page-header__eyebrow">Report</span>
        <h1 className="page-header__title">Export the documentation</h1>
        <p className="page-header__lede">
          Review the report before sharing. The exported file masks sensitive values by default.
        </p>
      </header>

      <div className="card">
        <div className="row row--between" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="tabs">
            <button
              className={`tab ${tab === 'markdown' ? 'tab--active' : ''}`}
              onClick={() => setTab('markdown')}
            >
              Markdown
            </button>
            <button className={`tab ${tab === 'json' ? 'tab--active' : ''}`} onClick={() => setTab('json')}>
              JSON
            </button>
          </div>
          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <label className="row text-sm" style={{ gap: 'var(--space-2)' }}>
              <input
                type="checkbox"
                checked={includeRaw}
                onChange={(e) => setIncludeRaw(e.target.checked)}
              />
              Include raw values
            </label>
            <button className="btn btn--secondary" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button className="btn btn--primary" onClick={download}>
              Download
            </button>
          </div>
        </div>
        {includeRaw && (
          <div className="reveal-warning" style={{ marginBottom: 'var(--space-3)' }}>
            ⚠ Raw sensitive values are included. Only share with authorized reviewers.
          </div>
        )}
        <pre className="mermaid-preview" style={{ maxHeight: 480 }}>
          {text}
        </pre>
      </div>
    </div>
  );
}

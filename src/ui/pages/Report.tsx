import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { diffCookies, diffStorage } from '@/analyzer';
import { generateMarkdownReport, stringifyJsonExport } from '@/reporter';
import type { AuthFlow } from '@/core';
import { store, useAppState } from '../state/store.js';
import { MarkdownPreview } from '../components/MarkdownPreview.js';
import { useReportStrings } from '../i18n/useReportStrings.js';

type Tab = 'preview' | 'markdown' | 'json';

/** Heuristic: does this flow carry any raw sensitive values? */
function flowContainsRaw(flow: AuthFlow | undefined): boolean {
  if (!flow) return false;
  for (const c of flow.cookiesAfter) {
    if (c.value.raw !== undefined && c.value.sensitivity !== 'none') return true;
  }
  for (const req of flow.requests) {
    for (const v of Object.values(req.headers)) {
      if (v.raw !== undefined && v.sensitivity !== 'none') return true;
    }
    if (req.postData?.raw !== undefined && req.postData.sensitivity !== 'none') return true;
  }
  for (const res of flow.responses) {
    for (const v of Object.values(res.headers)) {
      if (v.raw !== undefined && v.sensitivity !== 'none') return true;
    }
    if (res.bodyPreview?.raw !== undefined && res.bodyPreview.sensitivity !== 'none') return true;
  }
  return false;
}

export function ReportPage() {
  const state = useAppState();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('preview');
  const [includeRaw, setIncludeRaw] = useState(state.settings.revealRawByDefault);
  const [compact, setCompact] = useState(true);
  const [copied, setCopied] = useState(false);

  // Settings.revealRawByDefault가 외부에서 바뀌면 Report 미리보기도 즉시 반영.
  useEffect(() => {
    setIncludeRaw(state.settings.revealRawByDefault);
  }, [state.settings.revealRawByDefault]);

  const flow = state.activeFlow;
  const rawAvailable = flowContainsRaw(flow);
  const effectiveIncludeRaw = includeRaw && rawAvailable;
  const reportStrings = useReportStrings();
  const { markdown, json } = useMemo(() => {
    if (!flow) return { markdown: '', json: '' };
    const cookieDiff = diffCookies(flow.cookiesBefore, flow.cookiesAfter);
    const storageDiff = diffStorage(flow.storageBefore, flow.storageAfter);
    return {
      markdown: generateMarkdownReport(
        flow,
        cookieDiff,
        storageDiff,
        { includeRaw: effectiveIncludeRaw, compactTimeline: compact },
        reportStrings,
      ),
      json: stringifyJsonExport(flow, { includeRaw: effectiveIncludeRaw }),
    };
  }, [flow, effectiveIncludeRaw, reportStrings, compact]);

  if (!flow) {
    return (
      <div className="empty-state">
        <p>{t('report.noActive')}</p>
        <button className="btn btn--primary" onClick={() => store.navigate('home')}>
          {t('common.goHome')}
        </button>
      </div>
    );
  }

  // What gets copied/downloaded depends on the *source* format (md vs json),
  // not the current tab — Preview renders the same markdown source.
  const currentFormat: 'md' | 'json' = tab === 'json' ? 'json' : 'md';
  const text = currentFormat === 'md' ? markdown : json;

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
    const blob = new Blob([text], {
      type: currentFormat === 'md' ? 'text/markdown' : 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `authlens-report.${currentFormat === 'md' ? 'md' : 'json'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-6)' }}>
      <header className="page-header">
        <span className="page-header__eyebrow">{t('report.eyebrow')}</span>
        <h1 className="page-header__title">{t('report.title')}</h1>
        <p className="page-header__lede">{t('report.lede')}</p>
      </header>

      <div className="card">
        <div className="row row--between" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="tabs">
            <button
              className={`tab ${tab === 'preview' ? 'tab--active' : ''}`}
              onClick={() => setTab('preview')}
            >
              {t('report.tabPreview')}
            </button>
            <button
              className={`tab ${tab === 'markdown' ? 'tab--active' : ''}`}
              onClick={() => setTab('markdown')}
            >
              {t('report.tabMarkdown')}
            </button>
            <button
              className={`tab ${tab === 'json' ? 'tab--active' : ''}`}
              onClick={() => setTab('json')}
            >
              {t('report.tabJson')}
            </button>
          </div>
          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <label className="row text-sm" style={{ gap: 'var(--space-2)' }}>
              <input
                type="checkbox"
                checked={compact}
                onChange={(e) => setCompact(e.target.checked)}
              />
              {t('report.compact')}
            </label>
            <label
              className="row text-sm"
              style={{ gap: 'var(--space-2)', opacity: rawAvailable ? 1 : 0.5 }}
              title={rawAvailable ? undefined : t('report.rawUnavailable')}
            >
              <input
                type="checkbox"
                checked={includeRaw && rawAvailable}
                disabled={!rawAvailable}
                onChange={(e) => setIncludeRaw(e.target.checked)}
              />
              {t('report.includeRaw')}
            </label>
            <button className="btn btn--secondary" onClick={copy}>
              {copied ? t('common.copied') : t('common.copy')}
            </button>
            <button className="btn btn--primary" onClick={download}>
              {t('common.download')} {currentFormat === 'md' ? '.md' : '.json'}
            </button>
          </div>
        </div>
        {includeRaw && rawAvailable && (
          <div className="reveal-warning" style={{ marginBottom: 'var(--space-3)' }}>
            {t('report.rawWarning')}
          </div>
        )}
        {!rawAvailable && (
          <div className="muted text-xs" style={{ marginBottom: 'var(--space-3)' }}>
            {t('report.rawUnavailable')}
          </div>
        )}
        {tab === 'preview' ? (
          <MarkdownPreview source={markdown} />
        ) : (
          <pre className="mermaid-preview" style={{ maxHeight: 480 }}>
            {tab === 'markdown' ? markdown : json}
          </pre>
        )}
      </div>
    </div>
  );
}

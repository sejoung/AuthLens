import { useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { diffCookies, diffStorage } from '@/analyzer';
import { generateMermaidDiagram } from '@/reporter';
import { store, useAppState } from '../state/store.js';
import { MermaidDiagram } from '../components/MermaidDiagram.js';

export function AnalysisPage() {
  const state = useAppState();
  const { t } = useTranslation();
  const flow = state.activeFlow;

  const { cookieDiff, storageDiff } = useMemo(() => {
    if (!flow) return { cookieDiff: undefined, storageDiff: undefined };
    return {
      cookieDiff: diffCookies(flow.cookiesBefore, flow.cookiesAfter),
      storageDiff: diffStorage(flow.storageBefore, flow.storageAfter),
    };
  }, [flow]);

  const mermaid = useMemo(() => (flow ? generateMermaidDiagram(flow) : ''), [flow]);

  if (!flow) {
    return (
      <div className="empty-state">
        <p>{t('analysis.noActive')}</p>
        <button className="btn btn--primary" onClick={() => store.navigate('home')}>
          {t('common.goHome')}
        </button>
      </div>
    );
  }

  const topCandidate = flow.loginCandidates[0];
  const summary = flow.summary;

  return (
    <div className="stack" style={{ gap: 'var(--space-6)' }}>
      <header className="page-header">
        <span className="page-header__eyebrow">{t('analysis.eyebrow')}</span>
        <h1 className="page-header__title">{t('analysis.title')}</h1>
        <p className="page-header__lede">
          <Trans
            i18nKey="analysis.ledeFor"
            values={{ url: flow.targetUrl }}
            components={{ code: <code /> }}
          />
        </p>
      </header>

      <div className="card-grid">
        <SummaryCard
          title={t('analysis.cardAuthType')}
          value={summary?.authType ?? 'unknown'}
          description={t('analysis.confidenceLine', {
            score: summary?.confidence.toFixed(0) ?? 0,
            level: summary?.confidenceLevel ?? 'low',
          })}
          badge={summary?.authType}
        />
        <SummaryCard
          title={t('analysis.cardLoginCandidate')}
          value={topCandidate ? t('analysis.scoreLabel', { score: topCandidate.score }) : '—'}
          description={topCandidate?.confidence ?? t('analysis.noCandidate')}
        />
        <SummaryCard
          title={t('analysis.cardCookieChanges')}
          value={String(
            (cookieDiff?.added.length ?? 0) +
              (cookieDiff?.changed.length ?? 0) +
              (cookieDiff?.removed.length ?? 0),
          )}
          description={`+${cookieDiff?.added.length ?? 0} / ~${cookieDiff?.changed.length ?? 0} / -${cookieDiff?.removed.length ?? 0}`}
        />
        <SummaryCard
          title={t('analysis.cardStorageChanges')}
          value={String(
            (storageDiff?.localStorage.added.length ?? 0) +
              (storageDiff?.sessionStorage.added.length ?? 0),
          )}
          description={t('analysis.newKeys')}
        />
      </div>

      {summary && summary.warnings.length > 0 && (
        <div className="card">
          <h2 className="card__title">{t('analysis.securityNotes')}</h2>
          <ul>
            {summary.warnings.map((w, i) => (
              <li key={i}>
                <span
                  className={`badge badge--${w.level === 'danger' ? 'danger' : w.level === 'warning' ? 'warning' : 'info'}`}
                >
                  {w.level}
                </span>{' '}
                {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2 className="card__title">{t('analysis.timeline')}</h2>
        <ol className="stack" style={{ paddingLeft: 'var(--space-5)' }}>
          {flow.steps.map((step) => (
            <li key={step.id} style={{ marginBottom: 'var(--space-2)' }}>
              <strong>{step.event.type}</strong> — <span className="muted">{step.description}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="card">
        <h2 className="card__title">{t('analysis.mermaidPreview')}</h2>
        <p className="muted text-sm">{t('analysis.mermaidHint')}</p>
        <MermaidDiagram code={mermaid} />
      </div>

      <div className="card">
        <h2 className="card__title">{t('analysis.requestList')}</h2>
        <table className="request-list">
          <thead>
            <tr>
              <th>{t('capture.headerMethod')}</th>
              <th>{t('capture.headerUrl')}</th>
              <th>{t('capture.headerTime')}</th>
              <th>{t('capture.headerTags')}</th>
            </tr>
          </thead>
          <tbody>
            {flow.requests.map((r) => {
              const isLogin = topCandidate?.requestId === r.id;
              return (
                <tr key={r.id} className={isLogin ? 'is-login' : ''}>
                  <td>
                    <span className={`badge badge--${methodClass(r.method)}`}>{r.method}</span>
                  </td>
                  <td>
                    <code>{r.url}</code>
                  </td>
                  <td className="muted text-xs">{r.timestamp}</td>
                  <td className="muted text-xs">{r.resourceType}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="row row--end">
        <button className="btn btn--primary" onClick={() => store.navigate('report')}>
          {t('analysis.viewReport')}
        </button>
      </div>
    </div>
  );
}

function SummaryCard(props: {
  title: string;
  value: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="card" style={{ padding: 'var(--space-5)' }}>
      <div className="text-xs muted">{props.title}</div>
      <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-xl)', fontWeight: 600 }}>
        {props.value}
      </div>
      <div className="text-sm muted" style={{ marginTop: 'var(--space-2)' }}>
        {props.description}
      </div>
      {props.badge && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <span className="badge badge--info">{props.badge}</span>
        </div>
      )}
    </div>
  );
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

import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  diffCookies,
  diffStorage,
  filterNoteworthyEvents,
  filterNoteworthyRequests,
  findJwts,
  type JwtLocation,
} from '@/analyzer';
import { generateMermaidDiagram } from '@/reporter';
import { store, useAppState } from '../state/store.js';
import { MermaidDiagram } from '../components/MermaidDiagram.js';

export function AnalysisPage() {
  const state = useAppState();
  const { t } = useTranslation();
  const flow = state.activeFlow;
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [showAllRequests, setShowAllRequests] = useState(false);

  const { cookieDiff, storageDiff } = useMemo(() => {
    if (!flow) return { cookieDiff: undefined, storageDiff: undefined };
    return {
      cookieDiff: diffCookies(flow.cookiesBefore, flow.cookiesAfter),
      storageDiff: diffStorage(flow.storageBefore, flow.storageAfter),
    };
  }, [flow]);

  const mermaid = useMemo(() => (flow ? generateMermaidDiagram(flow) : ''), [flow]);

  const noteworthyEvents = useMemo(
    () => (flow ? filterNoteworthyEvents(flow.events) : []),
    [flow],
  );
  const noteworthyRequests = useMemo(
    () => (flow ? filterNoteworthyRequests(flow.requests, flow.loginCandidates) : []),
    [flow],
  );
  const jwts = useMemo(() => (flow ? findJwts(flow) : []), [flow]);

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
  const stepsToShow = showAllEvents
    ? flow.steps
    : flow.steps.filter((s) => noteworthyEvents.includes(s.event));
  const requestsToShow = showAllRequests ? flow.requests : noteworthyRequests;

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

      {/* Hero: sequence diagram + summary card side-by-side */}
      <div className="analysis-hero">
        <div className="analysis-hero__diagram">
          <h2 className="card__title">{t('analysis.mermaidPreview')}</h2>
          <MermaidDiagram code={mermaid} />
        </div>
        <div className="analysis-hero__summary">
          <div className="text-xs muted">{t('analysis.cardAuthType')}</div>
          <div className="analysis-hero__authtype">{summary?.authType ?? 'unknown'}</div>
          <div className="text-sm muted">
            {t('analysis.confidenceLine', {
              score: summary?.confidence.toFixed(0) ?? 0,
              level: summary?.confidenceLevel ?? 'low',
            })}
          </div>
          {topCandidate && (
            <div className="analysis-hero__candidate">
              <div className="text-xs muted" style={{ marginBottom: 4 }}>
                {t('analysis.cardLoginCandidate')}
              </div>
              <code className="analysis-hero__candidate-url">
                {flow.requests.find((r) => r.id === topCandidate.requestId)?.method.toUpperCase()}{' '}
                {pathOf(
                  flow.requests.find((r) => r.id === topCandidate.requestId)?.url ?? '',
                )}
              </code>
              <div className="text-xs muted">
                {t('analysis.scoreLabel', { score: topCandidate.score })} · {topCandidate.confidence}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compact metric strip */}
      <div className="metric-strip">
        <Metric
          label={t('analysis.cardCookieChanges')}
          value={
            (cookieDiff?.added.length ?? 0) +
            (cookieDiff?.changed.length ?? 0) +
            (cookieDiff?.removed.length ?? 0)
          }
          detail={`+${cookieDiff?.added.length ?? 0} / ~${cookieDiff?.changed.length ?? 0} / -${cookieDiff?.removed.length ?? 0}`}
        />
        <Metric
          label={t('analysis.cardStorageChanges')}
          value={
            (storageDiff?.localStorage.added.length ?? 0) +
            (storageDiff?.sessionStorage.added.length ?? 0)
          }
          detail={t('analysis.newKeys')}
        />
        <Metric
          label={t('capture.labelRequests')}
          value={flow.requests.length}
          detail={`${noteworthyRequests.length} ${t('analysis.relevant')}`}
        />
        <Metric
          label={t('analysis.signalsLabel')}
          value={summary?.detectedSignals.length ?? 0}
        />
      </div>

      {summary && summary.warnings.length > 0 && (
        <div className="card">
          <h2 className="card__title">{t('analysis.securityNotes')}</h2>
          <ul className="security-notes">
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

      {jwts.length > 0 && (
        <details className="disclosure" open>
          <summary>
            <span className="disclosure__title">{t('analysis.jwtTokens')}</span>
            <span className="muted text-xs">
              {t('analysis.jwtCount', { count: jwts.length })}
            </span>
          </summary>
          <div className="stack" style={{ gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
            {jwts.map((j, i) => (
              <JwtCard key={`${j.source}-${j.label}-${i}`} location={j} />
            ))}
          </div>
        </details>
      )}

      <details className="disclosure" open>
        <summary>
          <span className="disclosure__title">{t('analysis.timeline')}</span>
          <span className="muted text-xs">
            {showAllEvents
              ? t('analysis.timelineCountAll', { count: flow.steps.length })
              : t('analysis.timelineCount', {
                  shown: stepsToShow.length,
                  total: flow.steps.length,
                })}
          </span>
        </summary>
        <ol className="stack" style={{ paddingLeft: 'var(--space-5)', marginTop: 'var(--space-3)' }}>
          {stepsToShow.map((step) => (
            <li key={step.id} style={{ marginBottom: 'var(--space-2)' }}>
              <strong>{step.event.type}</strong> —{' '}
              <span className="muted">{step.description}</span>
            </li>
          ))}
        </ol>
        {flow.steps.length > stepsToShow.length && (
          <button
            className="btn btn--secondary"
            onClick={() => setShowAllEvents(true)}
            style={{ marginTop: 'var(--space-2)' }}
          >
            {t('analysis.showAllEvents', { count: flow.steps.length })}
          </button>
        )}
      </details>

      <details className="disclosure">
        <summary>
          <span className="disclosure__title">{t('analysis.requestList')}</span>
          <span className="muted text-xs">
            {showAllRequests
              ? t('analysis.requestCountAll', { count: flow.requests.length })
              : t('analysis.requestCount', {
                  shown: noteworthyRequests.length,
                  total: flow.requests.length,
                })}
          </span>
        </summary>
        <table className="request-list" style={{ marginTop: 'var(--space-3)' }}>
          <thead>
            <tr>
              <th className="col-method">{t('capture.headerMethod')}</th>
              <th>{t('capture.headerUrl')}</th>
              <th className="col-time">{t('capture.headerTime')}</th>
              <th className="col-resource">{t('capture.headerTags')}</th>
            </tr>
          </thead>
          <tbody>
            {requestsToShow.map((r) => {
              const isLogin = topCandidate?.requestId === r.id;
              return (
                <tr key={r.id} className={isLogin ? 'is-login' : ''}>
                  <td className="col-method">
                    <span className={`badge badge--${methodClass(r.method)}`}>{r.method}</span>
                  </td>
                  <td>
                    <code title={r.url}>{r.url}</code>
                  </td>
                  <td className="col-time muted text-xs">{shortTime(r.timestamp)}</td>
                  <td className="col-resource muted text-xs">{r.resourceType}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {flow.requests.length > requestsToShow.length && (
          <button
            className="btn btn--secondary"
            onClick={() => setShowAllRequests(true)}
            style={{ marginTop: 'var(--space-2)' }}
          >
            {t('analysis.showAllRequests', { count: flow.requests.length })}
          </button>
        )}
      </details>

      <div className="row row--end">
        <button className="btn btn--primary" onClick={() => store.navigate('report')}>
          {t('analysis.viewReport')}
        </button>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail?: string;
}) {
  return (
    <div className="metric-strip__item">
      <div className="text-xs muted">{label}</div>
      <div className="metric-strip__value">{value}</div>
      {detail && <div className="text-xs muted">{detail}</div>}
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

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function shortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

function JwtCard({ location }: { location: JwtLocation }) {
  const { t } = useTranslation();
  const j = location.decoded;
  return (
    <div className="jwt-card">
      <div className="jwt-card__head">
        <span className="badge badge--info">{t(`reportContent.jwtSource.${location.source}`)}</span>
        <code className="jwt-card__label" title={location.label}>{location.label}</code>
        {j.expiresAt && (
          <span className={`badge ${j.expired ? 'badge--danger' : 'badge--success'}`}>
            {j.expired ? t('reportContent.jwtExpired') : t('reportContent.jwtNotExpired')}
          </span>
        )}
      </div>
      <dl className="jwt-claims">
        {j.algorithm && <Claim label={t('reportContent.jwtAlgorithm')} value={j.algorithm} />}
        {typeof j.payload.sub === 'string' && (
          <Claim label={t('reportContent.jwtSubject')} value={j.payload.sub} />
        )}
        {typeof j.payload.iss === 'string' && (
          <Claim label={t('reportContent.jwtIssuer')} value={j.payload.iss} />
        )}
        {j.payload.aud !== undefined && (
          <Claim label={t('reportContent.jwtAudience')} value={JSON.stringify(j.payload.aud)} />
        )}
        {j.issuedAt && (
          <Claim label={t('reportContent.jwtIssuedAt')} value={j.issuedAt.toLocaleString()} />
        )}
        {j.expiresAt && (
          <Claim label={t('reportContent.jwtExpiresAt')} value={j.expiresAt.toLocaleString()} />
        )}
        <Claim label={t('reportContent.jwtSignaturePreview')} value={j.signaturePreview} mono />
      </dl>
      <details className="jwt-card__details">
        <summary className="text-sm muted">{t('reportContent.jwtPayload')}</summary>
        <pre className="jwt-json">{JSON.stringify(j.payload, null, 2)}</pre>
      </details>
      <details className="jwt-card__details">
        <summary className="text-sm muted">{t('reportContent.jwtHeader')}</summary>
        <pre className="jwt-json">{JSON.stringify(j.header, null, 2)}</pre>
      </details>
    </div>
  );
}

function Claim({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="jwt-claims__label">{label}</dt>
      <dd className={`jwt-claims__value ${mono ? 'mono' : ''}`}>{value}</dd>
    </>
  );
}

import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  countByResourceGroup,
  diffCookies,
  diffStorage,
  filterByResourceGroup,
  filterNoteworthyEvents,
  findJwts,
  findOAuthFlow,
  type BasicAuthUsage,
  type BearerUsage,
  type JwtLocation,
  type OAuthAuthorizeRequest,
  type OAuthCallback,
  type OAuthTokenExchange,
  type ResourceGroup,
} from '@/analyzer';
import { generateMermaidDiagram } from '@/reporter';
import { store, useAppState } from '../state/store.js';
import { MermaidDiagram } from '../components/MermaidDiagram.js';

export function AnalysisPage() {
  const state = useAppState();
  const { t } = useTranslation();
  const flow = state.activeFlow;
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [requestFilter, setRequestFilter] = useState<ResourceGroup>('api');

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
  const groupCounts = useMemo(
    () =>
      flow
        ? countByResourceGroup(flow.requests)
        : ({ api: 0, document: 0, script: 0, other: 0, all: 0 } as Record<ResourceGroup, number>),
    [flow],
  );
  const filteredRequests = useMemo(
    () =>
      flow ? filterByResourceGroup(flow.requests, requestFilter, flow.loginCandidates) : [],
    [flow, requestFilter],
  );
  const jwts = useMemo(() => (flow ? findJwts(flow) : []), [flow]);
  const oauth = useMemo(
    () =>
      flow
        ? findOAuthFlow(flow)
        : {
            authorizeRequests: [],
            tokenExchanges: [],
            callbacks: [],
            bearerUsages: [],
            basicAuthUsages: [],
          },
    [flow],
  );
  const hasOAuthSection =
    oauth.authorizeRequests.length > 0 ||
    oauth.tokenExchanges.length > 0 ||
    oauth.callbacks.length > 0 ||
    oauth.bearerUsages.length > 0;

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
  const requestsToShow = filteredRequests;

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
          detail={`${groupCounts.api} ${t('analysis.resourceGroup.api')}`}
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

      {hasOAuthSection && (
        <details className="disclosure">
          <summary>
            <span className="disclosure__title">{t('analysis.oauthFlow')}</span>
            <span className="muted text-xs">
              {t('analysis.oauthCount2', {
                authorize: oauth.authorizeRequests.length,
                tokens: oauth.tokenExchanges.length,
                callbacks: oauth.callbacks.length,
                bearers: oauth.bearerUsages.length,
              })}
            </span>
          </summary>
          <div className="stack" style={{ gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
            {oauth.authorizeRequests.map((a, i) => (
              <OAuthAuthorizeCard key={`a-${i}`} authorize={a} />
            ))}
            {oauth.tokenExchanges.map((e, i) => (
              <OAuthTokenCard key={`t-${i}`} exchange={e} />
            ))}
            {oauth.callbacks.length > 0 && <OAuthCallbackCard callbacks={oauth.callbacks} />}
            {oauth.bearerUsages.length > 0 && <BearerUsageCard usages={oauth.bearerUsages} />}
          </div>
        </details>
      )}

      {oauth.basicAuthUsages.length > 0 && (
        <details className="disclosure">
          <summary>
            <span className="disclosure__title">{t('analysis.httpBasic')}</span>
            <span className="muted text-xs">
              {t('analysis.basicCount', { count: oauth.basicAuthUsages.length })}
            </span>
          </summary>
          <div className="stack" style={{ gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
            <BasicAuthCard usages={oauth.basicAuthUsages} />
          </div>
        </details>
      )}

      {jwts.length > 0 && (
        <details className="disclosure">
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

      <details className="disclosure">
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
            {t('analysis.requestCount', {
              shown: requestsToShow.length,
              total: flow.requests.length,
            })}
          </span>
        </summary>
        <div className="filter-chips" style={{ marginTop: 'var(--space-3)' }}>
          {(['api', 'document', 'script', 'other', 'all'] as const).map((g) => (
            <button
              key={g}
              type="button"
              className={`chip ${requestFilter === g ? 'chip--active' : ''}`}
              onClick={() => setRequestFilter(g)}
            >
              {t(`analysis.resourceGroup.${g}`)}{' '}
              <span className="chip__count">{groupCounts[g]}</span>
            </button>
          ))}
        </div>
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
            {requestsToShow.length === 0 && (
              <tr>
                <td colSpan={4} className="muted text-sm" style={{ textAlign: 'center' }}>
                  {t('analysis.noRequestsInGroup')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
      <details className="jwt-card__details" open>
        <summary className="text-sm muted">{t('reportContent.jwtPayload')}</summary>
        <pre className="jwt-json">{JSON.stringify(j.payload, null, 2)}</pre>
      </details>
      <details className="jwt-card__details" open>
        <summary className="text-sm muted">{t('reportContent.jwtHeader')}</summary>
        <pre className="jwt-json">{JSON.stringify(j.header, null, 2)}</pre>
      </details>
    </div>
  );
}

function OAuthAuthorizeCard({ authorize }: { authorize: OAuthAuthorizeRequest }) {
  const { t } = useTranslation();
  const a = authorize;
  return (
    <div className="jwt-card">
      <div className="jwt-card__head">
        <span className="badge badge--info">{t('reportContent.oauthAuthorizeHeading')}</span>
        <code className="jwt-card__label" title={a.endpoint}>{a.endpoint}</code>
        <span className={`badge ${a.pkce ? 'badge--success' : 'badge--warning'}`}>
          PKCE: {a.pkce ? t('reportContent.oauthPkceYes') : t('reportContent.oauthPkceNo')}
        </span>
      </div>
      <dl className="jwt-claims">
        {a.responseType && <Claim label={t('reportContent.oauthResponseType')} value={a.responseType} />}
        {a.clientId && <Claim label={t('reportContent.oauthClientId')} value={a.clientId} />}
        {a.redirectUri && <Claim label={t('reportContent.oauthRedirectUri')} value={a.redirectUri} />}
        {a.scope && <Claim label={t('reportContent.oauthScopeRequested')} value={a.scope} />}
        {a.state && <Claim label={t('reportContent.oauthState')} value={a.state} mono />}
        {a.nonce && <Claim label={t('reportContent.oauthNonce')} value={a.nonce} mono />}
        {a.codeChallengeMethod && (
          <Claim label="code_challenge_method" value={a.codeChallengeMethod} />
        )}
      </dl>
    </div>
  );
}

function OAuthTokenCard({ exchange }: { exchange: OAuthTokenExchange }) {
  const { t } = useTranslation();
  const e = exchange;
  const expiresSoon =
    e.expiresAt && e.expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  const expired = e.expiresAt && e.expiresAt.getTime() < Date.now();
  return (
    <div className="jwt-card">
      <div className="jwt-card__head">
        <span className="badge badge--info">{t('reportContent.oauthTokenHeading')}</span>
        <code className="jwt-card__label" title={e.endpoint}>{e.endpoint}</code>
        {e.expiresAt && (
          <span
            className={`badge ${expired ? 'badge--danger' : expiresSoon ? 'badge--warning' : 'badge--success'}`}
          >
            {expired
              ? t('reportContent.jwtExpired')
              : `${t('reportContent.oauthExpiresIn')}: ${formatDuration(e.expiresAt.getTime() - Date.now())}`}
          </span>
        )}
      </div>
      <dl className="jwt-claims">
        {e.grantType && <Claim label={t('reportContent.oauthGrantType')} value={e.grantType} />}
        {e.clientId && <Claim label={t('reportContent.oauthClientId')} value={e.clientId} />}
        {e.tokenType && <Claim label={t('reportContent.oauthTokenType')} value={e.tokenType} />}
        {e.scope && <Claim label={t('reportContent.oauthScopeGranted')} value={e.scope} />}
        {e.expiresInSeconds !== undefined && (
          <Claim
            label={t('reportContent.oauthExpiresIn')}
            value={`${e.expiresInSeconds}s`}
          />
        )}
        {e.expiresAt && (
          <Claim label={t('reportContent.oauthExpiresAt')} value={e.expiresAt.toLocaleString()} />
        )}
        <Claim
          label={t('reportContent.oauthRefreshToken')}
          value={e.hasRefreshToken ? t('reportContent.oauthYes') : t('reportContent.oauthNo')}
        />
        <Claim
          label={t('reportContent.oauthIdToken')}
          value={e.hasIdToken ? t('reportContent.oauthYes') : t('reportContent.oauthNo')}
        />
      </dl>
    </div>
  );
}

function OAuthCallbackCard({ callbacks }: { callbacks: OAuthCallback[] }) {
  const { t } = useTranslation();
  return (
    <div className="jwt-card">
      <div className="jwt-card__head">
        <span className="badge badge--info">{t('analysis.oauthCallback')}</span>
        <span className="muted text-xs">{callbacks.length}</span>
      </div>
      <ul className="stack" style={{ gap: 'var(--space-2)', paddingLeft: 'var(--space-5)' }}>
        {callbacks.map((c, i) => (
          <li key={i} className="text-sm">
            <code>{c.host}</code>{' '}
            <span className="muted text-xs">
              {c.hasCode && 'code'} {c.hasState && '· state'}{' '}
              {c.hasError && (
                <span style={{ color: 'var(--color-danger)' }}>
                  · error={c.errorCode ?? '?'}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BearerUsageCard({ usages }: { usages: BearerUsage[] }) {
  const { t } = useTranslation();
  const jwtCount = usages.filter((u) => u.tokenLooksLikeJwt).length;
  return (
    <div className="jwt-card">
      <div className="jwt-card__head">
        <span className="badge badge--success">{t('analysis.bearerUsage')}</span>
        <span className="muted text-xs">
          {t('analysis.bearerCount', { count: usages.length, jwt: jwtCount })}
        </span>
      </div>
      <ul className="stack" style={{ gap: 'var(--space-1)', paddingLeft: 'var(--space-5)' }}>
        {usages.slice(0, 10).map((u, i) => (
          <li key={i} className="text-sm">
            <span className={`badge badge--${u.method.toUpperCase() === 'GET' ? 'get' : 'post'}`}>
              {u.method}
            </span>{' '}
            <code>{pathOf(u.url)}</code>
          </li>
        ))}
        {usages.length > 10 && (
          <li className="muted text-xs">
            {t('analysis.bearerMore', { count: usages.length - 10 })}
          </li>
        )}
      </ul>
    </div>
  );
}

function BasicAuthCard({ usages }: { usages: BasicAuthUsage[] }) {
  const { t } = useTranslation();
  const usernames = Array.from(
    new Set(usages.map((u) => u.username).filter((x): x is string => !!x)),
  );
  return (
    <div className="jwt-card">
      <div className="jwt-card__head">
        <span className="badge badge--warning">{t('analysis.basicAuth')}</span>
        <span className="muted text-xs">
          {t('analysis.basicCount', { count: usages.length })}
        </span>
      </div>
      <p className="text-sm muted" style={{ marginTop: 0 }}>
        {t('analysis.basicDescription')}
      </p>
      {usernames.length > 0 && (
        <dl className="jwt-claims">
          <Claim
            label={t('analysis.basicUsername')}
            value={usernames.join(', ')}
            mono
          />
        </dl>
      )}
      <ul
        className="stack"
        style={{ gap: 'var(--space-1)', paddingLeft: 'var(--space-5)', marginTop: 'var(--space-2)' }}
      >
        {usages.slice(0, 5).map((u, i) => (
          <li key={i} className="text-sm">
            <span className={`badge badge--${u.method.toUpperCase() === 'GET' ? 'get' : 'post'}`}>
              {u.method}
            </span>{' '}
            <code>{pathOf(u.url)}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 0) return '0s';
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m`;
  const day = Math.floor(hr / 24);
  return `${day}d ${hr % 24}h`;
}

function Claim({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="jwt-claims__label">{label}</dt>
      <dd className={`jwt-claims__value ${mono ? 'mono' : ''}`}>{value}</dd>
    </>
  );
}

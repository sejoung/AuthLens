import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  analyzeLoginCredentials,
  countByResourceGroup,
  diffCookies,
  diffStorage,
  discoverEndpoints,
  displaySensitive,
  filterByResourceGroup,
  filterNoteworthyEvents,
  findJwts,
  findLoginForm,
  findLogoutEndpoints,
  findOAuthFlow,
  flowContainsRaw,
  hasAnyCredential,
  type BasicAuthUsage,
  type BearerUsage,
  type DiscoveredEndpoint,
  type JwtLocation,
  type LoginCredentials,
  type LoginFormAnalysis,
  type LogoutEndpoint,
  type OAuthAuthorizeRequest,
  type OAuthCallback,
  type OAuthTokenExchange,
  type ResourceGroup,
} from '@/analyzer';
import { stringifyPostmanCollection, toCurlCommand } from '@/reporter';
import type {
  CookieDiff,
  CookieSnapshot,
  RequestRecord,
  ResponseRecord,
  StorageDiff,
  StorageEntry,
} from '@/core';
import { downloadFile } from '../util/download.js';
import { ReplayModal } from '../components/ReplayModal.js';
import { generateMermaidDiagram } from '@/reporter';
import { store, useAppState } from '../state/store.js';
import { MermaidDiagram } from '../components/MermaidDiagram.js';

export function AnalysisPage() {
  const state = useAppState();
  const { t } = useTranslation();
  const flow = state.activeFlow;
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [requestFilter, setRequestFilter] = useState<ResourceGroup>('api');
  const [includeRaw, setIncludeRaw] = useState(state.settings.revealRawByDefault);

  // Sync from global setting on external changes (same pattern as Report page).
  useEffect(() => {
    setIncludeRaw(state.settings.revealRawByDefault);
  }, [state.settings.revealRawByDefault]);

  const rawAvailable = useMemo(() => flowContainsRaw(flow), [flow]);
  const showRaw = includeRaw && rawAvailable;

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
  const endpoints = useMemo(() => (flow ? discoverEndpoints(flow) : []), [flow]);
  const loginForm = useMemo(() => (flow ? findLoginForm(flow) : undefined), [flow]);
  const logouts = useMemo(() => (flow ? findLogoutEndpoints(flow) : []), [flow]);
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
      <header className="page-header analysis-header">
        <div className="analysis-header__text">
          <span className="page-header__eyebrow">{t('analysis.eyebrow')}</span>
          <h1 className="page-header__title">{t('analysis.title')}</h1>
          <p className="page-header__lede">
            <Trans
              i18nKey="analysis.ledeFor"
              values={{ url: flow.targetUrl }}
              components={{ code: <code /> }}
            />
          </p>
        </div>
        <div className="analysis-header__controls">
          <label
            className="row text-sm"
            style={{ gap: 'var(--space-2)', opacity: rawAvailable ? 1 : 0.5 }}
            title={rawAvailable ? undefined : t('analysis.rawUnavailable')}
          >
            <input
              type="checkbox"
              checked={showRaw}
              disabled={!rawAvailable}
              onChange={(e) => setIncludeRaw(e.target.checked)}
            />
            {t('analysis.includeRaw')}
          </label>
        </div>
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

      {endpoints.length > 0 && (
        <details className="disclosure">
          <summary>
            <span className="disclosure__title">{t('analysis.discoveredApi')}</span>
            <span className="muted text-xs">
              {t('analysis.discoveredApiCount', {
                count: endpoints.length,
                authenticated: endpoints.filter((e) => e.authenticated).length,
              })}
            </span>
          </summary>
          <DiscoveredEndpointsCard
            flow={flow}
            endpoints={endpoints}
            showRaw={showRaw}
            replayEnabled={state.settings.experimentalReplay}
          />
        </details>
      )}

      {loginForm && (
        <details className="disclosure">
          <summary>
            <span className="disclosure__title">{t('analysis.loginForm')}</span>
            <span className="muted text-xs">
              {loginForm.method} {loginForm.action ?? '(inline)'}
            </span>
          </summary>
          <LoginFormCard form={loginForm} />
        </details>
      )}

      {logouts.length > 0 && (
        <details className="disclosure">
          <summary>
            <span className="disclosure__title">{t('analysis.logout')}</span>
            <span className="muted text-xs">
              {t('analysis.logoutCount', { count: logouts.length })}
            </span>
          </summary>
          <LogoutCard items={logouts} />
        </details>
      )}

      {topCandidate && (() => {
        const loginReq = flow.requests.find((r) => r.id === topCandidate.requestId);
        const loginRes = flow.responses.find((r) => r.requestId === topCandidate.requestId);
        if (!loginReq) return null;
        return (
          <details className="disclosure" open>
            <summary>
              <span className="disclosure__title">{t('analysis.loginTransaction')}</span>
              <span className="muted text-xs">
                {loginReq.method.toUpperCase()} {pathOf(loginReq.url)}
                {loginRes && ` · ${loginRes.status}`}
              </span>
            </summary>
            <LoginTransactionCard request={loginReq} response={loginRes} showRaw={showRaw} />
          </details>
        );
      })()}

      {cookieDiff && totalCookieChanges(cookieDiff) > 0 && (
        <details className="disclosure">
          <summary>
            <span className="disclosure__title">{t('analysis.cardCookieChanges')}</span>
            <span className="muted text-xs">
              +{cookieDiff.added.length} / ~{cookieDiff.changed.length} / -{cookieDiff.removed.length}
            </span>
          </summary>
          <CookieDiffCard diff={cookieDiff} showRaw={showRaw} />
        </details>
      )}

      {storageDiff && totalStorageChanges(storageDiff) > 0 && (
        <details className="disclosure">
          <summary>
            <span className="disclosure__title">{t('analysis.cardStorageChanges')}</span>
            <span className="muted text-xs">{storageDiffSummary(storageDiff)}</span>
          </summary>
          <StorageDiffCard diff={storageDiff} showRaw={showRaw} />
        </details>
      )}

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
              <JwtCard key={`${j.source}-${j.label}-${i}`} location={j} showRaw={showRaw} />
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

function statusClass(status: number): 'success' | 'info' | 'warning' | 'danger' {
  if (status >= 500) return 'danger';
  if (status >= 400) return 'warning';
  if (status >= 300) return 'info';
  if (status >= 200) return 'success';
  return 'info';
}

function totalCookieChanges(d: CookieDiff): number {
  return d.added.length + d.changed.length + d.removed.length;
}

function totalStorageChanges(d: StorageDiff): number {
  return (
    d.localStorage.added.length +
    d.localStorage.changed.length +
    d.localStorage.removed.length +
    d.sessionStorage.added.length +
    d.sessionStorage.changed.length +
    d.sessionStorage.removed.length
  );
}

function storageDiffSummary(d: StorageDiff): string {
  const ls = d.localStorage.added.length + d.localStorage.changed.length + d.localStorage.removed.length;
  const ss = d.sessionStorage.added.length + d.sessionStorage.changed.length + d.sessionStorage.removed.length;
  return `local: ${ls} · session: ${ss}`;
}

function cookieFlags(c: { httpOnly: boolean; secure: boolean; sameSite?: string }): string[] {
  const flags: string[] = [];
  if (c.httpOnly) flags.push('HttpOnly');
  if (c.secure) flags.push('Secure');
  if (c.sameSite) flags.push(`SameSite=${c.sameSite}`);
  return flags;
}

function CookieDiffCard({ diff, showRaw }: { diff: CookieDiff; showRaw: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="stack" style={{ gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
      {diff.added.length > 0 && (
        <DiffGroup label={t('analysis.addedLabel')}>
          {diff.added.map((c, i) => (
            <CookieRow key={`a-${c.name}-${i}`} cookie={c} showRaw={showRaw} />
          ))}
        </DiffGroup>
      )}
      {diff.changed.length > 0 && (
        <DiffGroup label={t('analysis.changedLabel')}>
          {diff.changed.map((c, i) => (
            <CookieChangedRow key={`c-${c.after.name}-${i}`} before={c.before} after={c.after} showRaw={showRaw} />
          ))}
        </DiffGroup>
      )}
      {diff.removed.length > 0 && (
        <DiffGroup label={t('analysis.removedLabel')}>
          {diff.removed.map((c, i) => (
            <CookieRow key={`r-${c.name}-${i}`} cookie={c} showRaw={showRaw} removed />
          ))}
        </DiffGroup>
      )}
    </div>
  );
}

function CookieRow({
  cookie,
  showRaw,
  removed,
}: {
  cookie: CookieSnapshot;
  showRaw: boolean;
  removed?: boolean;
}) {
  const flags = cookieFlags(cookie);
  return (
    <div className="kv-row">
      <code className="kv-row__key">{cookie.name}</code>
      <span className="muted text-xs">@ {cookie.domain}{cookie.path}</span>
      {!removed && <code className="kv-row__value">{displaySensitive(cookie.value, showRaw)}</code>}
      {flags.length > 0 && (
        <span className="badge-row">
          {flags.map((f) => (
            <span key={f} className="badge badge--info">{f}</span>
          ))}
        </span>
      )}
    </div>
  );
}

function CookieChangedRow({
  before,
  after,
  showRaw,
}: {
  before: CookieSnapshot;
  after: CookieSnapshot;
  showRaw: boolean;
}) {
  const flags = cookieFlags(after);
  return (
    <div className="kv-row">
      <code className="kv-row__key">{after.name}</code>
      <span className="muted text-xs">@ {after.domain}{after.path}</span>
      <code className="kv-row__value muted">{displaySensitive(before.value, showRaw)}</code>
      <span className="muted">→</span>
      <code className="kv-row__value">{displaySensitive(after.value, showRaw)}</code>
      {flags.length > 0 && (
        <span className="badge-row">
          {flags.map((f) => (
            <span key={f} className="badge badge--info">{f}</span>
          ))}
        </span>
      )}
    </div>
  );
}

function StorageDiffCard({ diff, showRaw }: { diff: StorageDiff; showRaw: boolean }) {
  return (
    <div className="stack" style={{ gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
      <StorageSection title="localStorage" diff={diff.localStorage} showRaw={showRaw} />
      <StorageSection title="sessionStorage" diff={diff.sessionStorage} showRaw={showRaw} />
    </div>
  );
}

function StorageSection({
  title,
  diff,
  showRaw,
}: {
  title: string;
  diff: StorageDiff['localStorage'];
  showRaw: boolean;
}) {
  const { t } = useTranslation();
  const total = diff.added.length + diff.changed.length + diff.removed.length;
  if (total === 0) return null;
  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      <h3 className="card__title" style={{ fontSize: 'var(--font-sm)' }}>{title}</h3>
      {diff.added.length > 0 && (
        <DiffGroup label={t('analysis.addedLabel')}>
          {diff.added.map((e, i) => (
            <StorageRow key={`a-${e.key}-${i}`} entry={e} showRaw={showRaw} />
          ))}
        </DiffGroup>
      )}
      {diff.changed.length > 0 && (
        <DiffGroup label={t('analysis.changedLabel')}>
          {diff.changed.map((c, i) => (
            <StorageChangedRow
              key={`c-${c.after.key}-${i}`}
              before={c.before}
              after={c.after}
              showRaw={showRaw}
            />
          ))}
        </DiffGroup>
      )}
      {diff.removed.length > 0 && (
        <DiffGroup label={t('analysis.removedLabel')}>
          {diff.removed.map((e, i) => (
            <StorageRow key={`r-${e.key}-${i}`} entry={e} showRaw={showRaw} removed />
          ))}
        </DiffGroup>
      )}
    </div>
  );
}

function StorageRow({
  entry,
  showRaw,
  removed,
}: {
  entry: StorageEntry;
  showRaw: boolean;
  removed?: boolean;
}) {
  return (
    <div className="kv-row">
      <code className="kv-row__key">{entry.key}</code>
      {!removed && <code className="kv-row__value">{displaySensitive(entry.value, showRaw)}</code>}
    </div>
  );
}

function StorageChangedRow({
  before,
  after,
  showRaw,
}: {
  before: StorageEntry;
  after: StorageEntry;
  showRaw: boolean;
}) {
  return (
    <div className="kv-row">
      <code className="kv-row__key">{after.key}</code>
      <code className="kv-row__value muted">{displaySensitive(before.value, showRaw)}</code>
      <span className="muted">→</span>
      <code className="kv-row__value">{displaySensitive(after.value, showRaw)}</code>
    </div>
  );
}

function DiffGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      <div className="text-xs muted" style={{ fontWeight: 600 }}>{label}</div>
      <div className="stack" style={{ gap: 'var(--space-1)' }}>{children}</div>
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

function JwtCard({ location, showRaw }: { location: JwtLocation; showRaw: boolean }) {
  const { t } = useTranslation();
  const j = location.decoded;
  const sigLabel = showRaw ? t('reportContent.jwtSignature') : t('reportContent.jwtSignaturePreview');
  const sigValue = showRaw ? j.signature : j.signaturePreview;
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
        <Claim label={sigLabel} value={sigValue} mono />
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

function DiscoveredEndpointsCard({
  flow,
  endpoints,
  showRaw,
  replayEnabled,
}: {
  flow: ReturnType<typeof useAppState>['activeFlow'];
  endpoints: DiscoveredEndpoint[];
  showRaw: boolean;
  replayEnabled: boolean;
}) {
  const { t } = useTranslation();
  const [copiedFor, setCopiedFor] = useState<string | undefined>();
  const [replayReq, setReplayReq] = useState<RequestRecord | undefined>();

  const copyCurl = async (req: RequestRecord) => {
    const cmd = toCurlCommand(req, { includeRaw: showRaw });
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedFor(req.id);
      setTimeout(() => setCopiedFor(undefined), 1500);
    } catch {
      /* ignore */
    }
  };

  const downloadPostman = () => {
    if (!flow) return;
    const json = stringifyPostmanCollection(flow, { includeRaw: showRaw });
    void downloadFile(json, 'application/json', 'authlens-collection.postman_collection.json');
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
      <div className="row" style={{ gap: 'var(--space-2)' }}>
        <button className="btn btn--secondary" onClick={downloadPostman}>
          {t('analysis.downloadPostman')}
        </button>
      </div>
      <table className="request-list">
        <thead>
          <tr>
            <th className="col-methods">{t('capture.headerMethod')}</th>
            <th>{t('analysis.endpointPattern')}</th>
            <th className="col-status-list">{t('analysis.endpointStatus')}</th>
            <th className="col-actions">{t('analysis.endpointCopyCurl')}</th>
          </tr>
        </thead>
        <tbody>
          {endpoints.map((e) => {
            const statusEntries = Object.entries(e.statusCounts).sort(
              ([a], [b]) => Number(a) - Number(b),
            );
            return (
              <tr key={`${e.host}|${e.pathPattern}`} className={e.authenticated ? 'is-login' : ''}>
                <td className="col-methods">
                  <div className="badge-row">
                    {e.methods.map((m) => (
                      <span key={m} className={`badge badge--${methodClass(m)}`}>
                        {m}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <code title={e.example.url}>
                    {e.host}
                    {e.pathPattern}
                  </code>
                  <div className="row text-xs" style={{ gap: 6, marginTop: 4 }}>
                    <span className="muted">
                      {t('analysis.endpointCalls', { count: e.requestCount })}
                    </span>
                    {e.authenticated && <span className="badge badge--success">auth</span>}
                  </div>
                </td>
                <td className="col-status-list">
                  <div className="badge-row">
                    {statusEntries.length === 0 ? (
                      <span className="muted text-xs">—</span>
                    ) : (
                      statusEntries.map(([status, count]) => (
                        <span
                          key={status}
                          className={`badge badge--${statusClass(Number(status))}`}
                          title={t('analysis.endpointStatusCount', { count })}
                        >
                          {status}
                          {count > 1 && <span style={{ opacity: 0.7 }}> ×{count}</span>}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="col-actions">
                  <div className="row" style={{ gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                    <button className="btn btn--secondary" onClick={() => copyCurl(e.example)}>
                      {copiedFor === e.example.id ? t('common.copied') : t('analysis.copyCurl')}
                    </button>
                    {replayEnabled && (
                      <button
                        className="btn btn--secondary"
                        onClick={() => setReplayReq(e.example)}
                        title={t('replay.replayThisRequest')}
                      >
                        {t('replay.replay')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {replayReq && (
        <ReplayModal
          request={replayReq}
          showRaw={showRaw}
          onClose={() => setReplayReq(undefined)}
        />
      )}
    </div>
  );
}

function LoginFormCard({ form }: { form: LoginFormAnalysis }) {
  const { t } = useTranslation();
  return (
    <div className="jwt-card" style={{ marginTop: 'var(--space-3)' }}>
      <dl className="jwt-claims">
        <Claim label={t('analysis.formAction')} value={form.action ?? '(inline)'} />
        <Claim label={t('analysis.formMethod')} value={form.method} />
        {form.usernameFieldName && (
          <Claim label={t('analysis.formUsernameField')} value={form.usernameFieldName} mono />
        )}
        {form.passwordFieldName && (
          <Claim label={t('analysis.formPasswordField')} value={form.passwordFieldName} mono />
        )}
        {form.csrfField ? (
          <Claim
            label={t('analysis.formCsrf')}
            value={`${form.csrfField.name}${form.csrfField.value ? ` (value present)` : ''}`}
            mono
          />
        ) : (
          <Claim label={t('analysis.formCsrf')} value={t('analysis.formCsrfMissing')} />
        )}
      </dl>
      {form.fields.length > 0 && (
        <details className="jwt-card__details">
          <summary className="text-sm muted">
            {t('analysis.formFieldsAll', { count: form.fields.length })}
          </summary>
          <table className="request-list" style={{ marginTop: 'var(--space-2)' }}>
            <thead>
              <tr>
                <th>name</th>
                <th>type</th>
              </tr>
            </thead>
            <tbody>
              {form.fields.map((f) => (
                <tr key={f.name}>
                  <td>
                    <code>{f.name}</code>
                  </td>
                  <td>
                    <code>{f.type}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

function LogoutCard({ items }: { items: LogoutEndpoint[] }) {
  const { t } = useTranslation();
  return (
    <ul
      className="stack"
      style={{ gap: 'var(--space-2)', paddingLeft: 'var(--space-5)', marginTop: 'var(--space-3)' }}
    >
      {items.map((l, i) => (
        <li key={i}>
          <span className={`badge badge--${methodClass(l.request.method)}`}>
            {l.request.method.toUpperCase()}
          </span>{' '}
          <code>{pathOf(l.request.url)}</code>{' '}
          {l.status !== undefined && (
            <span
              className={`badge ${l.status >= 400 ? 'badge--danger' : 'badge--success'}`}
            >
              {l.status}
            </span>
          )}
          {l.clearedSessionCookie && (
            <span className="badge badge--info" style={{ marginLeft: 6 }}>
              {t('analysis.logoutClearedCookie')}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function CredentialsCard({
  credentials,
  reveal,
}: {
  credentials: LoginCredentials;
  reveal: boolean;
}) {
  const { t } = useTranslation();
  const items: Array<{ label: string; value: string; tone: 'info' | 'warning' | 'success' }> = [];

  if (credentials.scheme === 'basic') {
    let value: string;
    if (credentials.basicUsername !== undefined) {
      const pw = reveal && credentials.basicPassword !== undefined ? credentials.basicPassword : '••••••••';
      value = `username: ${credentials.basicUsername}, password: ${pw}`;
    } else {
      value = t('analysis.credBasicMasked');
    }
    items.push({ label: t('analysis.credBasic'), value, tone: 'warning' });
  }
  if (credentials.scheme === 'bearer') {
    const parts = [t('analysis.credBearer')];
    if (credentials.bearerIsJwt) parts.push('JWT');
    if (credentials.bearerTokenLength) parts.push(`${credentials.bearerTokenLength} chars`);
    items.push({ label: t('analysis.credAuthHeader'), value: parts.join(' · '), tone: 'info' });
  }
  if (credentials.usernameField) {
    items.push({
      label: t('analysis.credBodyUsername'),
      value: credentials.usernameValue
        ? `${credentials.usernameField} = ${credentials.usernameValue}`
        : credentials.usernameField,
      tone: 'info',
    });
  }
  if (credentials.passwordField) {
    const pw =
      reveal && credentials.passwordValue !== undefined ? credentials.passwordValue : '••••••••';
    items.push({
      label: t('analysis.credBodyPassword'),
      value: `${credentials.passwordField} = ${pw}`,
      tone: 'warning',
    });
  }
  if (items.length === 0) return null;
  return (
    <div className="credentials-card" role="region" aria-label={t('analysis.credSection')}>
      <div className="credentials-card__title">
        <span className="badge badge--info">{t('analysis.credSection')}</span>
        {credentials.bodyFormat && (
          <span className="muted text-xs">
            {t('analysis.credBodyFormat', { format: credentials.bodyFormat })}
          </span>
        )}
        {reveal && (
          <span className="badge badge--warning" title={t('analysis.credRevealHint')}>
            {t('analysis.credRevealOn')}
          </span>
        )}
      </div>
      <dl className="credentials-card__items">
        {items.map((it, i) => (
          <div key={i} className={`credentials-card__row credentials-card__row--${it.tone}`}>
            <dt>{it.label}</dt>
            <dd>
              <code>{it.value}</code>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function LoginTransactionCard({
  request,
  response,
  showRaw,
}: {
  request: RequestRecord;
  response?: ResponseRecord;
  showRaw: boolean;
}) {
  const { t } = useTranslation();
  const reqHeaders = Object.entries(request.headers);
  const resHeaders = response ? Object.entries(response.headers) : [];
  const credentials = analyzeLoginCredentials(request);
  return (
    <div className="login-tx" style={{ marginTop: 'var(--space-3)' }}>
      {hasAnyCredential(credentials) && (
        <CredentialsCard credentials={credentials} reveal={showRaw} />
      )}
      <div className="login-tx__row">
        <div className="login-tx__side">
          <div className="login-tx__title">
            <span className={`badge badge--${methodClass(request.method)}`}>
              {request.method.toUpperCase()}
            </span>
            <code className="login-tx__url" title={request.url}>{request.url}</code>
          </div>
          <h4 className="login-tx__heading">{t('analysis.txRequestHeaders')}</h4>
          {reqHeaders.length === 0 ? (
            <p className="muted text-xs">{t('analysis.txNoHeaders')}</p>
          ) : (
            <dl className="kv-table">
              {reqHeaders.map(([k, v]) => (
                <Kv
                  key={k}
                  keyName={k}
                  value={displaySensitive(v, showRaw)}
                  sensitive={v.sensitivity !== 'none'}
                />
              ))}
            </dl>
          )}
          {request.postData && (
            <>
              <h4 className="login-tx__heading">{t('analysis.txRequestBody')}</h4>
              <pre className="login-tx__body">
                {displaySensitive(request.postData, showRaw) || '(empty)'}
              </pre>
            </>
          )}
        </div>
        <div className="login-tx__side">
          <div className="login-tx__title">
            {response ? (
              <>
                <span
                  className={`badge ${response.status >= 400 ? 'badge--danger' : 'badge--success'}`}
                >
                  {response.status}
                </span>
                <span className="muted text-sm">{response.statusText}</span>
              </>
            ) : (
              <span className="muted text-sm">{t('analysis.txNoResponse')}</span>
            )}
          </div>
          <h4 className="login-tx__heading">{t('analysis.txResponseHeaders')}</h4>
          {resHeaders.length === 0 ? (
            <p className="muted text-xs">{t('analysis.txNoHeaders')}</p>
          ) : (
            <dl className="kv-table">
              {resHeaders.map(([k, v]) => (
                <Kv
                  key={k}
                  keyName={k}
                  value={displaySensitive(v, showRaw)}
                  sensitive={v.sensitivity !== 'none'}
                />
              ))}
            </dl>
          )}
          {response?.bodyPreview && (
            <>
              <h4 className="login-tx__heading">
                {t('analysis.txResponseBody')}
                {response.isBinary && (
                  <span className="muted text-xs"> ({t('analysis.txBinary')})</span>
                )}
              </h4>
              <pre className="login-tx__body">
                {displaySensitive(response.bodyPreview, showRaw) || '(empty)'}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Kv({
  keyName,
  value,
  sensitive,
}: {
  keyName: string;
  value: string;
  sensitive: boolean;
}) {
  return (
    <>
      <dt className="kv-table__key">
        {keyName}
        {sensitive && (
          <span className="badge badge--warning kv-table__lock" title="masked">
            🔒
          </span>
        )}
      </dt>
      <dd className="kv-table__val">
        <code>{value}</code>
      </dd>
    </>
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

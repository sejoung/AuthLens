import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { compareFlows, type FlowComparison } from '@/analyzer';
import type { AuthFlow } from '@/core';
import { store, useAppState } from '../state/store.js';

/**
 * Capture comparison view. Lets the user pick any two saved sessions and see
 * what changed between them — authType, confidence, discovered endpoints,
 * cookie flags, and the set of security warnings.
 *
 * Common use: capture once before a release, capture again after, then look
 * at this page to catch regressions like "we lost HttpOnly on the session
 * cookie" or "a new unauthenticated endpoint appeared".
 */
export function ComparePage() {
  const state = useAppState();
  const { t } = useTranslation();
  const sessions = state.recentSessions;

  // Default: most-recent vs second-most-recent — usually what the user wants.
  const [baseId, setBaseId] = useState<string | undefined>(sessions[1]?.id);
  const [nextId, setNextId] = useState<string | undefined>(sessions[0]?.id);

  useEffect(() => {
    if (!baseId && sessions[1]) setBaseId(sessions[1].id);
    if (!nextId && sessions[0]) setNextId(sessions[0].id);
  }, [sessions, baseId, nextId]);

  const [baseFlow, setBaseFlow] = useState<AuthFlow | undefined>();
  const [nextFlow, setNextFlow] = useState<AuthFlow | undefined>();

  useEffect(() => {
    if (!baseId) {
      setBaseFlow(undefined);
      return;
    }
    void loadFlow(baseId).then(setBaseFlow);
  }, [baseId]);

  useEffect(() => {
    if (!nextId) {
      setNextFlow(undefined);
      return;
    }
    void loadFlow(nextId).then(setNextFlow);
  }, [nextId]);

  const comparison = useMemo<FlowComparison | undefined>(() => {
    if (!baseFlow || !nextFlow) return undefined;
    return compareFlows(baseFlow, nextFlow);
  }, [baseFlow, nextFlow]);

  if (sessions.length < 2) {
    return (
      <div className="empty-state">
        <p>{t('compare.needTwo')}</p>
        <button className="btn btn--primary" onClick={() => store.navigate('home')}>
          {t('common.goHome')}
        </button>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-6)' }}>
      <header className="page-header">
        <span className="page-header__eyebrow">{t('compare.eyebrow')}</span>
        <h1 className="page-header__title">{t('compare.title')}</h1>
        <p className="page-header__lede">{t('compare.lede')}</p>
      </header>

      <div className="compare-pickers">
        <SessionPicker
          label={t('compare.baseLabel')}
          value={baseId}
          onChange={setBaseId}
          options={sessions}
        />
        <div className="compare-pickers__arrow" aria-hidden>⇄</div>
        <SessionPicker
          label={t('compare.nextLabel')}
          value={nextId}
          onChange={setNextId}
          options={sessions}
        />
      </div>

      {!comparison ? (
        <div className="card muted">{t('compare.loading')}</div>
      ) : baseId === nextId ? (
        <div className="card muted">{t('compare.sameSession')}</div>
      ) : (
        <>
          <SummaryCard c={comparison} />
          <EndpointsCard c={comparison} />
          <CookiesCard c={comparison} />
          <SecurityNotesCard c={comparison} />
        </>
      )}
    </div>
  );
}

function SessionPicker({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | undefined;
  onChange: (id: string) => void;
  options: Array<{ id: string; targetUrl: string; startedAt: string }>;
}) {
  return (
    <label className="compare-pickers__field">
      <span className="text-xs muted">{label}</span>
      <select
        className="select"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {shortHost(s.targetUrl)} · {shortDate(s.startedAt)}
          </option>
        ))}
      </select>
    </label>
  );
}

function SummaryCard({ c }: { c: FlowComparison }) {
  const { t } = useTranslation();
  const { authTypeChange, confidenceDelta, loginCandidateCountDelta } = c.summary;
  return (
    <div className="card">
      <h2 className="card__title">{t('compare.summaryHeading')}</h2>
      <div className="compare-summary">
        <CompareRow label={t('compare.authType')}>
          {authTypeChange ? (
            <span>
              <code>{authTypeChange.from}</code> → <code>{authTypeChange.to}</code>
              <span className="badge badge--warning" style={{ marginLeft: 6 }}>
                {t('compare.changed')}
              </span>
            </span>
          ) : (
            <span className="muted">
              <code>{c.base.summary?.authType ?? 'unknown'}</code> {t('compare.unchanged')}
            </span>
          )}
        </CompareRow>
        <CompareRow label={t('compare.confidence')}>
          <span>
            {Math.round(c.base.summary?.confidence ?? 0)} → {Math.round(c.next.summary?.confidence ?? 0)}{' '}
            <DeltaBadge value={confidenceDelta} />
          </span>
        </CompareRow>
        <CompareRow label={t('compare.loginCandidates')}>
          <span>
            {c.base.loginCandidates.length} → {c.next.loginCandidates.length}{' '}
            <DeltaBadge value={loginCandidateCountDelta} />
          </span>
        </CompareRow>
      </div>
    </div>
  );
}

function EndpointsCard({ c }: { c: FlowComparison }) {
  const { t } = useTranslation();
  const total = c.endpoints.added.length + c.endpoints.removed.length;
  return (
    <details className="disclosure" open={total > 0}>
      <summary>
        <span className="disclosure__title">{t('compare.endpointsHeading')}</span>
        <span className="muted text-xs">
          +{c.endpoints.added.length} / -{c.endpoints.removed.length} · {t('compare.commonCount', { count: c.endpoints.common })}
        </span>
      </summary>
      <div className="stack" style={{ gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
        {c.endpoints.added.length > 0 && (
          <DiffList label={t('analysis.addedLabel')} tone="success">
            {c.endpoints.added.map((e) => (
              <li key={`a-${e.host}${e.pathPattern}`}>
                <span className="badge-row">
                  {e.methods.map((m) => (
                    <span key={m} className="badge badge--info">{m}</span>
                  ))}
                </span>{' '}
                <code>{e.host}{e.pathPattern}</code>
              </li>
            ))}
          </DiffList>
        )}
        {c.endpoints.removed.length > 0 && (
          <DiffList label={t('analysis.removedLabel')} tone="danger">
            {c.endpoints.removed.map((e) => (
              <li key={`r-${e.host}${e.pathPattern}`}>
                <span className="badge-row">
                  {e.methods.map((m) => (
                    <span key={m} className="badge badge--info">{m}</span>
                  ))}
                </span>{' '}
                <code>{e.host}{e.pathPattern}</code>
              </li>
            ))}
          </DiffList>
        )}
        {total === 0 && <div className="muted text-sm">{t('compare.endpointsNoChange')}</div>}
      </div>
    </details>
  );
}

function CookiesCard({ c }: { c: FlowComparison }) {
  const { t } = useTranslation();
  const { namesAdded, namesRemoved, flagsChanged } = c.cookies;
  const total = namesAdded.length + namesRemoved.length + flagsChanged.length;
  return (
    <details className="disclosure" open={total > 0}>
      <summary>
        <span className="disclosure__title">{t('compare.cookiesHeading')}</span>
        <span className="muted text-xs">
          +{namesAdded.length} / -{namesRemoved.length} · {t('compare.flagsChanged', { count: flagsChanged.length })}
        </span>
      </summary>
      <div className="stack" style={{ gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
        {namesAdded.length > 0 && (
          <DiffList label={t('analysis.addedLabel')} tone="success">
            {namesAdded.map((n) => (
              <li key={`a-${n}`}><code>{n}</code></li>
            ))}
          </DiffList>
        )}
        {namesRemoved.length > 0 && (
          <DiffList label={t('analysis.removedLabel')} tone="danger">
            {namesRemoved.map((n) => (
              <li key={`r-${n}`}><code>{n}</code></li>
            ))}
          </DiffList>
        )}
        {flagsChanged.length > 0 && (
          <DiffList label={t('compare.flagsLabel')} tone="warning">
            {flagsChanged.map((f) => (
              <li key={`f-${f.name}`}>
                <code>{f.name}</code>{' '}
                <span className="muted text-xs">
                  {flagSummary(f.before)} → {flagSummary(f.after)}
                </span>
              </li>
            ))}
          </DiffList>
        )}
        {total === 0 && <div className="muted text-sm">{t('compare.cookiesNoChange')}</div>}
      </div>
    </details>
  );
}

function SecurityNotesCard({ c }: { c: FlowComparison }) {
  const { t } = useTranslation();
  const { added, removed } = c.securityNotes;
  const total = added.length + removed.length;
  return (
    <details className="disclosure" open={total > 0}>
      <summary>
        <span className="disclosure__title">{t('compare.securityHeading')}</span>
        <span className="muted text-xs">
          +{added.length} / -{removed.length}
        </span>
      </summary>
      <div className="stack" style={{ gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
        {added.length > 0 && (
          <DiffList label={t('compare.notesIntroduced')} tone="danger">
            {added.map((n, i) => (
              <li key={`a-${i}`}>
                <span className={`badge badge--${n.level === 'danger' ? 'danger' : n.level === 'warning' ? 'warning' : 'info'}`}>
                  {n.level}
                </span>{' '}
                {n.message}
              </li>
            ))}
          </DiffList>
        )}
        {removed.length > 0 && (
          <DiffList label={t('compare.notesResolved')} tone="success">
            {removed.map((n, i) => (
              <li key={`r-${i}`}>
                <span className={`badge badge--${n.level === 'danger' ? 'danger' : n.level === 'warning' ? 'warning' : 'info'}`}>
                  {n.level}
                </span>{' '}
                {n.message}
              </li>
            ))}
          </DiffList>
        )}
        {total === 0 && <div className="muted text-sm">{t('compare.securityNoChange')}</div>}
      </div>
    </details>
  );
}

function CompareRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="compare-summary__row">
      <div className="text-xs muted">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function DeltaBadge({ value }: { value: number }) {
  if (value === 0) return <span className="muted text-xs">±0</span>;
  const positive = value > 0;
  const cls = positive ? 'badge--success' : 'badge--warning';
  return <span className={`badge ${cls}`}>{positive ? '+' : ''}{Math.round(value)}</span>;
}

function DiffList({
  label,
  tone,
  children,
}: {
  label: string;
  tone: 'success' | 'warning' | 'danger';
  children: ReactNode;
}) {
  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      <div className="text-xs" style={{ fontWeight: 600 }}>
        <span className={`badge badge--${tone}`}>{label}</span>
      </div>
      <ul className="diff-list">{children}</ul>
    </div>
  );
}

function flagSummary(f: { httpOnly: boolean; secure: boolean; sameSite?: string }): string {
  const parts: string[] = [];
  parts.push(f.httpOnly ? 'HttpOnly' : '—');
  parts.push(f.secure ? 'Secure' : '—');
  parts.push(f.sameSite ? `SameSite=${f.sameSite}` : '—');
  return parts.join(' · ');
}

function shortHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function shortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function loadFlow(id: string): Promise<AuthFlow | undefined> {
  return store.getSessionFlow(id);
}

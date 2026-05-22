import { generateId, nowIso } from '@/core';
import type {
  AuthFlow,
  CookieSnapshot,
  RequestRecord,
  ResponseRecord,
  StorageSnapshot,
} from '@/core';
import { rankLoginCandidates } from './login/scoring.js';
import { diffCookies, diffStorage } from './artifacts/diff.js';
import { inferAuthType, toFlowSummary } from './auth-type/detect.js';
import { findOAuthFlow } from './auth-type/oauth.js';
import { validateOAuthFlow } from './auth-type/oauth-validation.js';
import { buildAuthEvents, buildAuthSteps } from './events.js';
import { extractRedirects } from './artifacts/redirects.js';

export type AnalyzeInput = {
  id?: string;
  targetUrl: string;
  startedAt?: string;
  endedAt?: string;
  requests: RequestRecord[];
  responses: ResponseRecord[];
  cookiesBefore: CookieSnapshot[];
  cookiesAfter: CookieSnapshot[];
  storageBefore: StorageSnapshot;
  storageAfter: StorageSnapshot;
};

export function analyze(input: AnalyzeInput): AuthFlow {
  const cookieDiff = diffCookies(input.cookiesBefore, input.cookiesAfter);
  const storageDiff = diffStorage(input.storageBefore, input.storageAfter);
  const candidates = rankLoginCandidates({
    requests: input.requests,
    responses: input.responses,
    cookieDiff,
  });
  const redirects = extractRedirects(input.responses);
  const events = buildAuthEvents({
    targetUrl: input.targetUrl,
    requests: input.requests,
    responses: input.responses,
    cookieDiff,
    storageDiff,
    loginCandidates: candidates,
  });
  const steps = buildAuthSteps(events);

  const inference = inferAuthType({
    requests: input.requests,
    responses: input.responses,
    cookieDiff,
    storageDiff,
    targetUrl: input.targetUrl,
    loginRequestId: candidates[0]?.requestId,
  });

  const summary = toFlowSummary(inference, candidates[0]?.requestId);
  // Merge OAuth-specific findings into the summary's warnings. They share
  // the SecurityNote shape; validate is a no-op when no authorize/token
  // requests were captured.
  const flowSkeleton: AuthFlow = {
    id: input.id ?? generateId('flow'),
    targetUrl: input.targetUrl,
    startedAt: input.startedAt ?? nowIso(),
    endedAt: input.endedAt,
    requests: input.requests,
    responses: input.responses,
    redirects,
    events,
    steps,
    cookiesBefore: input.cookiesBefore,
    cookiesAfter: input.cookiesAfter,
    storageBefore: input.storageBefore,
    storageAfter: input.storageAfter,
    loginCandidates: candidates,
    summary,
  };
  const oauthInfo = findOAuthFlow(flowSkeleton);
  const oauthFindings = validateOAuthFlow(oauthInfo);
  if (oauthFindings.length > 0 && summary) {
    summary.warnings = [...summary.warnings, ...oauthFindings];
  }
  return flowSkeleton;
}

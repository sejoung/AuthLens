/**
 * Capture-vs-capture diff.
 *
 * Used to answer "what changed in our auth flow between these two captures?"
 * — typically a baseline session vs. a post-deploy session. Pure function over
 * two AuthFlows; no I/O. Consumes the same discovered-endpoint / cookie diff
 * primitives the rest of the analyzer uses, so additions to those propagate.
 */

import type { AuthFlow, AuthType, CookieSnapshot, SecurityNote } from '@/core';
import { discoverEndpoints, type DiscoveredEndpoint } from '../artifacts/discovered-endpoints.js';

export type CookieFlagChange = {
  name: string;
  before: { httpOnly: boolean; secure: boolean; sameSite?: string };
  after: { httpOnly: boolean; secure: boolean; sameSite?: string };
};

export type SecurityNoteChange = {
  added: SecurityNote[];
  removed: SecurityNote[];
};

export type FlowComparison = {
  base: AuthFlow;
  next: AuthFlow;
  summary: {
    authTypeChange?: { from: AuthType; to: AuthType };
    confidenceDelta: number;
    loginCandidateCountDelta: number;
  };
  endpoints: {
    added: DiscoveredEndpoint[];
    removed: DiscoveredEndpoint[];
    common: number;
  };
  cookies: {
    namesAdded: string[];
    namesRemoved: string[];
    flagsChanged: CookieFlagChange[];
  };
  securityNotes: SecurityNoteChange;
};

export function compareFlows(base: AuthFlow, next: AuthFlow): FlowComparison {
  const baseEndpoints = discoverEndpoints(base);
  const nextEndpoints = discoverEndpoints(next);
  const endpointKey = (e: DiscoveredEndpoint) => `${e.host}|${e.pathPattern}`;
  const baseKeys = new Set(baseEndpoints.map(endpointKey));
  const nextKeys = new Set(nextEndpoints.map(endpointKey));
  const endpoints = {
    added: nextEndpoints.filter((e) => !baseKeys.has(endpointKey(e))),
    removed: baseEndpoints.filter((e) => !nextKeys.has(endpointKey(e))),
    common: [...baseKeys].filter((k) => nextKeys.has(k)).length,
  };

  const cookies = diffCookieFlagsAcrossFlows(base.cookiesAfter, next.cookiesAfter);
  const securityNotes = diffSecurityNotes(base.summary?.warnings ?? [], next.summary?.warnings ?? []);

  const summary: FlowComparison['summary'] = {
    confidenceDelta: (next.summary?.confidence ?? 0) - (base.summary?.confidence ?? 0),
    loginCandidateCountDelta: next.loginCandidates.length - base.loginCandidates.length,
  };
  const baseType = base.summary?.authType;
  const nextType = next.summary?.authType;
  if (baseType && nextType && baseType !== nextType) {
    summary.authTypeChange = { from: baseType, to: nextType };
  }

  return { base, next, summary, endpoints, cookies, securityNotes };
}

function diffCookieFlagsAcrossFlows(
  baseAfter: CookieSnapshot[],
  nextAfter: CookieSnapshot[],
): FlowComparison['cookies'] {
  // Key by name only (not domain) — same cookie name on the same effective
  // site is what users mean by "the same cookie" when comparing captures.
  const baseByName = new Map(baseAfter.map((c) => [c.name, c]));
  const nextByName = new Map(nextAfter.map((c) => [c.name, c]));
  const namesAdded: string[] = [];
  const namesRemoved: string[] = [];
  const flagsChanged: CookieFlagChange[] = [];

  for (const [name, after] of nextByName) {
    const before = baseByName.get(name);
    if (!before) {
      namesAdded.push(name);
      continue;
    }
    if (
      before.httpOnly !== after.httpOnly ||
      before.secure !== after.secure ||
      before.sameSite !== after.sameSite
    ) {
      flagsChanged.push({
        name,
        before: { httpOnly: before.httpOnly, secure: before.secure, sameSite: before.sameSite },
        after: { httpOnly: after.httpOnly, secure: after.secure, sameSite: after.sameSite },
      });
    }
  }
  for (const name of baseByName.keys()) {
    if (!nextByName.has(name)) namesRemoved.push(name);
  }
  return { namesAdded, namesRemoved, flagsChanged };
}

function diffSecurityNotes(
  baseWarnings: SecurityNote[],
  nextWarnings: SecurityNote[],
): SecurityNoteChange {
  // SecurityNote.message is the stable identity — same code path produces the
  // same message string. Level is informational so we ignore it for matching.
  const baseMessages = new Set(baseWarnings.map((w) => w.message));
  const nextMessages = new Set(nextWarnings.map((w) => w.message));
  return {
    added: nextWarnings.filter((w) => !baseMessages.has(w.message)),
    removed: baseWarnings.filter((w) => !nextMessages.has(w.message)),
  };
}

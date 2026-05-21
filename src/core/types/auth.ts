import type { CookieSnapshot, StorageSnapshot } from './snapshot.js';
import type { RedirectStep, RequestRecord, ResponseRecord } from './network.js';

export type AuthType =
  | 'cookie-session'
  | 'jwt'
  | 'oauth'
  | 'oidc'
  | 'sso'
  | 'unknown';

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export type AuthSignal = {
  kind: string;
  description: string;
  weight: number;
};

export type SecurityNote = {
  level: 'info' | 'warning' | 'danger';
  message: string;
};

export type LoginCandidate = {
  requestId: string;
  score: number;
  confidence: ConfidenceLevel;
  reasons: string[];
};

export type AuthEventBase = {
  type: string;
  timestamp: string;
};

export type PageLoadEvent = AuthEventBase & {
  type: 'page_load';
  url: string;
};

export type LoginRequestDetectedEvent = AuthEventBase & {
  type: 'login_request_detected';
  requestId: string;
  score: number;
  reasons: string[];
};

export type RedirectDetectedEvent = AuthEventBase & {
  type: 'redirect_detected';
  fromUrl: string;
  toUrl: string;
  status: number;
  isCrossDomain: boolean;
};

export type CookieChangedEvent = AuthEventBase & {
  type: 'cookie_changed';
  cookieName: string;
  change: 'added' | 'changed' | 'removed';
  httpOnly?: boolean;
};

export type TokenStoredEvent = AuthEventBase & {
  type: 'token_stored';
  storage: 'localStorage' | 'sessionStorage';
  key: string;
  format: 'jwt' | 'opaque' | 'unknown';
};

export type CsrfDetectedEvent = AuthEventBase & {
  type: 'csrf_detected';
  source: 'cookie' | 'header' | 'body' | 'meta';
  tokenName: string;
};

export type ProfileRequestDetectedEvent = AuthEventBase & {
  type: 'profile_request_detected';
  requestId: string;
  url: string;
};

export type SessionVerifiedEvent = AuthEventBase & {
  type: 'session_verified';
  requestId: string;
};

export type UnknownAuthEvent = AuthEventBase & {
  type: 'unknown';
  note: string;
};

export type AuthEvent =
  | PageLoadEvent
  | LoginRequestDetectedEvent
  | RedirectDetectedEvent
  | CookieChangedEvent
  | TokenStoredEvent
  | CsrfDetectedEvent
  | ProfileRequestDetectedEvent
  | SessionVerifiedEvent
  | UnknownAuthEvent;

export type AuthStep = {
  id: string;
  index: number;
  event: AuthEvent;
  requestId?: string;
  responseId?: string;
  description: string;
};

export type AuthFlowSummary = {
  authType: AuthType;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  loginRequestId?: string;
  detectedSignals: AuthSignal[];
  warnings: SecurityNote[];
};

export type AuthFlow = {
  id: string;
  targetUrl: string;
  startedAt: string;
  endedAt?: string;
  requests: RequestRecord[];
  responses: ResponseRecord[];
  redirects: RedirectStep[];
  events: AuthEvent[];
  steps: AuthStep[];
  cookiesBefore: CookieSnapshot[];
  cookiesAfter: CookieSnapshot[];
  storageBefore: StorageSnapshot;
  storageAfter: StorageSnapshot;
  loginCandidates: LoginCandidate[];
  summary?: AuthFlowSummary;
};

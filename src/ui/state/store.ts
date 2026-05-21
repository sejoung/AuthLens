import { useSyncExternalStore } from 'react';
import type { AuthFlow } from '@/core';
import { InMemorySessionStore } from '@/storage';
import type { SessionSummary, StoredSession } from '@/storage';
import {
  isTauri,
  listenCapture,
  startCaptureBackend,
  stopCaptureBackend,
  type CaptureEvent,
} from '../tauri/bridge.js';
import { buildFlowFromCapture } from '../tauri/sidecar-adapter.js';

export type Route = 'home' | 'capture' | 'analysis' | 'report' | 'settings';

export type CaptureStatus = 'idle' | 'running' | 'stopping' | 'analyzing';

export type AppState = {
  route: Route;
  targetUrl: string;
  captureStatus: CaptureStatus;
  captureStats: { requestCount: number; authCandidateCount: number };
  activeFlow?: AuthFlow;
  recentSessions: SessionSummary[];
  noticeAcknowledged: boolean;
  /** Capture중 실시간 요청 목록 (간소화) */
  liveRequests: Array<{
    id: string;
    method: string;
    url: string;
    status?: number;
    timestamp: string;
    isLoginCandidate?: boolean;
  }>;
  /** true면 Tauri Playwright backend 사용, false면 브라우저 데모 시뮬레이션. */
  backendAvailable: boolean;
  captureError?: string;
  settings: {
    bodyPreviewLimit: number;
    revealRawByDefault: boolean;
    headful: boolean;
    experimentalReplay: boolean;
  };
};

type Listener = () => void;

class Store {
  private state: AppState = {
    route: 'home',
    targetUrl: '',
    captureStatus: 'idle',
    captureStats: { requestCount: 0, authCandidateCount: 0 },
    recentSessions: [],
    noticeAcknowledged: false,
    liveRequests: [],
    backendAvailable: isTauri(),
    settings: {
      bodyPreviewLimit: 8 * 1024,
      revealRawByDefault: false,
      headful: true,
      experimentalReplay: false,
    },
  };
  private listeners = new Set<Listener>();
  private sessionStore = new InMemorySessionStore();
  private finishedSeen = false;
  private listenerReady?: Promise<void>;
  private stopTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    void this.sessionStore.init();
    const ack = readNoticeAck();
    if (ack) this.state = { ...this.state, noticeAcknowledged: true };
    console.info('[authlens] store init, backendAvailable=', isTauri());
    this.listenerReady = this.attachCaptureListener();
  }

  private async attachCaptureListener() {
    if (!isTauri()) {
      console.info('[authlens] not in Tauri, skipping capture-event listener');
      return;
    }
    try {
      const unlisten = await listenCapture((event) => {
        console.info('[authlens] capture-event:', event.type);
        this.handleCaptureEvent(event);
      });
      console.info('[authlens] capture-event listener attached:', unlisten ? 'ok' : 'no-unlisten-handle');
    } catch (e) {
      console.error('[authlens] capture-event listener attach failed:', e);
      this.setState({ captureError: `Listener attach failed: ${(e as Error).message}` });
    }
  }

  private handleCaptureEvent(event: CaptureEvent) {
    switch (event.type) {
      case 'started':
        this.finishedSeen = false;
        this.setState({ captureError: undefined });
        return;
      case 'request': {
        const r = event.payload;
        const entry = {
          id: r.id,
          method: r.method,
          url: r.url,
          timestamp: r.timestamp,
          isLoginCandidate: looksLikeLoginUrl(r.url, r.method),
        };
        const list = [...this.state.liveRequests, entry];
        this.setState({
          liveRequests: list,
          captureStats: {
            requestCount: list.length,
            authCandidateCount: list.filter((x) => x.isLoginCandidate).length,
          },
        });
        return;
      }
      case 'response': {
        const updated = this.state.liveRequests.map((r) =>
          r.id === event.payload.requestId ? { ...r, status: event.payload.status } : r,
        );
        this.setState({ liveRequests: updated });
        return;
      }
      case 'finished': {
        this.finishedSeen = true;
        if (this.stopTimer) {
          clearTimeout(this.stopTimer);
          this.stopTimer = undefined;
        }
        try {
          const flow = buildFlowFromCapture(event.payload);
          this.setActiveFlow(flow);
          void this.saveActiveFlow();
        } catch (e) {
          console.error('[authlens] buildFlowFromCapture failed:', e);
          this.setState({
            captureStatus: 'idle',
            captureError: `Failed to build flow from capture: ${(e as Error).message}`,
          });
        }
        return;
      }
      case 'error':
        this.setState({ captureError: event.message });
        return;
      case 'stderr':
        // stderr from the sidecar is usually Playwright/Chromium noise — log to
        // console for inspection but don't surface as a UI error.
        console.warn('[sidecar stderr]', event.message);
        return;
      case 'closed':
        if (this.stopTimer) {
          clearTimeout(this.stopTimer);
          this.stopTimer = undefined;
        }
        // Sidecar process exited. If we never received a `finished` event the
        // capture was cut short (crash, manual browser close, etc.) — surface
        // it explicitly so the user isn't stranded on the Capture screen.
        if (!this.finishedSeen && this.state.captureStatus !== 'idle') {
          this.setState({
            captureStatus: 'idle',
            captureError:
              this.state.captureError ??
              'Capture ended without a final result. The browser may have closed before analysis ran.',
          });
        } else if (this.state.captureStatus === 'running' || this.state.captureStatus === 'stopping') {
          this.setState({ captureStatus: 'idle' });
        }
        return;
    }
  }

  getState = (): AppState => this.state;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private setState(partial: Partial<AppState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((l) => l());
  }

  navigate = (route: Route) => this.setState({ route });

  setTargetUrl = (url: string) => this.setState({ targetUrl: url });

  acknowledgeNotice = () => {
    writeNoticeAck();
    this.setState({ noticeAcknowledged: true });
  };

  updateSettings = (patch: Partial<AppState['settings']>) =>
    this.setState({ settings: { ...this.state.settings, ...patch } });

  /**
   * Capture 시작. Tauri 환경이면 Node sidecar를 spawn해 진짜 Playwright 헤드풀 캡처.
   * 브라우저(dev preview)에서는 demo 시뮬레이션으로 fallback.
   */
  startCapture = async (url: string) => {
    this.finishedSeen = false;
    this.setState({
      route: 'capture',
      targetUrl: url,
      captureStatus: 'running',
      liveRequests: [],
      captureStats: { requestCount: 0, authCandidateCount: 0 },
      captureError: undefined,
    });
    if (isTauri()) {
      // Make sure the event listener is up before kicking off the backend,
      // otherwise early `request`/`started` events can be missed.
      try {
        await this.listenerReady;
      } catch {
        /* listener errors already surfaced */
      }
      console.info('[authlens] invoking start_capture', { url });
      try {
        await startCaptureBackend(url, {
          headful: this.state.settings.headful,
          bodyPreviewLimit: this.state.settings.bodyPreviewLimit,
        });
      } catch (e) {
        console.error('[authlens] start_capture failed:', e);
        this.setState({
          captureError: (e as Error).message ?? String(e),
          captureStatus: 'idle',
        });
      }
    }
  };

  /** Tauri 환경에서 sidecar에 stop 신호 → finished 이벤트가 와서 setActiveFlow로 마무리됨. */
  requestStopCapture = async () => {
    if (!isTauri()) {
      this.setState({ captureStatus: 'idle' });
      return;
    }
    this.setState({ captureStatus: 'stopping' });
    // Fallback: if `finished` never arrives within 30s, give up so the user
    // isn't stranded on the Capture screen.
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = setTimeout(() => {
      if (this.state.captureStatus === 'stopping') {
        console.warn('[authlens] no finished event within 30s — surfacing error');
        this.setState({
          captureStatus: 'idle',
          captureError:
            'Capture did not produce a result within 30s. The browser may have closed or the sidecar hung.',
        });
      }
    }, 30000);
    try {
      console.info('[authlens] invoking stop_capture');
      await stopCaptureBackend();
      console.info('[authlens] stop_capture resolved (waiting for finished event)');
    } catch (e) {
      console.error('[authlens] stop_capture failed:', e);
      this.setState({
        captureError: (e as Error).message ?? String(e),
        captureStatus: 'idle',
      });
    }
  };

  appendLiveRequest = (entry: AppState['liveRequests'][number]) => {
    const list = [...this.state.liveRequests, entry];
    this.setState({
      liveRequests: list,
      captureStats: {
        requestCount: list.length,
        authCandidateCount: list.filter((r) => r.isLoginCandidate).length,
      },
    });
  };

  setActiveFlow = (flow: AuthFlow) =>
    this.setState({
      activeFlow: flow,
      captureStatus: 'idle',
      route: 'analysis',
    });

  stopCapture = () =>
    this.setState({
      captureStatus: 'idle',
    });

  saveActiveFlow = async () => {
    if (!this.state.activeFlow) return;
    const flow = this.state.activeFlow;
    const stored: StoredSession = {
      id: flow.id,
      targetUrl: flow.targetUrl,
      startedAt: flow.startedAt,
      endedAt: flow.endedAt,
      authType: flow.summary?.authType,
      confidence: flow.summary?.confidence,
      flow,
    };
    await this.sessionStore.saveSession(stored);
    const recent = await this.sessionStore.listSessions();
    this.setState({ recentSessions: recent });
  };

  loadRecent = async () => {
    const recent = await this.sessionStore.listSessions();
    this.setState({ recentSessions: recent });
  };

  deleteSession = async (id: string) => {
    await this.sessionStore.deleteSession(id);
    await this.loadRecent();
  };

  deleteAll = async () => {
    await this.sessionStore.deleteAll();
    await this.loadRecent();
  };

  loadSession = async (id: string) => {
    const s = await this.sessionStore.getSession(id);
    if (s) {
      this.setState({ activeFlow: s.flow, route: 'analysis' });
    }
  };
}

export const store = new Store();

export function useAppState(): AppState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

const NOTICE_KEY = 'authlens.noticeAcknowledged';
function readNoticeAck(): boolean {
  try {
    return localStorage.getItem(NOTICE_KEY) === '1';
  } catch {
    return false;
  }
}
function writeNoticeAck() {
  try {
    localStorage.setItem(NOTICE_KEY, '1');
  } catch {
    // ignore
  }
}

/**
 * Quick heuristic for highlighting login candidates in the live request list.
 * Full scoring runs at analysis time — this is just for the live UI badge.
 */
function looksLikeLoginUrl(url: string, method: string): boolean {
  const upper = method.toUpperCase();
  if (upper !== 'POST') return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('login') ||
    lower.includes('signin') ||
    lower.includes('sign-in') ||
    lower.includes('sign_in') ||
    lower.includes('/auth') ||
    lower.includes('/session') ||
    lower.includes('/token')
  );
}

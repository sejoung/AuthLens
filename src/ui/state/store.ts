import { useSyncExternalStore } from 'react';
import type { AuthFlow } from '@/core';
import { InMemorySessionStore } from '@/storage';
import type { SessionSummary, StoredSession } from '@/storage';

export type Route = 'home' | 'capture' | 'analysis' | 'report' | 'settings';

export type CaptureStatus = 'idle' | 'running' | 'analyzing';

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
    settings: {
      bodyPreviewLimit: 8 * 1024,
      revealRawByDefault: false,
      headful: true,
      experimentalReplay: false,
    },
  };
  private listeners = new Set<Listener>();
  private sessionStore = new InMemorySessionStore();

  constructor() {
    void this.sessionStore.init();
    const ack = readNoticeAck();
    if (ack) this.state = { ...this.state, noticeAcknowledged: true };
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

  /** Demo용: 캡처 시작 — UI 시연 가능하도록 mock 데이터를 실시간으로 추가. */
  startCapture = async (url: string) => {
    this.setState({
      route: 'capture',
      targetUrl: url,
      captureStatus: 'running',
      liveRequests: [],
      captureStats: { requestCount: 0, authCandidateCount: 0 },
    });
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

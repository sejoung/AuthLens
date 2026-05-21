import type { UnlistenFn } from '@tauri-apps/api/event';

/**
 * Tauri 환경 여부. 브라우저(Vite dev)에서는 false → demo 시뮬레이션 path 사용.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_IPC__' in window;
}

export type CaptureEvent =
  | { type: 'started'; target: string; startedAt: string }
  | { type: 'request'; payload: SidecarRequest }
  | { type: 'response'; payload: SidecarResponse }
  | { type: 'finished'; payload: SidecarRawCapture }
  | { type: 'error'; message: string }
  | { type: 'stderr'; message: string }
  | { type: 'closed' };

export type SidecarRequest = {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  resourceType: string;
  timestamp: string;
  frameUrl?: string;
};

export type SidecarResponse = {
  id: string;
  requestId: string;
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  contentType?: string;
  body?: string;
  bodySize?: number;
  isBinary?: boolean;
  timestamp: string;
};

export type SidecarCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: string;
  expires?: number;
};

export type SidecarRawCapture = {
  target: string;
  startedAt: string;
  endedAt: string;
  requests: SidecarRequest[];
  responses: SidecarResponse[];
  cookiesBefore: SidecarCookie[];
  cookiesAfter: SidecarCookie[];
  storage: {
    localStorage: Array<{ key: string; value: string }>;
    sessionStorage: Array<{ key: string; value: string }>;
  };
};

/**
 * Dynamic-import @tauri-apps/api so non-Tauri builds don't fail at runtime.
 */
export async function listenCapture(
  handler: (event: CaptureEvent) => void,
): Promise<UnlistenFn | undefined> {
  if (!isTauri()) return undefined;
  const { listen } = await import('@tauri-apps/api/event');
  const unlisten = await listen<CaptureEvent>('capture-event', (e) => {
    handler(e.payload);
  });
  return unlisten;
}

export async function startCaptureBackend(
  targetUrl: string,
  options: { headful: boolean; bodyPreviewLimit: number },
): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/tauri');
  await invoke('start_capture', {
    targetUrl,
    headful: options.headful,
    bodyPreviewLimit: options.bodyPreviewLimit,
  });
}

export async function stopCaptureBackend(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/tauri');
  await invoke('stop_capture');
}

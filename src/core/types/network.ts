import type { HeaderMap, SensitiveText } from './sensitive.js';

export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS'
  | 'CONNECT'
  | 'TRACE';

export type ResourceType =
  | 'document'
  | 'stylesheet'
  | 'image'
  | 'media'
  | 'font'
  | 'script'
  | 'texttrack'
  | 'xhr'
  | 'fetch'
  | 'eventsource'
  | 'websocket'
  | 'manifest'
  | 'other';

export type RequestRecord = {
  id: string;
  url: string;
  method: HttpMethod | string;
  headers: HeaderMap;
  postData?: SensitiveText;
  resourceType: ResourceType | string;
  timestamp: string;
  frameUrl?: string;
};

export type ResponseRecord = {
  id: string;
  requestId: string;
  url: string;
  status: number;
  statusText: string;
  headers: HeaderMap;
  contentType?: string;
  bodyPreview?: SensitiveText;
  bodySize?: number;
  isBinary?: boolean;
  timestamp: string;
};

export type RedirectStep = {
  fromUrl: string;
  toUrl: string;
  status: number;
  timestamp: string;
};

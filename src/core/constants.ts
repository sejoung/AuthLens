/**
 * 민감 정보로 간주되는 헤더/필드/스토리지 key 이름.
 * 대소문자 무시 비교를 위해 모두 lowercase로 저장.
 */
export const SENSITIVE_KEYS: readonly string[] = [
  'password',
  'passwd',
  'pwd',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'authorization',
  'cookie',
  'set-cookie',
  'session',
  'csrf',
  'xsrf',
];

export const SENSITIVE_KEY_SET: ReadonlySet<string> = new Set(SENSITIVE_KEYS);

/**
 * 인증 흐름 후보로 평가될 수 있는 URL 키워드와 가중치.
 * ARCHITECTURE.md 7.1 Login Request Scoring 기반.
 */
export const URL_KEYWORD_SCORES: ReadonlyArray<{ keyword: string; score: number }> = [
  { keyword: 'login', score: 20 },
  { keyword: 'signin', score: 20 },
  { keyword: 'sign-in', score: 20 },
  { keyword: 'sign_in', score: 20 },
  { keyword: 'auth', score: 15 },
  { keyword: 'session', score: 15 },
  { keyword: 'token', score: 15 },
];

export const POST_METHOD_SCORE = 20;
export const PASSWORD_FIELD_SCORE = 30;
export const SET_COOKIE_RESPONSE_SCORE = 25;
export const TOKEN_IN_RESPONSE_SCORE = 25;
export const COOKIE_CHANGED_AFTER_SCORE = 20;
export const PROFILE_FOLLOW_UP_SCORE = 20;

/**
 * Profile/me 호출 후보 path.
 */
export const PROFILE_PATH_PATTERNS: readonly string[] = [
  '/me',
  '/profile',
  '/user',
  '/users/me',
  '/account',
  '/whoami',
  '/userinfo',
];

/**
 * 캡처 본문 크기 제한 (bytes).
 */
export const DEFAULT_BODY_PREVIEW_LIMIT = 8 * 1024; // 8KB
export const MAX_BODY_PREVIEW_LIMIT = 64 * 1024; // 64KB

/**
 * 마스킹 후 노출할 prefix 길이.
 */
export const MASK_PREVIEW_LENGTH = 4;

/**
 * Auth confidence threshold.
 */
export const CONFIDENCE_HIGH_THRESHOLD = 80;
export const CONFIDENCE_MEDIUM_THRESHOLD = 50;

/**
 * Tool/Schema 버전 (export에 포함).
 */
export const SCHEMA_VERSION = '0.1';
export const TOOL_NAME = 'AuthLens';
export const TOOL_VERSION = '0.1.0-dev';

/**
 * Redirect status codes.
 */
export const REDIRECT_STATUS_CODES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/**
 * Binary content type prefixes (저장 제외 대상).
 */
export const BINARY_CONTENT_TYPE_PREFIXES: readonly string[] = [
  'image/',
  'video/',
  'audio/',
  'font/',
  'application/octet-stream',
  'application/pdf',
  'application/zip',
];

/**
 * Mermaid diagram에서 제외할 resource type.
 */
export const DIAGRAM_EXCLUDED_RESOURCE_TYPES: readonly string[] = [
  'image',
  'stylesheet',
  'font',
  'media',
];

/**
 * 첫 실행 안내 문구 (DESIGN_GUIDE.md 15절).
 */
export const FIRST_LAUNCH_NOTICE =
  'AuthLens is designed for authorized systems only. ' +
  'Use it for internal debugging, QA, documentation, and authentication flow analysis. ' +
  'Unauthorized use against third-party services may violate laws or terms of service.';

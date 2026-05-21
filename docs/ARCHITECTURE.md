# AuthLens Architecture

AuthLens는 허가된 웹 애플리케이션의 인증 흐름을 관찰, 분석, 시각화, 문서화하는 개발자 도구입니다.

이 문서는 AuthLens의 전체 구조, 모듈 책임, 데이터 흐름, 보안 경계, 확장 방향을 정의합니다.

---

## 1. Architecture Goal

AuthLens의 아키텍처 목표는 다음과 같습니다.

- 인증 흐름을 안전하게 관찰한다
- 네트워크 이벤트를 구조화된 데이터로 변환한다
- 인증 관련 신호를 분석한다
- 사람이 이해할 수 있는 Timeline, Diagram, Report로 변환한다
- 민감 정보는 기본적으로 저장하거나 노출하지 않는다
- Recorder, Analyzer, Reporter를 독립적으로 확장 가능하게 만든다

---

## 2. High-level Architecture

```text
┌─────────────────────────────────────────────────────┐
│                    Desktop App                      │
│                Tauri + React UI                     │
└───────────────────────┬─────────────────────────────┘
                        │
                        │ User starts capture
                        ▼
┌─────────────────────────────────────────────────────┐
│                  Browser Runtime                    │
│                    Playwright                       │
└───────────────────────┬─────────────────────────────┘
                        │
                        │ request / response / cookie / storage
                        ▼
┌─────────────────────────────────────────────────────┐
│                    Recorder                         │
│        Network Recorder / Snapshot Collector         │
└───────────────────────┬─────────────────────────────┘
                        │
                        │ Raw Capture Data
                        ▼
┌─────────────────────────────────────────────────────┐
│                    Normalizer                       │
│       RequestRecord / ResponseRecord / Snapshot      │
└───────────────────────┬─────────────────────────────┘
                        │
                        │ Normalized Flow Data
                        ▼
┌─────────────────────────────────────────────────────┐
│                    Analyzer                         │
│     Auth Classifier / Token Detector / Diff Engine   │
└───────────────────────┬─────────────────────────────┘
                        │
                        │ AuthFlow Model
                        ▼
┌─────────────────────────────────────────────────────┐
│                    Reporter                         │
│     Markdown / Mermaid / JSON / curl / fetch         │
└───────────────────────┬─────────────────────────────┘
                        │
                        │ Rendered output
                        ▼
┌─────────────────────────────────────────────────────┐
│                       UI                            │
│        Timeline / Inspector / Report Preview         │
└─────────────────────────────────────────────────────┘
```

---

## 3. Main Modules

AuthLens는 다음 모듈로 구성됩니다.

```text
packages/
  core/
  recorder/
  analyzer/
  reporter/
  storage/
  ui/
apps/
  desktop/
examples/
docs/
```

---

## 4. Module Responsibilities

## 4.1 apps/desktop

Tauri 기반 데스크탑 애플리케이션입니다.

책임:

- 앱 실행
- Tauri command 관리
- React UI 렌더링
- Playwright 실행 요청
- 로컬 파일 export
- OS별 앱 패키징

포함 기능:

- Home 화면
- Capture 화면
- Analysis 화면
- Report 화면
- Settings 화면

---

## 4.2 packages/core

공통 도메인 모델과 유틸리티를 포함합니다.

책임:

- 공통 타입 정의
- AuthFlow 모델 정의
- AuthEvent 모델 정의
- SensitiveValue 모델 정의
- 공통 에러 타입 정의
- 공통 상수 관리

예시 타입:

```ts
export type AuthFlow = {
  id: string;
  targetUrl: string;
  startedAt: string;
  endedAt?: string;
  requests: RequestRecord[];
  responses: ResponseRecord[];
  events: AuthEvent[];
  cookiesBefore: CookieSnapshot[];
  cookiesAfter: CookieSnapshot[];
  storageBefore: StorageSnapshot;
  storageAfter: StorageSnapshot;
  summary?: AuthFlowSummary;
};
```

---

## 4.3 packages/recorder

브라우저에서 발생하는 이벤트를 수집합니다.

책임:

- Playwright browser context 생성
- request 이벤트 캡처
- response 이벤트 캡처
- redirect chain 캡처
- cookie snapshot 수집
- localStorage/sessionStorage snapshot 수집
- 캡처 종료 시 RawCapture 생성

수집 대상:

- URL
- Method
- Headers
- Request Body
- Status Code
- Response Headers
- Response Body 일부
- Timestamp
- Resource Type
- Redirect 정보
- Cookie 변화
- Storage 변화

중요 정책:

- password, token, cookie 등 민감 정보는 즉시 마스킹 가능한 구조로 전달
- response body는 크기 제한을 둠
- binary response는 저장하지 않음
- 원문 저장은 기본 비활성

---

## 4.4 packages/analyzer

수집된 데이터를 분석하여 인증 흐름을 추론합니다.

책임:

- 로그인 요청 후보 탐지
- 인증 방식 추론
- cookie diff 분석
- storage diff 분석
- token 후보 탐지
- CSRF 후보 탐지
- OAuth/OIDC 흐름 탐지
- SSO redirect 탐지
- AuthEvent 생성
- AuthFlowSummary 생성

분석 결과 예시:

```ts
export type AuthFlowSummary = {
  authType: "cookie-session" | "jwt" | "oauth" | "oidc" | "sso" | "unknown";
  confidence: number;
  loginRequestId?: string;
  detectedSignals: AuthSignal[];
  warnings: SecurityNote[];
};
```

---

## 4.5 packages/reporter

분석된 AuthFlow를 사람이 읽을 수 있는 문서로 변환합니다.

책임:

- Markdown report 생성
- Mermaid diagram 생성
- JSON export 생성
- curl 예시 생성
- fetch 예시 생성
- 민감 정보 마스킹 적용
- export template 관리

출력 대상:

- `.md`
- `.json`
- `.har` 예정
- Mermaid diagram text

---

## 4.6 packages/storage

로컬 저장소를 담당합니다.

책임:

- SQLite 저장
- 최근 분석 목록 관리
- 분석 세션 저장
- 사용자 설정 저장
- 데이터 삭제 기능 제공

저장 원칙:

- 민감 정보는 기본 저장하지 않음
- 저장 전 마스킹 적용
- 사용자가 원문 저장을 명시적으로 허용하지 않는 한 저장 금지
- 분석 기록 전체 삭제 기능 제공

---

## 4.7 packages/ui

공통 UI 컴포넌트를 관리합니다.

책임:

- Button
- Card
- Badge
- Timeline
- RequestList
- RequestInspector
- CookieDiff
- StorageDiff
- MermaidPreview
- ReportPreview
- WarningDialog

---

## 5. Data Flow

## 5.1 Capture Flow

```text
User enters URL
  ↓
Desktop App starts CaptureSession
  ↓
Recorder launches Playwright
  ↓
User manually logs in
  ↓
Recorder captures request/response events
  ↓
Recorder collects cookie/storage snapshots
  ↓
User stops capture
  ↓
RawCapture is created
```

---

## 5.2 Analysis Flow

```text
RawCapture
  ↓
Normalizer
  ↓
NormalizedCapture
  ↓
Analyzer
  ↓
AuthEvent[]
  ↓
AuthFlow
  ↓
AuthFlowSummary
```

---

## 5.3 Report Flow

```text
AuthFlow
  ↓
Reporter
  ↓
Markdown Report
  ↓
Mermaid Diagram
  ↓
JSON Export
```

---

## 6. Domain Model

## 6.1 RequestRecord

```ts
export type RequestRecord = {
  id: string;
  url: string;
  method: string;
  headers: HeaderMap;
  postData?: SensitiveText;
  resourceType: string;
  timestamp: string;
  frameUrl?: string;
};
```

---

## 6.2 ResponseRecord

```ts
export type ResponseRecord = {
  id: string;
  requestId: string;
  url: string;
  status: number;
  statusText: string;
  headers: HeaderMap;
  contentType?: string;
  bodyPreview?: SensitiveText;
  timestamp: string;
};
```

---

## 6.3 AuthEvent

AuthEvent는 UI Timeline과 Report의 핵심 단위입니다.

```ts
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
```

예시:

```ts
export type LoginRequestDetectedEvent = {
  type: "login_request_detected";
  requestId: string;
  score: number;
  reasons: string[];
  timestamp: string;
};
```

---

## 6.4 CookieSnapshot

```ts
export type CookieSnapshot = {
  name: string;
  domain: string;
  path: string;
  value: SensitiveValue;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  expires?: number;
};
```

---

## 6.5 StorageSnapshot

```ts
export type StorageSnapshot = {
  localStorage: StorageEntry[];
  sessionStorage: StorageEntry[];
};

export type StorageEntry = {
  key: string;
  value: SensitiveValue;
};
```

---

## 6.6 SensitiveValue

민감 정보는 모든 모듈에서 동일한 모델로 다룹니다.

```ts
export type SensitiveValue = {
  masked: string;
  raw?: string;
  sensitivity: "none" | "low" | "medium" | "high";
  reason?: string;
};
```

원칙:

- UI는 기본적으로 `masked`만 사용
- `raw`는 기본 저장하지 않음
- export는 기본적으로 `masked`만 사용
- raw 표시에는 사용자 확인이 필요

---

## 7. Analyzer Design

## 7.1 Login Request Scoring

로그인 요청 후보는 점수 기반으로 탐지합니다.

점수 예시:

| Signal | Score |
|---|---:|
| URL contains `login` | +20 |
| URL contains `signin` | +20 |
| URL contains `auth` | +15 |
| URL contains `session` | +15 |
| URL contains `token` | +15 |
| Method is POST | +20 |
| Body contains password-like field | +30 |
| Response has Set-Cookie | +25 |
| Response contains token-like value | +25 |
| Cookie changed after request | +20 |
| Followed by `/me` or `/profile` request | +20 |

최종 결과:

```ts
export type LoginCandidate = {
  requestId: string;
  score: number;
  confidence: "low" | "medium" | "high";
  reasons: string[];
};
```

---

## 7.2 Auth Type Inference

AuthLens는 다음 인증 방식을 우선 추론합니다.

```text
cookie-session
jwt
oauth
oidc
sso
unknown
```

추론 기준:

### Cookie Session

- Set-Cookie 발생
- HttpOnly session cookie 존재
- 이후 요청에 cookie 포함
- localStorage token 변화 없음

### JWT

- JWT 형태 문자열 발견
- Authorization: Bearer header 발견
- localStorage/sessionStorage token key 발견

### OAuth/OIDC

- authorization endpoint
- client_id
- redirect_uri
- response_type
- code
- state
- token endpoint
- id_token

### SSO

- 외부 인증 도메인으로 redirect
- 로그인 후 원래 도메인 복귀
- SAML/OIDC 관련 파라미터 존재

---

## 8. Reporter Design

## 8.1 Markdown Report Sections

Markdown 리포트는 다음 구조를 가집니다.

```text
# AuthLens Report

## Summary
## Detected Authentication Type
## Timeline
## Login Request Candidate
## Cookie Changes
## Storage Changes
## Redirect Flow
## Mermaid Diagram
## Request Details
## Security Notes
```

---

## 8.2 Mermaid Diagram Rules

Mermaid 다이어그램은 인증 흐름에 중요한 이벤트만 포함합니다.

포함 대상:

- 로그인 페이지 진입
- CSRF token 수신
- 로그인 요청
- redirect
- Set-Cookie
- token exchange
- profile/me 요청
- session verified

제외 대상:

- 이미지
- 폰트
- CSS
- 일반 JS bundle
- analytics request

---

## 9. UI Architecture

## 9.1 Page Structure

```text
Home
Capture
Analysis
Report
Settings
```

---

## 9.2 Home

책임:

- URL 입력
- 안전 사용 안내
- 최근 분석 목록
- capture 시작

---

## 9.3 Capture

책임:

- 브라우저 세션 상태 표시
- 실시간 request list 표시
- auth candidate count 표시
- capture 종료

---

## 9.4 Analysis

책임:

- Auth summary 표시
- Timeline 표시
- Request detail 표시
- Cookie diff 표시
- Storage diff 표시
- Mermaid preview 표시

---

## 9.5 Report

책임:

- Markdown preview
- JSON preview
- export option
- masking 상태 표시
- 파일 저장

---

## 9.6 Settings

책임:

- masking policy
- body capture limit
- browser options
- data deletion
- experimental feature toggle

---

## 10. Persistence Architecture

AuthLens는 로컬 우선 구조를 사용합니다.

```text
SQLite
  ├─ capture_sessions
  ├─ auth_flows
  ├─ request_records
  ├─ response_records
  ├─ auth_events
  ├─ settings
```

---

## 10.1 capture_sessions

```text
id
target_url
started_at
ended_at
status
created_at
```

---

## 10.2 auth_flows

```text
id
capture_session_id
auth_type
confidence
summary_json
created_at
```

---

## 10.3 request_records

```text
id
capture_session_id
url
method
headers_json
post_data_masked
resource_type
timestamp
```

---

## 10.4 response_records

```text
id
request_id
status
headers_json
body_preview_masked
timestamp
```

---

## 10.5 auth_events

```text
id
auth_flow_id
type
payload_json
timestamp
```

---

## 11. Security Boundary

AuthLens는 다음 경계를 지켜야 합니다.

## 11.1 기본 금지

- 비밀번호 저장 금지
- token 원문 저장 금지
- cookie 원문 저장 금지
- 자동 로그인 시도 금지
- 반복 요청 자동화 금지
- CAPTCHA 우회 금지
- MFA 우회 금지
- fingerprint 우회 금지

---

## 11.2 허용

- 사용자가 직접 수행한 로그인 흐름 관찰
- request/response 구조 분석
- cookie 변화 분석
- storage 변화 분석
- redirect 흐름 분석
- Markdown 문서 생성
- Mermaid diagram 생성
- 마스킹된 curl/fetch 예시 생성

---

## 11.3 위험 기능 정책

다음 기능은 기본 비활성 또는 Labs로만 제공합니다.

- raw token reveal
- raw cookie reveal
- raw request export
- replay sandbox
- external AI summary

각 기능은 다음 조건을 만족해야 합니다.

- 명시적 사용자 동의
- 경고 표시
- 기본 마스킹 유지
- 자동 반복 호출 금지
- 로그에 민감 정보 기록 금지

---

## 12. Masking Architecture

민감 정보 마스킹은 Recorder 직후와 Reporter 직전에 모두 적용합니다.

```text
Recorder
  ↓
Initial Redaction
  ↓
Normalized Data
  ↓
Analyzer
  ↓
Report Redaction
  ↓
Export
```

마스킹 대상:

- password
- passwd
- pwd
- token
- access_token
- refresh_token
- id_token
- authorization
- cookie
- set-cookie
- session
- csrf
- xsrf

마스킹 예시:

```text
Authorization: Bearer eyJhb••••••••••••
Cookie: session=ab12••••••••••••
password: ••••••••
```

---

## 13. Error Handling

에러는 사용자에게 이해 가능한 메시지로 변환합니다.

예시:

| Internal Error | User Message |
|---|---|
| BrowserLaunchFailed | Browser could not be started. |
| CaptureTimeout | Capture session timed out. |
| StorageAccessDenied | Browser storage could not be inspected. |
| ReportExportFailed | Report export failed. |
| DatabaseWriteFailed | Analysis result could not be saved. |

원칙:

- 민감 정보가 에러 메시지에 포함되지 않아야 함
- 내부 stack trace는 개발 모드에서만 표시
- 사용자용 메시지는 짧고 명확해야 함

---

## 14. Logging Policy

로그는 최소화합니다.

허용 로그:

- app start
- capture start
- capture stop
- request count
- analyzer result type
- export success/failure

금지 로그:

- password
- token
- cookie
- authorization header
- full request body
- full response body

Logger는 반드시 redaction을 거쳐야 합니다.

```ts
logger.info("capture_finished", {
  requestCount,
  detectedAuthType,
});
```

---

## 15. Testing Architecture

## 15.1 Unit Tests

대상:

- masking
- cookie diff
- storage diff
- login scoring
- token detection
- auth type inference
- Mermaid generation
- Markdown generation

---

## 15.2 Integration Tests

대상:

- cookie session example app
- JWT example app
- CSRF example app
- OAuth-like redirect app

---

## 15.3 E2E Tests

대상:

- URL 입력
- capture 시작
- login 수행
- capture 종료
- analysis 표시
- report export

---

## 16. Example Apps

테스트와 데모를 위해 예제 앱을 제공합니다.

```text
examples/
  cookie-session-app/
  jwt-app/
  csrf-app/
  oauth-like-app/
  sso-like-app/
```

각 예제 앱은 다음을 포함합니다.

- login page
- protected page
- `/me` endpoint
- logout endpoint
- predictable test account
- safe dummy credentials

---

## 17. Extension Points

AuthLens는 장기적으로 다음 확장을 고려합니다.

## 17.1 Importers

- HAR import
- Chrome DevTools export import
- Playwright trace import

## 17.2 Analyzers

- CookieSessionAnalyzer
- JwtAnalyzer
- CsrfAnalyzer
- OAuthAnalyzer
- OidcAnalyzer
- SsoAnalyzer

## 17.3 Reporters

- MarkdownReporter
- JsonReporter
- MermaidReporter
- OpenApiDraftReporter

## 17.4 AI Assisted Analyzer

AI 기능은 기본 코어에 강하게 결합하지 않습니다.

```text
AuthFlow
  ↓
RedactedAuthFlow
  ↓
AI Summary Provider
```

원칙:

- 외부 AI API 사용 전 사용자 동의
- 민감 정보 제거 후 전달
- 로컬 모델 옵션 고려

---

## 18. Suggested Implementation Order

## Phase 1: Foundation

- [ ] Monorepo 구조 생성
- [ ] Tauri + React 앱 생성
- [ ] core 타입 정의
- [ ] URL 입력 화면 구현
- [ ] Playwright 실행 연결

## Phase 2: Recorder

- [ ] request capture
- [ ] response capture
- [ ] cookie snapshot
- [ ] storage snapshot
- [ ] RawCapture 생성

## Phase 3: Analyzer

- [ ] login request scoring
- [ ] cookie diff
- [ ] storage diff
- [ ] token detector
- [ ] auth type inference
- [ ] AuthEvent 생성

## Phase 4: UI

- [ ] request list
- [ ] timeline
- [ ] summary cards
- [ ] inspector panel
- [ ] cookie diff view
- [ ] storage diff view

## Phase 5: Reporter

- [ ] Mermaid generator
- [ ] Markdown reporter
- [ ] JSON export
- [ ] file save

## Phase 6: Safety & Release

- [ ] masking 적용
- [ ] first launch warning
- [ ] logs redaction
- [ ] example apps
- [ ] tests
- [ ] README 정리
- [ ] v0.1.0 release

---

## 19. Non-goals

AuthLens는 다음을 목표로 하지 않습니다.

- 침투 테스트 자동화 도구
- 취약점 공격 도구
- 계정 자동 로그인 도구
- 세션 탈취 도구
- CAPTCHA 우회 도구
- MFA 우회 도구
- 대량 계정 테스트 도구

AuthLens의 목표는 인증 흐름을 이해 가능한 문서와 시각 자료로 변환하는 것입니다.

---

## 20. Architecture Summary

AuthLens의 핵심 구조는 다음과 같습니다.

```text
Recorder captures what happened.
Analyzer explains what it means.
Reporter turns it into documentation.
UI helps humans understand the flow.
```

한국어로 정리하면 다음과 같습니다.

```text
Recorder는 실제 흐름을 수집하고,
Analyzer는 인증 의미를 해석하고,
Reporter는 문서와 다이어그램으로 변환하고,
UI는 사람이 이해하기 쉽게 보여준다.
```

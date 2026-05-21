# AuthLens Design Guide

AuthLens는 허가된 웹 애플리케이션의 인증 흐름을 관찰, 분석, 시각화, 문서화하는 개발자 도구입니다.

이 디자인 가이드는 앱 UI, 문서, 아이콘, 색상, 컴포넌트, UX 문구의 일관성을 유지하기 위한 기준입니다.

---

## 1. Design Principle

### 핵심 방향

AuthLens의 디자인은 공격적인 보안 도구가 아니라, 개발자 친화적인 분석 도구처럼 보여야 합니다.

```text
관찰
분석
흐름
문서화
신뢰
차분함
```

### 지향점

- 개발자가 오래 봐도 피로하지 않은 UI
- 복잡한 인증 흐름을 이해하기 쉽게 정리
- 위험하거나 민감한 정보는 명확히 구분
- DevTools보다 친절하고, 보안툴보다 가벼운 느낌
- 시스템 구조를 시각적으로 이해시키는 도구

### 피해야 할 느낌

- 해킹툴
- 공격 도구
- 어두운 터미널 해커 감성
- Matrix 스타일
- 붉은 경고 남발
- 과도한 네온 효과
- 자물쇠가 깨지는 이미지
- 후드 쓴 해커 이미지

---

## 2. Brand Keywords

AuthLens를 설명하는 핵심 키워드입니다.

```text
Auth
Lens
Flow
Trace
Observe
Inspect
Document
Visualize
```

한국어로는 다음 느낌입니다.

```text
인증 흐름 관찰
인증 구조 분석
로그인 과정 문서화
개발자용 인증 분석 도구
```

---

## 3. Visual Identity

### 대표 컨셉

```text
Lens + Flow
```

렌즈를 통해 인증 흐름을 관찰한다는 개념입니다.

아이콘, 빈 상태 화면, 다이어그램, 로딩 애니메이션에 일관되게 사용할 수 있습니다.

### 주요 시각 요소

- 렌즈
- 노드
- 연결선
- 흐름 화살표
- 타임라인
- 카드 기반 정보 구조
- Mermaid-style sequence diagram

---

## 4. Color System

### Primary Palette

| Name | Hex | Usage |
|---|---:|---|
| Navy 950 | `#020617` | 가장 깊은 배경 |
| Navy 900 | `#0F172A` | 메인 배경 |
| Slate 800 | `#1E293B` | 카드 배경 |
| Slate 700 | `#334155` | 보조 카드/라인 |
| Cyan 500 | `#06B6D4` | Primary accent |
| Sky 400 | `#38BDF8` | Highlight |
| Blue 500 | `#3B82F6` | Link / action |
| Emerald 400 | `#34D399` | Success |
| Amber 400 | `#FBBF24` | Warning |
| Rose 400 | `#FB7185` | Danger / sensitive |

### Background

```css
--background: #0F172A;
--background-deep: #020617;
--surface: #1E293B;
--surface-muted: #334155;
```

### Accent

```css
--primary: #06B6D4;
--primary-hover: #0891B2;
--primary-soft: rgba(6, 182, 212, 0.12);
```

### Text

```css
--text-primary: #F8FAFC;
--text-secondary: #CBD5E1;
--text-muted: #94A3B8;
--text-disabled: #64748B;
```

### Status Colors

```css
--success: #34D399;
--warning: #FBBF24;
--danger: #FB7185;
--info: #38BDF8;
```

### 사용 원칙

- Cyan은 핵심 액션과 흐름 강조에만 사용
- Red/Rose는 민감 정보, 위험 액션에만 제한적으로 사용
- 배경은 어둡게 유지하되 텍스트 대비를 충분히 확보
- 너무 많은 색상을 동시에 사용하지 않음
- 인증 흐름의 상태는 색상 + 아이콘 + 텍스트를 함께 사용

---

## 5. Typography

### 추천 폰트

#### UI

```text
Inter
Pretendard
system-ui
```

#### Code / Request / Response

```text
JetBrains Mono
SFMono-Regular
Menlo
Consolas
monospace
```

### Font Scale

| Token | Size | Usage |
|---|---:|---|
| xs | 12px | metadata, badge |
| sm | 14px | secondary text |
| base | 16px | body |
| lg | 18px | card title |
| xl | 20px | section title |
| 2xl | 24px | page title |
| 3xl | 30px | hero title |

### Font Weight

| Token | Weight | Usage |
|---|---:|---|
| regular | 400 | body |
| medium | 500 | label |
| semibold | 600 | card title |
| bold | 700 | page title |

---

## 6. Layout System

### App Structure

```text
Sidebar
  - Home
  - Capture
  - Analysis
  - Reports
  - Settings

Main Panel
  - Page Header
  - Summary Cards
  - Detail Panels
  - Timeline / Diagram

Right Panel
  - Selected Request Detail
  - Cookie Diff
  - Storage Diff
```

### 기본 레이아웃

```text
┌─────────────────────────────────────────────┐
│ Top Bar                                     │
├──────────────┬──────────────────┬───────────┤
│ Sidebar      │ Main Content     │ Inspector │
│              │                  │           │
└──────────────┴──────────────────┴───────────┘
```

### Spacing

| Token | Size |
|---|---:|
| 1 | 4px |
| 2 | 8px |
| 3 | 12px |
| 4 | 16px |
| 5 | 20px |
| 6 | 24px |
| 8 | 32px |
| 10 | 40px |
| 12 | 48px |

### Radius

| Token | Size | Usage |
|---|---:|---|
| sm | 6px | input, badge |
| md | 10px | button |
| lg | 14px | card |
| xl | 20px | modal |
| 2xl | 24px | large panel |

### Shadow

- 기본적으로 강한 그림자는 사용하지 않음
- 카드에는 subtle border 중심
- 모달이나 floating panel에만 soft shadow 사용

```css
--shadow-soft: 0 12px 40px rgba(2, 6, 23, 0.35);
```

---

## 7. Component Guidelines

## Button

### Primary Button

사용처:

- Start Capture
- Export Report
- Generate Diagram

스타일:

```text
Background: Cyan 500
Text: Navy 950
Radius: 10px
Font Weight: 600
```

### Secondary Button

사용처:

- Cancel
- Back
- View Detail

스타일:

```text
Background: Slate 800
Border: Slate 700
Text: Text Primary
```

### Danger Button

사용처:

- Delete Session
- Reveal Secret
- Export Raw Token

스타일:

```text
Background: transparent
Border: Rose 400
Text: Rose 400
```

Danger 버튼은 항상 확인 다이얼로그를 거쳐야 합니다.

---

## 8. Cards

### Summary Card

사용처:

- Auth Type
- Login Candidate
- Cookie Changes
- Token Storage
- Redirect Count

구성:

```text
Icon
Title
Value
Short Description
Status Badge
```

### Request Card

사용처:

- Network request list

포함 정보:

```text
Method
URL Path
Status Code
Auth Score
Detected Tags
Timestamp
```

예시 태그:

```text
Login Candidate
Set-Cookie
CSRF
Bearer Token
Redirect
Profile API
```

---

## 9. Badges

### Method Badge

| Method | Color Usage |
|---|---|
| GET | Blue |
| POST | Cyan |
| PUT/PATCH | Amber |
| DELETE | Rose |

### Status Badge

| Status | Meaning |
|---|---|
| 2xx | Success |
| 3xx | Redirect |
| 4xx | Client Error |
| 5xx | Server Error |

### Auth Badge

```text
Cookie Session
JWT
CSRF
OAuth
OIDC
SSO
Unknown
```

---

## 10. Timeline Design

Timeline은 AuthLens의 핵심 화면입니다.

### Timeline Item

각 항목은 다음 정보를 가져야 합니다.

```text
Time
Event Type
Method + Path
Short Summary
Detected Signal
```

### Event Types

```text
Page Load
Login Form
Login Request
Redirect
Set Cookie
Token Stored
Profile Request
Session Verified
Logout
Unknown
```

### Timeline 원칙

- 중요한 인증 이벤트만 강조
- 모든 네트워크 요청을 동일하게 강조하지 않음
- 흐름이 왼쪽에서 오른쪽 또는 위에서 아래로 자연스럽게 이어져야 함
- 사용자가 “로그인이 어디서 완료됐는지” 쉽게 이해해야 함

---

## 11. Request Detail Panel

### Tab 구성

```text
Overview
Headers
Payload
Response
Cookies
Storage
Security Notes
```

### 민감 정보 표시 방식

기본:

```text
Authorization: Bearer sk-••••••••••••••••
Cookie: session=••••••••••••••••
password: ••••••••
```

원문 보기:

- 기본 비활성
- 클릭 시 경고
- 현재 세션에서만 임시 표시
- export에는 포함하지 않음

---

## 12. Diagram Style

### Mermaid Diagram

기본 다이어그램은 Mermaid sequenceDiagram으로 생성합니다.

스타일 원칙:

- 노드는 4개 이하를 우선
- 너무 많은 request를 모두 넣지 않음
- 인증 흐름에 중요한 이벤트만 포함
- 복잡한 흐름은 group 처리

기본 노드:

```text
Browser
App
Auth Server
API
```

### Diagram Label

좋은 예:

```text
POST /login
Set-Cookie: session
GET /me
Redirect to SSO
Exchange code for token
```

나쁜 예:

```text
Very long full URL with query string and token
```

---

## 13. Empty State

### Home Empty State

문구:

```text
Start by entering a web application URL.
AuthLens will help you visualize and document its authentication flow.
```

### No Auth Candidate

문구:

```text
No clear authentication request was detected.
You can manually select a request from the timeline.
```

### No Cookie Changes

문구:

```text
No cookie changes were detected during this capture.
The application may use token-based authentication.
```

---

## 14. UX Writing

### Tone

- 차분하게
- 기술적으로 정확하게
- 과장하지 않게
- 공격적인 표현 피하기
- 사용자의 통제권을 강조

### 좋은 표현

```text
Inspect authentication flow
Analyze session changes
Document login behavior
View masked token
Reveal sensitive value
Authorized use only
```

### 피해야 할 표현

```text
Hack login
Steal token
Bypass auth
Exploit session
Crack login
Dump cookies
```

---

## 15. Safety UX

### 첫 실행 안내

```text
AuthLens is designed for authorized systems only.
Use it for internal debugging, QA, documentation, and authentication flow analysis.
Unauthorized use against third-party services may violate laws or terms of service.
```

### 민감 정보 경고

```text
This value may contain sensitive authentication data.
Reveal it only if you are authorized to inspect this system.
```

### Export 경고

```text
The exported report will mask sensitive values by default.
Review the report before sharing it.
```

---

## 16. Icon Guide

### 기본 아이콘 컨셉

```text
Lens + Flow Nodes
```

### 아이콘 구성

- 둥근 사각형 배경
- 중앙 렌즈
- 렌즈 내부의 노드 3개
- 노드 연결선
- 중앙 노드에 check 표시

### 아이콘 색상

```text
Background: #0F172A
Lens: #06B6D4
Highlight: #38BDF8
Node: #E0F2FE
```

### 피해야 할 아이콘

- 깨진 자물쇠
- 해커 후드
- 해골
- 빨간 경고 아이콘 중심
- 스파이 눈 이미지
- 키를 훔치는 이미지

---

## 17. Motion

### 사용 가능한 애니메이션

- 요청이 들어올 때 timeline item fade-in
- 분석 중 node pulse
- diagram 생성 시 subtle draw animation
- export 완료 시 small success animation

### 피해야 할 애니메이션

- 과도한 glitch
- 빨간색 flashing
- Matrix rain
- 공격 시뮬레이션 느낌
- 너무 빠른 움직임

---

## 18. Accessibility

- [ ] 텍스트 대비 WCAG AA 이상
- [ ] 색상만으로 상태를 전달하지 않음
- [ ] 키보드 탐색 지원
- [ ] focus ring 명확히 표시
- [ ] request list에서 screen reader label 제공
- [ ] 민감 정보 reveal 버튼에 명확한 aria-label 제공
- [ ] 모션 줄이기 설정 지원

---

## 19. Page-specific Guide

## Home

목표:

- 제품 목적 전달
- URL 입력
- 안전 사용 안내

주요 요소:

- Product title
- Short description
- URL input
- Start capture button
- Authorized use notice

---

## Capture

목표:

- 사용자가 직접 로그인 수행
- 캡처 상태 표시

주요 요소:

- Browser frame
- Request count
- Auth candidate count
- Stop capture button
- Live network list

---

## Analysis

목표:

- 인증 방식 이해
- 로그인 요청 후보 확인
- 흐름 검토

주요 요소:

- Auth summary cards
- Timeline
- Request detail panel
- Cookie diff
- Storage diff
- Diagram preview

---

## Report

목표:

- 문서화 결과 확인
- Markdown/JSON export

주요 요소:

- Markdown preview
- Mermaid preview
- Export options
- Masking status
- Copy button

---

## Settings

목표:

- 캡처 정책과 마스킹 정책 설정

주요 요소:

- Masking policy
- Body capture limit
- Browser options
- Experimental features
- Data deletion

---

## 20. Design Tokens Example

```css
:root {
  --color-bg: #0F172A;
  --color-bg-deep: #020617;
  --color-surface: #1E293B;
  --color-surface-muted: #334155;

  --color-primary: #06B6D4;
  --color-primary-hover: #0891B2;
  --color-primary-soft: rgba(6, 182, 212, 0.12);

  --color-text-primary: #F8FAFC;
  --color-text-secondary: #CBD5E1;
  --color-text-muted: #94A3B8;

  --color-success: #34D399;
  --color-warning: #FBBF24;
  --color-danger: #FB7185;
  --color-info: #38BDF8;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
  --radius-2xl: 24px;

  --shadow-soft: 0 12px 40px rgba(2, 6, 23, 0.35);
}
```

---

## 21. Tailwind Theme Example

```ts
export const authLensTheme = {
  colors: {
    background: "#0F172A",
    backgroundDeep: "#020617",
    surface: "#1E293B",
    surfaceMuted: "#334155",
    primary: "#06B6D4",
    primaryHover: "#0891B2",
    textPrimary: "#F8FAFC",
    textSecondary: "#CBD5E1",
    textMuted: "#94A3B8",
    success: "#34D399",
    warning: "#FBBF24",
    danger: "#FB7185",
    info: "#38BDF8",
  },
  borderRadius: {
    sm: "6px",
    md: "10px",
    lg: "14px",
    xl: "20px",
    "2xl": "24px",
  },
};
```

---

## 22. Final Direction

AuthLens의 디자인은 다음 한 문장으로 정리됩니다.

```text
A calm developer tool that turns complex authentication behavior into understandable visual documentation.
```

한국어로는 다음 방향입니다.

```text
복잡한 인증 흐름을 차분하고 이해 가능한 문서와 시각 자료로 바꿔주는 개발자 도구
```

# Contributing to AuthLens

기여해 주셔서 감사합니다. AuthLens는 **허가된** 웹 애플리케이션의 인증 흐름을 관찰·분석·문서화하는 개발자 도구입니다.

## 행동 강령

`CODE_OF_CONDUCT.md`를 먼저 읽어 주세요.

## 개발 환경

```sh
npm install
npm test --workspaces --if-present
npm run dev --workspace apps/desktop
```

## 디렉터리 구조

```
apps/desktop/        Tauri + React 데스크탑 앱
packages/core/       공통 타입, 마스킹, 상수
packages/recorder/   Playwright 기반 캡처
packages/analyzer/   인증 흐름 분석 (scoring, diff, auth type)
packages/reporter/   Markdown / Mermaid / JSON 생성
packages/storage/    SQLite 기반 로컬 저장소
examples/            테스트용 데모 서버 (cookie-session, jwt 등)
docs/                아키텍처, 디자인 가이드, 기능 체크리스트
```

## 기여 가이드라인

### 디자인 원칙

- AuthLens는 침투 테스트 도구가 아닙니다. 공격적 기능은 거절될 수 있습니다.
- 민감 정보의 raw 노출/저장을 기본 동작으로 만들지 마세요.
- UI 톤은 차분하고 개발자 친화적이어야 합니다 (`docs/DESIGN_GUIDE.md` 참조).

### 코드 스타일

- TypeScript strict 모드
- Prettier로 자동 포매팅 (`npm run format`)
- ESLint 통과 (`npm run lint`)

### Pull Request

1. Fork 후 feature 브랜치 생성
2. 변경 사항에 단위 테스트 추가 (`packages/*/src/*.test.ts`)
3. `npm test --workspaces --if-present` 모두 통과
4. PR template 작성

### 위험한 기능 추가 시

다음에 해당하는 변경은 `SECURITY.md`와 `docs/ARCHITECTURE.md` §11 (Security Boundary)를 다시 확인하고 PR 본문에 안전 영향도를 명시해 주세요.

- raw token/cookie 노출 또는 저장 경로
- 외부 도메인 자동 호출
- 로그에 민감 정보가 흐를 가능성
- Replay/export 기본값 변경

## 의문이 있다면

`docs/ARCHITECTURE.md`와 `docs/FEATURE_CHECKLIST.md`를 먼저 확인해 주세요. 토론이 필요한 변경은 별도 issue로 먼저 제안해 주세요.

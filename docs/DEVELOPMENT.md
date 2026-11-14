# 개발 시작

PC 웹 `/api/v2` 백엔드의 계약·스티비 이메일·정기 작업은 [BACKEND-V2.md](BACKEND-V2.md)에, Figma 화면 구현·연결·검증 결과는 [FRONTEND.md](FRONTEND.md)에 정리했다. 기존 채용 계획은 `/plans`에 보존했다.

## 환경과 선택 이유

- Node.js 24, npm, TypeScript 7.
- Next.js 16 App Router + React 19. 의존성은 `package-lock.json`에 고정했다.
- Windows 샌드박스에서 Turbopack이 PostgreSQL 패키지 junction을 만들지 못해 `--webpack`으로 실행·빌드한다. 시스템 보안 설정을 바꿀 필요가 없다.
- SQL은 PostgreSQL 문법이다. 로컬 기본값은 WASM 기반 PGlite이며 운영은 `pg` 드라이버로 PostgreSQL에 연결한다.
- 별도 CSS 프레임워크, Redis, 벡터 DB, Docker 설치 없이 기본 흐름이 실행된다.

설치 근거: [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation), [PGlite](https://pglite.dev/docs/), [Vitest](https://vitest.dev/guide/).

## 실행 순서

```powershell
npm ci
npm run setup
npm run dev
```

`setup`은 기존 `.env.local`을 덮어쓰지 않는다. 비어 있는 환경에서는 `.env.example`을 복사하고 마이그레이션과 가상 규칙 시드를 적용한다. 시드는 재실행해도 기존 제도·검수 상태를 초기화하지 않는다.

접속: `http://127.0.0.1:3000`. 다른 포트나 호스트를 사용하면 `.env.local`의 `APP_URL`을 실제 Origin에 맞추고 서버를 재시작한다.

로그인 없이 브라우저별 방문자 연결로 접속한다. [방문자 분리·쿠키 유지·HTTP 검증](VISITOR-ACCESS.md)을 따른다. 보호된 화면에 바로 접근해도 자동 연결 후 원래 화면으로 이동한다.

## 데모 확인 순서

1. 첫 화면의 `로컬 데모 시작`을 누른다. 브라우저마다 분리된 합성 사용자 세션을 만든다.
2. `새 채용 계획`에서 예시 조건을 채운다.
3. 계획을 저장하고 결과 세 영역·공식 참고 링크·추가 확인 조건을 본다.
4. 체크리스트 하나를 완료하고 새로고침해 상태가 유지되는지 확인한다.
5. 계획의 알림을 켜고 로컬 테스트 알림을 생성한다.
6. `알림 보관함`에서 외부로 보내지 않은 메일을 확인한다.
7. 운영자 검수에서 가상 기준 변경을 비교·수정·승인하거나 반려한다.
8. 게시된 규칙에서 중지·이전 버전 복귀를 확인한다.
9. 계획 상세의 시뮬레이터에서 급여를 2,450,000 → 2,500,000원으로 바꿔 가상 조건 비교를 확인한다. 보험 산정 인원은 별도로 바꾼다.
10. 검수 카드에서 ‘변경 분류·우선순위 계산’을 누른다. 기본 상태는 외부 호출 없는 로컬 비교이며 승인 대기를 유지한다.
11. ‘API 사용 현황’에서 각 연결부의 위치와 실제 활성 여부를 확인한다. 상세 설명은 `API-USAGE.md`를 참고한다.

로컬 데모 사용자는 검수 시연을 위해 ADMIN 역할이다. 운영 모드에서는 데모 세션 발급 API가 막힌다. 데모는 실제 고객 데이터와 함께 배포하지 않는다.

## 폴더

```text
src/app/                 화면·Route Handler·스타일
src/components/          입력·결과·액션·운영자 화면
src/domain/              Zod 계약·규칙 엔진·날짜 계산
src/server/              DB·세션·서비스·작업·오류 처리
src/integrations/        Liner·스티비·국세청 연결부
db/migrations/          PostgreSQL 초기 스키마
scripts/                설정·DB·계정·정기 작업·환경 점검·HTTP 스모크
tests/                  규칙·날짜·DB 흐름·외부 어댑터 테스트
docs/                   API·운영 전환·Miro 접근·인수인계
data/                   로컬 DB·계정 발급정보 (Git 제외)
artifacts/              UI 확인 캡처 (Git 제외)
```

## 명령

| 명령                                             | 용도                            |
| ------------------------------------------------ | ------------------------------- |
| `npm run setup`                                  | 로컬 설정·DB·데모 시드 초기화   |
| `npm run dev`                                    | 루프백 주소의 개발 서버         |
| `npm run check`                                  | 타입 검사 + 단위/DB 통합 테스트 |
| `npm run build`                                  | 실제 배포용 빌드                |
| `npm start`                                      | 빌드한 앱을 루프백에서 실행     |
| `npm run doctor`                                 | 키를 노출하지 않고 설정·DB 점검 |
| `npm run smoke`                                  | 실행 중인 서버의 HTTP 흐름 검증 |
| `npm run db:migrate`                             | 스키마 적용                     |
| `npm run db:seed`                                | 로컬 데모 시드만 추가           |
| `npm run user:create -- owner@example.com OWNER` | 실제 계정 초기 발급             |
| `npm run jobs:run -- notifications`              | 기한이 된 알림 작업 처리        |
| `npm run jobs:run -- collect`                    | 등록·허용된 공식 출처 수집      |

PGlite는 **단일 프로세스 사용**을 전제로 한다. 서버를 실행한 상태에서 `doctor`, `db:*`, `setup`, CLI 작업을 실행하지 않는다. 개발 중 작업은 서버의 운영자 화면에서 실행한다. HTTP 스모크는 DB 파일을 직접 열지 않으므로 서버와 함께 실행해도 된다.

## PostgreSQL 개발 옵션

Docker가 준비된 환경에서만 선택한다. 이 작업에서는 Docker가 설치되어 있지 않아 실제 Compose 실행은 하지 않았다.

```powershell
docker compose up -d
```

`.env.local`:

```dotenv
MAWD_DATABASE_URL=postgres://mawd_dev:local-development-only@127.0.0.1:55432/mawd_dev
```

그다음 서버를 끄고 `npm run setup`을 실행한다. 새 외부 DB에 시드가 자동으로 들어가지 않도록 운영에서는 `APP_ENV=production`, `APP_MODE=live`를 명시한다. **호스트에 이미 있는 일반 `DATABASE_URL`은 사용하지 않는다.**

## 규칙 확장

- `contracts.ts`의 허용 사실 필드와 입력 스키마를 먼저 확장한다.
- 고용보험·국민연금 인원과 가입 이력은 각각의 필드를 사용한다. 데모 공통 필드를 복사해 실제 두 보험의 조건으로 사용하지 않는다.
- 실제 제도의 제외 요건·지원기간·기준일·보험별 차이가 충분히 표현되지 않으면 새 타입과 테스트를 추가한 뒤 규칙을 등록한다.
- 제도 초안은 `admin/policies`에서 등록하고, 운영자 검수에서 출처를 확인해 승인한다.
- `MATCH`는 입력 기준 규칙 부합이지 기관의 지급 승인이라는 뜻이 아니다.
- 모델 초안은 JSON 스키마·허용 필드·원문 근거 구간 검사 후 제안만 한다. 자동 게시하지 않는다.

## DB 변경

초기 스키마는 `0001_init.sql`이다. 다음 변경은 `0002_설명.sql` 형식으로 추가하되 파일명은 영문 소문자·숫자·하이픈·밑줄을 사용한다. 러너는 파일 순서대로 트랜잭션 적용하며 SHA-256 체크섬을 보존한다. 적용한 파일을 나중에 수정하면 실행을 거절한다. 기존 데이터를 지우는 변경은 별도 검토 후 새 파일로 작성한다.

## 개발 환경 제약과 복구

- 이 작업 중 샌드박스 내부 HTTP 요청은 루프백 접근이 막혔고, 호스트 권한으로 실행한 로컬 서버·스모크는 정상 동작했다. 일반 PC에서는 정상 터미널 실행으로 충분하다.
- PGlite DB가 이미 열려 있으면 이전 개발 서버가 남아 있는지 확인한다. 다른 앱의 프로세스를 무작정 종료하지 않는다.
- `APP_URL`과 접속 Origin이 다르면 쓰기 요청은 403이다. 보안을 끄지 말고 주소 설정을 맞춘다.
- 실수로 알림 처리가 중단된 CLAIMED 작업은 10분 뒤 UNKNOWN으로 이동한다. 실제 전송 여부 확인 없이 다시 보내지 않는다.
- 인코딩이 다른 문서·PDF·동적 페이지는 현재 단순 HTML 수집기에서 처리하지 않고 운영자가 확인한다.

## Liner·스티비 작업

추가 백엔드 작업은 `npm run jobs:connected -- contacts|contact-reconcile|policy-watch|weekly`로 실행한다(종류 하나씩 지정). 외부 cron은 생성하지 않았다. [API·설정·실행 순서·검증 게이트](CONNECTED-WORKFLOWS.md)를 따른다. EXAONE과 Alt는 제외했으며 기본 키와 외부 연동 플래그는 비어 있거나 꺼져 있다.

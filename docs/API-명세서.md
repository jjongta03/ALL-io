# 가게의 다음 API 명세서

2026-11-15 갱신: 아래는 기존 채용 계획 API이며, PC 웹의 현재 정보 기반 API·스티비 이메일은 [BACKEND-V2.md](BACKEND-V2.md)를 참고한다. 채널톡은 제거했다.

문서 버전 1.0 · 작성일 2026년 11월 14일 · 현재 구현 기준

이 문서는 [기능명세서](기능명세서.md)를 클라이언트와 서버 간 API 계약으로 구체화한다. 현재 구현된 API 30개의 요청·응답·권한·주요 오류·상태 변경을 설명한다. 아직 구현하지 않은 기능은 13절에 따로 기재한다.

**사업장 정보 확장 가능성**: 기능명세서 3번의 사업장 정보는 앞으로 항목이 추가될 수 있다. 현재는 추가할 항목을 확정하거나 구현하지 않고, 아래 `BusinessInput`을 현재 계약으로 사용한다. 현재 요청 검증은 미정의 필드를 거절하므로 새 항목은 서버 스키마·저장·판정 영향과 함께 합의 후 추가한다.

실제 제도 규칙은 별도 검수가 필요하다. 예시 데이터는 합성이며 실제 지원 기준이나 지급액을 뜻하지 않는다. 외부 API는 연결 코드 기준으로 설명하며, 실제 키를 이용한 성공 검증이 완료된 상태로 표현하지 않는다.

## 1 공통 규약

### 주소와 응답

| 항목           | 현재 계약                                               |
| -------------- | ------------------------------------------------------- |
| 로컬 기본 주소 | `http://127.0.0.1:3000`                                 |
| API 접두사     | `/api` — 현재 `/api/v1` 경로는 없음                     |
| 전송 형식      | JSON, 날짜·식별자는 문자열                              |
| 성공 상태      | 문서의 모든 정상 응답은 **HTTP 200**. 생성도 201이 아님 |
| 성공 본문      | API별 객체. 공통 `data` 또는 `success` 래퍼 없음        |
| 오류 본문      | `{error, code, fields?}`                                |
| 캐시           | 앱의 JSON 응답에 `Cache-Control: no-store`              |
| 본문 헤더      | 본문을 읽는 API는 `Content-Type: application/json` 필수 |
| 본문 한도      | 본문을 읽을 때 UTF-8 기준 65,536바이트 초과 시 413      |
| UUID           | 문서의 `:id`는 해당 자원의 UUID. 형식 오류는 422        |
| 날짜           | `YYYY-MM-DD`, 실제 존재하는 날짜                        |
| 시각           | JSON으로 직렬화한 날짜·시각 문자열. 예시는 UTC ISO 8601 |
| 미확인 값      | 허용된 필드에서 `null`. 빈 문자열·0·false와 다름        |
| 요청 추가 필드 | 스키마에 없는 필드는 422. 자동 저장·무시하지 않음       |

요청 본문은 camelCase를 사용한다. DB 조회 결과는 snake_case가 섞여 있으며, 이 문서는 현재 이름을 그대로 명시한다. 예를 들어 계획은 `input_revision`, 판정 카드의 규칙 버전 ID는 `policyVersionId`다. 응답을 임의로 camelCase로 바꿔 해석하지 않는다.

현재 목록 API에는 페이지·커서·검색·상태 필터 파라미터가 없다. 목록마다 제한이 다르므로 9절을 참고한다. 조회 응답에 없는 별도 생성·수정 API를 추정해 호출하지 않는다.

### 인증과 요청 헤더

로그인 또는 데모 시작 성공 시 서버가 `mawd_session` 쿠키를 발급한다. Bearer 토큰 인증은 제공하지 않는다. 쿠키는 HttpOnly, SameSite=Lax, Path=/이며 만료 기간은 7일이다. 운영 설정에서는 Secure를 사용한다. 별도 세션 갱신 API는 없다.

상태를 변경하는 모든 요청은 인증 여부와 관계없이 `Origin`이 서버 `APP_URL`의 Origin과 정확히 같아야 한다. 로그인·데모 시작·로그아웃·시뮬레이션도 포함한다. GET은 Origin 필수 검사의 대상이 아니다. 로컬의 `localhost`와 `127.0.0.1`을 혼용하지 않는다.

```http
POST /api/plans
Origin: http://127.0.0.1:3000
Content-Type: application/json
Cookie: mawd_session=<서버가 발급한 세션>
```

같은 Origin의 웹 화면에서는 브라우저가 쿠키를 전송한다. 다른 환경의 HTTP 클라이언트는 로그인 응답의 `Set-Cookie`를 보관하고 이후 요청에 전달해야 한다. 외부 CORS 클라이언트·서버 웹훅 인증을 이 계약으로 지원하는 것은 아니다.

### 권한

| 표기   | 의미                                                                     |
| ------ | ------------------------------------------------------------------------ |
| 공개   | 세션 불필요. 변경 요청의 Origin 검사는 적용                              |
| 로그인 | OWNER 또는 ADMIN 세션 필요                                               |
| 소유자 | 요청한 계획·할 일·판정이 로그인 사용자 소유여야 함                       |
| ADMIN  | 운영자 역할 필요. ADMIN도 다른 사용자 계획의 소유권 검사를 우회하지 않음 |

미로그인은 401, 로그인 사용자의 ADMIN 권한 부족은 403이다. 다른 사용자 자원은 존재하지 않는 자원과 동일하게 404를 반환한다. Origin 검사가 먼저 수행되므로 Origin이 잘못된 요청은 인증 오류보다 403이 먼저 나올 수 있다.

### 요청 제한

현재 제한은 서버 프로세스 메모리에서 관리하는 15분 단위 제한이다. 분산 서버 공통 한도나 영구 기록이 아니며, 정확한 재시도 시각·`Retry-After`는 반환하지 않는다.

| 대상                | 한도와 기준                |
| ------------------- | -------------------------- |
| 데모 세션 생성      | 프로세스 공통 50회         |
| 로그인              | 소문자로 바꾼 이메일당 8회 |
| 질문·FAQ·오류 접수  | 사용자당 50회              |
| 국세청 조회         | 사용자당 20회              |
| 운영자 근거 검색    | 사용자당 20회              |
| 운영자 AI 초안 제안 | 사용자당 10회              |
| 운영자 검수 분류    | 사용자당 20회              |

그 외 API에는 현재 별도 호출 횟수 제한이 없다. 한도 초과는 429, 현재 `code`는 `REQUEST_ERROR`다.

## 2 API 목록

경로의 `:id`는 각 자원의 식별자다. 기능 ID는 기능명세서와 대응한다.

| API ID | 메서드와 경로                           | 권한             | 기능 ID       |
| ------ | --------------------------------------- | ---------------- | ------------- |
| API01  | GET `/api/health`                       | 공개             | 운영 점검     |
| API02  | POST `/api/demo`                        | 공개·데모 모드   | A02           |
| API03  | POST `/api/session`                     | 공개             | A01           |
| API04  | DELETE `/api/session`                   | 로그인           | A01           |
| API05  | GET `/api/me`                           | 로그인           | A01, H02      |
| API06  | GET `/api/plans`                        | 로그인·본인 목록 | P01           |
| API07  | POST `/api/plans`                       | 로그인           | B01, P01, R01 |
| API08  | GET `/api/plans/:id`                    | 소유자           | P01, R02, T01 |
| API09  | PATCH `/api/plans/:id`                  | 소유자           | P02           |
| API10  | POST `/api/plans/:id/simulate`          | 소유자           | M01, M02      |
| API11  | PUT `/api/plans/:id/alerts`             | 소유자           | N01           |
| API12  | POST `/api/plans/:id/cancel`            | 소유자           | P03           |
| API13  | POST `/api/plans/:id/test-mail`         | 소유자·로컬 데모 | N02           |
| API14  | PATCH `/api/tasks/:id`                  | 소유자           | T02           |
| API15  | POST `/api/feedback`                    | 판정 소유자      | H01           |
| API16  | GET `/api/outbox`                       | 로그인·본인 목록 | N03           |
| API17  | POST `/api/support`                     | 계획 소유자      | H01           |
| API18  | POST `/api/integrations/nts`            | 로그인           | B02           |
| API19  | GET `/api/admin/reviews`                | ADMIN            | V01           |
| API20  | POST `/api/admin/reviews/:id/assess`    | ADMIN            | V02           |
| API21  | POST `/api/admin/reviews/:id`           | ADMIN            | V03           |
| API22  | POST `/api/admin/policies`              | ADMIN            | C02, V01      |
| API23  | POST `/api/admin/policies/:id/suspend`  | ADMIN            | V04           |
| API24  | POST `/api/admin/policies/:id/rollback` | ADMIN            | V04           |
| API25  | POST `/api/admin/search`                | ADMIN            | C01           |
| API26  | POST `/api/admin/sources`               | ADMIN            | C01           |
| API27  | POST `/api/admin/draft`                 | ADMIN            | C02           |
| API28  | POST `/api/admin/jobs`                  | ADMIN            | C01, N02, O01 |
| API29  | GET `/api/admin/operations`             | ADMIN            | O01, V04, H01 |
| API30  | GET `/api/admin/integrations`           | ADMIN            | O02           |

## 3 공통 데이터 모델

### 3.1 BusinessInput

현재 확정된 사업장 입력이다. **향후 확장 가능성이 있지만 추가 항목은 미정**이다. `businessNumber`, `revenueBand`, `metadata` 등의 필드를 현재 지원하는 것으로 해석하지 않는다.

| 필드             | 타입    | 요청 필수 | 제한과 의미                               |
| ---------------- | ------- | --------- | ----------------------------------------- |
| nickname         | string  | 필수      | 앞뒤 공백 제거 후 1~80자                  |
| industry         | enum    | 필수      | `CAFE`, `RESTAURANT`, `OTHER`             |
| region           | string  | 필수      | 앞뒤 공백 제거 후 1~80자                  |
| businessType     | enum    | 필수      | `SOLE`, `CORPORATE`                       |
| currentHeadcount | integer | 필수      | 0~1,000, 현재 인원                        |
| existingBenefit  | enum    | 선택      | `YES`, `NO`, `UNKNOWN`. 생략 시 `UNKNOWN` |

현재 사업장 수정·독립 사업장 생성 API는 없다. API07은 사업장 행과 계획을 함께 만들고, 계획에 당시 사업장 스냅샷을 저장한다. 사업자등록번호는 API18의 별도 조회 입력이다.

### 3.2 HireInput

직원 한 명의 채용 가정이다. 아래 ‘필수·null 허용’은 키를 반드시 보내되 모르면 `null`을 보낸다는 뜻이다.

| 필드                            | 타입              | 요청 필수      | 제한과 의미                                                     |
| ------------------------------- | ----------------- | -------------- | --------------------------------------------------------------- |
| startDate                       | date              | 필수           | 실제 존재하는 `YYYY-MM-DD`. 현재 과거 날짜 자체를 금지하지 않음 |
| employmentType                  | enum              | 필수           | `REGULAR`, `DAILY`, `OTHER`                                     |
| monthlyAveragePay               | integer 또는 null | 필수·null 허용 | 원 단위, 0~1,000,000,000                                        |
| insuranceHeadcount              | integer 또는 null | 필수·null 허용 | 0~1,000. 데모 공통 보험 산정 인원                               |
| historyRequirementMet           | boolean 또는 null | 필수·null 허용 | 데모 공통 가입 이력 요건                                        |
| exclusionClear                  | boolean 또는 null | 필수·null 허용 | 제외 사유 없음 확인                                             |
| durationRemaining               | boolean 또는 null | 필수·null 허용 | 지원기간 잔여 확인                                              |
| hoursRequirementMet             | boolean 또는 null | 필수·null 허용 | 근로시간 등 요건 확인                                           |
| coverageConfirmed               | boolean 또는 null | 필수·null 허용 | 가입 대상 확인                                                  |
| laborCountConfirmed             | boolean 또는 null | 필수·null 허용 | 상시근로자 산정 자료 확인                                       |
| employmentHeadcount             | integer 또는 null | 선택           | 0~1,000, 고용보험 산정 인원                                     |
| pensionHeadcount                | integer 또는 null | 선택           | 0~1,000, 국민연금 산정 인원                                     |
| employmentHistoryRequirementMet | boolean 또는 null | 선택           | 고용보험 가입 이력 요건                                         |
| pensionHistoryRequirementMet    | boolean 또는 null | 선택           | 국민연금 가입 이력 요건                                         |

`true`는 충족 확인, `false`는 미충족 확인, `null`은 미확인이다. 모름을 임의로 false·0으로 바꾸지 않는다. 실제 보험별 규칙은 공통 데모 필드 대신 각각의 필드를 사용한다.

### 3.3 Plan과 PlanDetail

`Plan` 응답은 현재 DB 필드명으로 반환한다.

| 필드                      | 타입               | 의미                                                        |
| ------------------------- | ------------------ | ----------------------------------------------------------- |
| id, business_id, owner_id | UUID               | 계획·사업장·소유자 식별자                                   |
| before_snapshot           | BusinessInput      | 계획 생성 당시 사업장                                       |
| proposed_change           | HireInput          | 현재 저장된 채용 가정                                       |
| input_revision            | integer            | 입력 버전, 생성 시 1                                        |
| status                    | enum               | `DRAFT`, `ACTIVE`, `CANCELLED`. 현재 생성 API는 ACTIVE 생성 |
| email_alerts              | boolean            | 계획별 알림 동의                                            |
| consent_at                | datetime 또는 null | 동의 시각. 동의 해제 시 과거 시각을 지우지는 않음           |
| created_at, updated_at    | datetime           | 생성·수정 시각                                              |

API06의 목록 항목에는 `result: Evaluation | null`이 추가된다. API08 상세는 다음 구조다.

```text
PlanDetail = {
  plan: Plan,
  evaluation: EvaluationRecord | null,
  tasks: Task[]
}
```

`EvaluationRecord`는 `id`, `plan_id`, `input_revision`, `input_snapshot: {business, hire}`, `input_hash`, `ruleset_hash`, `meaningful_hash`, `result: Evaluation`, `created_at`을 가진다. 스냅샷과 해시가 포함되므로 클라이언트가 받은 값을 승인 규칙 자체로 취급하지 않는다.

### 3.4 Evaluation과 RuleResult

```text
Evaluation = {
  gains: RuleResult[],
  changes: RuleResult[],
  taskRules: RuleResult[],
  all: RuleResult[],
  missingFields: FactName[],
  basisDate: date,
  isDemo: boolean,
  coverage: string
}
```

`gains`는 BENEFIT, `changes`는 CHANGE, `taskRules`는 TASK 종류의 결과다. `all`은 전체 목록이다.

| RuleResult 필드           | 타입           | 의미                          |
| ------------------------- | -------------- | ----------------------------- |
| policyId, policyVersionId | UUID           | 제도와 적용 규칙 버전         |
| title                     | string         | 제목                          |
| kind                      | enum           | `BENEFIT`, `CHANGE`, `TASK`   |
| status, beforeStatus      | ResultStatus   | 채용 후·현재 가정의 판정      |
| missingFields             | FactName[]     | 필요한 미확인 입력            |
| explanation               | string         | 판정 이유 또는 확인 안내      |
| sources                   | RuleSource[]   | 근거 제목·주소·문구·검수 표시 |
| version                   | integer        | 규칙 버전 번호                |
| isDemo                    | boolean        | 가상 규칙 여부                |
| tasks                     | TaskTemplate[] | 생성에 사용할 준비 항목       |

| ResultStatus    | 의미                                           |
| --------------- | ---------------------------------------------- |
| MATCH           | 입력 기준 조건 부합                            |
| NO_MATCH        | 입력 기준 조건 불충족                          |
| NEEDS_INFO      | 추가 확인 필요                                 |
| REVIEW_REQUIRED | 미승인·근거·기간 등의 이유로 판정 전 검수 필요 |
| OUT_OF_SCOPE    | 상세 판정 범위 밖                              |

현재 상세 판정 범위는 개인사업자 카페·음식점의 상용근로자 한 명 채용이다. MATCH는 기관 승인·지급 보장이 아니다. 실제 수혜 사실이 부족하면 beforeStatus와 status만으로 수혜 상실을 단정하지 않는다.

### 3.5 Task

| 필드                           | 타입           | 의미                                      |
| ------------------------------ | -------------- | ----------------------------------------- |
| id, plan_id, policy_version_id | UUID           | 할 일·계획·규칙 버전                      |
| stable_key                     | string         | 같은 준비 항목을 식별하는 내부 키         |
| title                          | string         | 제목                                      |
| guide                          | object         | `{description, destination, url}`         |
| status                         | enum           | `TODO`, `DONE`, `NEEDS_REVIEW`, `RETIRED` |
| deadline_kind                  | enum           | `PREPARATION`, `NEEDS_CONFIRMATION`       |
| deadline_date                  | date 또는 null | 준비 목표일. 법정 기한 확정을 뜻하지 않음 |
| deadline_version               | integer        | 기한·안내 버전                            |
| created_at, updated_at         | datetime       | 생성·수정 시각                            |

API08에서는 RETIRED 항목을 제외한다. 완료 항목의 안내가 바뀌면 NEEDS_REVIEW가 될 수 있다. 기한만 바뀌면 완료 상태는 보존하면서 예약 버전을 갱신한다.

### 3.6 규칙 초안 모델

`PolicyDraftInput`은 다음 필드를 가진다.

| 필드          | 타입           | 필수           | 제한                        |
| ------------- | -------------- | -------------- | --------------------------- |
| title         | string         | 필수           | 1~150자                     |
| kind          | enum           | 필수           | `BENEFIT`, `CHANGE`, `TASK` |
| effectiveFrom | date           | 필수           | 적용 시작일                 |
| effectiveTo   | date 또는 null | 필수·null 허용 | 종료일이 있으면 시작일 이상 |
| definition    | Definition     | 필수           | 아래 규칙 정의              |

```text
Definition = {
  conditions: Condition,
  explanation: string,
  tasks: TaskTemplate[],
  sources: RuleSource[]
}
```

- `explanation`은 1~3,000자, `tasks`는 0~15개, `sources`는 1~10개다.
- `RuleSource`는 `{title, url, verified, section}`이다. title 1~200자, url은 URL, verified는 boolean, section은 12~500자다. 근거 URL은 별도 검증에서 HTTPS를 요구한다.
- `TaskTemplate`은 `{key, title, description, destination, url, deadlineKind, offsetDays}`다. key 1~80자, title 1~150자, description 최대 2,000자, destination 최대 200자, url은 URL이다. 이 필드들은 모두 필요하다.
- `deadlineKind`는 `PREPARATION` 또는 `NEEDS_CONFIRMATION`, `offsetDays`는 -60~365 정수 또는 null이다. PREPARATION이면 offsetDays가 반드시 숫자여야 한다.
- 각 객체는 정의되지 않은 필드를 거절한다. `isDemo`, 승인자, 상태·버전은 신규 초안 요청에서 지정할 수 없다.

조건은 아래 세 가지 중 하나다. 임의 코드·SQL은 허용하지 않는다.

```json
{
  "all": [
    { "field": "hasHire", "op": "eq", "value": true },
    { "field": "employmentHeadcount", "op": "lt", "value": 10 }
  ]
}
```

이 숫자는 조건 문법을 설명하는 예시다. 실제 제도의 인원 기준이 아니다. `all`·`any`는 각각 조건 1~20개를 담으며, 규칙 전체는 깊이 8·조건 노드 150개 이내로 제한한다. 원자 조건은 `{field, op, value}`다.

`op`는 `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `in` 중 하나다. value는 문자열·유한 숫자·boolean·문자열/숫자 배열이며 null은 허용하지 않는다. 숫자 비교에는 숫자, `in`에는 최대 30개 원소의 배열이 필요하다.

`FactName`은 다음 목록으로 제한한다.

```text
hasHire, currentHeadcount, plannedHeadcount, insuranceHeadcount,
monthlyAveragePay, historyRequirementMet, exclusionClear,
durationRemaining, hoursRequirementMet, coverageConfirmed,
laborCountConfirmed, employmentHeadcount, pensionHeadcount,
employmentHistoryRequirementMet, pensionHistoryRequirementMet
```

### 3.7 ReviewAssessment

| 필드                  | 타입             | 의미                                                      |
| --------------------- | ---------------- | --------------------------------------------------------- |
| method                | enum             | `JEV`, `LOCAL_RULES`                                      |
| kind                  | enum             | `WORDING`, `CRITERIA`, `NEW_POLICY`, `STOPPED`, `UNKNOWN` |
| confidence            | number           | 0~1, 모델 신뢰도. 로컬 대체는 0                           |
| sourceAgreement       | number           | 0~1, 출처 일치 추정. 로컬 대체는 0                        |
| urgency               | number           | 0~2, 긴급도                                               |
| abstain               | boolean          | 판단 보류 여부                                            |
| priority              | integer          | 1~3, 1이 가장 높은 우선순위                               |
| lane                  | enum             | `URGENT`, `HUMAN_REVIEW`, `LOW_RISK`                      |
| reason                | string           | 분류 이유                                                 |
| model                 | string 또는 null | 실제 모델 응답을 사용한 경우 모델 ID                      |
| errorCode             | string 또는 null | 외부 분류 실패 코드                                       |
| evidenceAvailable     | boolean          | 근거 문구를 대조할 수집 원문 존재 여부                    |
| requiresHumanApproval | true             | 항상 사람 승인 필요                                       |

숫자는 법적 정확도·실제 지급 가능성을 뜻하지 않는다. LOW_RISK도 자동 게시가 아니다.

## 4 상태 확인과 인증

### API01 GET /api/health

공개 API. 요청 본문 없음. DB 연결을 확인하고 앱 모드를 반환한다.

```json
{ "ok": true, "app": "mawd-business-change", "mode": "demo" }
```

mode는 `demo` 또는 `live`다. DB 연결 실패 등의 예기치 않은 오류는 500이다.

### API02 POST /api/demo

공개, 데모 모드 전용. 요청 본문 없음. 새 합성 ADMIN 사용자와 세션을 만든다. 성공 응답은 `{"ok":true}`이며 Set-Cookie로 세션을 발급한다. 운영·데모 비활성 상태는 404, 호출 한도 초과는 429다. 반복 호출은 같은 계정 재사용이 아니라 별도 합성 사용자 생성이다.

### API03 POST /api/session

공개 API. 실제 발급 계정으로 로그인한다. 공개 회원가입 API는 없다.

```json
{ "email": "owner@example.invalid", "password": "example-password" }
```

email은 유효 이메일 형식·최대 254자, password는 1~256자다. 이메일은 조회 시 소문자로 바꾸지만 공백을 자동 제거하지 않는다. 성공 응답은 `{"ok":true}`와 Set-Cookie다. 계정 없음·비밀번호 불일치 모두 401 `REQUEST_ERROR`, 형식 오류 422, 호출 제한 429다.

### API04 DELETE /api/session

로그인 필요. 요청 본문 없음. 현재 세션을 DB에서 폐기하고 쿠키를 삭제한다. 성공 응답은 `{"ok":true}`다. 이미 만료·로그아웃된 세션이면 401이므로 HTTP 성공 기준으로 멱등 처리되는 API는 아니다.

### API05 GET /api/me

로그인 필요. 요청 본문 없음.

```json
{
  "user": {
    "id": "11111111-1111-4111-8111-111111111111",
    "email": "owner@example.invalid",
    "role": "OWNER",
    "is_demo": false
  }
}
```

role은 OWNER 또는 ADMIN이다. 채널톡 연결 구성은 반환하지 않는다.

## 5 계획과 시뮬레이션

### API06 GET /api/plans

로그인 필요. 본인 계획을 생성 시각 내림차순으로 반환한다. 취소 계획도 포함하며 현재 건수 제한·페이지 처리는 없다.

```json
{ "plans": [] }
```

항목이 있으면 각각 `Plan + {result: Evaluation | null}`이다. 목록 조회는 재판정을 수행하지 않는다.

### API07 POST /api/plans

로그인 필요. 본문은 `{business: BusinessInput, hire: HireInput}`다.

```json
{
  "business": {
    "nickname": "다음 카페 예시",
    "industry": "CAFE",
    "region": "경기 안산시",
    "businessType": "SOLE",
    "currentHeadcount": 4,
    "existingBenefit": "UNKNOWN"
  },
  "hire": {
    "startDate": "2027-03-20",
    "employmentType": "REGULAR",
    "monthlyAveragePay": 2450000,
    "insuranceHeadcount": null,
    "historyRequirementMet": null,
    "exclusionClear": null,
    "durationRemaining": null,
    "hoursRequirementMet": null,
    "coverageConfirmed": null,
    "laborCountConfirmed": null,
    "employmentHeadcount": null,
    "pensionHeadcount": null,
    "employmentHistoryRequirementMet": null,
    "pensionHistoryRequirementMet": null
  }
}
```

성공 응답은 HTTP 200이다.

```json
{ "id": "22222222-2222-4222-8222-222222222222" }
```

하나의 트랜잭션에서 사업장 행·ACTIVE 계획·입력 버전 1·판정·할 일을 만든다. 알림 기본값은 false다. 현재 인원은 변경하지 않는다. 실패 시 일부 저장을 완료 결과로 반환하지 않는다. 입력 오류는 422다. 동일 요청 재전송은 새 계획을 만들 수 있으며 Idempotency-Key를 지원하지 않는다.

### API08 GET /api/plans/:id

소유자만 허용한다. 본문 없음. 응답은 3.3절 `PlanDetail`이며 최신 판정과 RETIRED를 제외한 할 일을 반환한다. 할 일은 기한 오름차순·기한 없는 항목 뒤·제목 순으로 정렬한다. 판정 기록이 없으면 evaluation은 null이다. 취소 계획도 조회 가능하다. 다른 소유자·자원 없음은 404다.

### API09 PATCH /api/plans/:id

소유자만 허용한다. **부분 필드 PATCH가 아니라 HireInput 전체**를 본문으로 받는다. API07 예시의 hire 객체를 그대로 사용할 수 있다. `{hire: ...}`로 감싸지 않는다. 사업장 필드와 입력 버전을 요청에 넣지 않는다.

성공 응답은 `{"ok":true}`다. 입력 버전을 올리고 채용 가정을 저장·재판정하며 할 일과 관련 예약을 조정한다. 같은 입력·규칙 조합이면 중복 판정은 생략할 수 있으나 입력 버전 증가까지 생략하는 계약은 아니다. 취소 계획은 409, 소유권·자원 없음은 404, 입력 누락·미정의 필드는 422다. 변경 후 API08을 다시 조회한다.

### API10 POST /api/plans/:id/simulate

소유자만 허용한다. 저장 상태를 바꾸지 않는 가정 비교다.

```json
{
  "currentHeadcount": 5,
  "monthlyAveragePay": 2500000,
  "insuranceHeadcount": null,
  "employmentHeadcount": null,
  "pensionHeadcount": null
}
```

currentHeadcount·monthlyAveragePay·insuranceHeadcount 키는 필수이며, 뒤 두 보험별 인원은 선택이다. 숫자 범위와 null 처리는 3절과 같다. 선택 필드 생략 시 저장된 값을 유지하고, null을 명시하면 해당 보험 인원을 미확인으로 가정한다.

```text
200 {
  result: Evaluation,
  comparison: [{policyId, title, kind, before, after, missingFields}]
}
```

before와 after는 ResultStatus다. before는 저장된 입력을 **현재 활성 규칙**으로 평가한 결과, after는 가정 입력을 같은 규칙으로 평가한 결과다. 과거 저장 판정과의 규칙 버전 비교를 뜻하지 않는다. 외부 AI를 호출하지 않고 입력·판정 이력·할 일·예약을 수정하지 않는다. 현재 취소 계획의 조회형 시뮬레이션도 허용한다. 소유권 오류 404, 입력 오류 422다.

### API11 PUT /api/plans/:id/alerts

소유자만 허용한다.

```json
{ "enabled": true }
```

성공 응답은 `{"ok":true}`다. true는 동의와 동의 시각을 저장하고 미래 D-7·D-3 예약을 만든다. false는 미발송 예약을 취소한다. 이미 지난 시각은 소급 예약하지 않는다. 같은 할 일·기한 버전·종류는 중복 예약하지 않는다. 현재 true 재요청은 동의 시각을 갱신한다. 취소 계획에서 true는 409, false는 허용한다. 소유권 오류는 404다. 예약과 실제 메일 수신은 별개다.

### API12 POST /api/plans/:id/cancel

소유자만 허용한다. 본문 없음. 성공 응답은 `{"ok":true}`다. 계획을 CANCELLED로 바꾸고 email_alerts=false, 미발송 PENDING 예약을 CANCELLED로 바꾼다. 기록을 삭제하지 않는다. 같은 취소 요청을 반복해도 현재 상태는 취소로 유지된다. 소유권·자원 없음은 404다. 복원 API는 없다.

### API13 POST /api/plans/:id/test-mail

소유자, 데모 모드, `EMAIL_TRANSPORT=local`, 진행 중·알림 동의 계획만 허용한다. 본문 없음. 매 요청마다 테스트 예약을 새로 만들고 만기가 된 알림 작업을 처리한다.

```json
{ "processed": 1, "local": 1, "accepted": 0, "failed": 0, "unknown": 0, "cancelled": 0 }
```

값은 처리 결과에 따라 달라진다. 집계는 이번 처리 묶음 전체이며 현재 계획의 새 테스트 1건만으로 제한되지 않는다. 로컬 전용 조건 위반은 403, 동의 없음·취소 계획은 409, 소유권 오류는 404다. 반복 호출은 테스트 메일 중복 생성으로 이어진다.

## 6 할 일과 알림 보관함

### API14 PATCH /api/tasks/:id

소유자만 허용한다.

```json
{ "done": true }
```

true는 DONE, false는 TODO로 바꾸고 관련 알림 예약을 조정한다. 성공 응답은 `{"ok":true}`다. 본인 ACTIVE 계획의 RETIRED가 아닌 항목만 수정한다. 다른 소유자·취소 계획·폐기 항목·자원 없음은 현재 404다. 입력 형식 오류는 422다.

### API15 POST /api/feedback

판정 소유자만 허용한다.

```json
{
  "evaluationId": "33333333-3333-4333-8333-333333333333",
  "message": "결과에 필요한 서류 설명을 더 확인하고 싶습니다."
}
```

message는 공백 제거 후 5~2,000자다. 성공 응답은 `{"ok":true}`이며 OPEN 신고를 만든다. 판정 자원·소유권 오류는 404다. 신고 ID를 응답하지 않고, 반복 요청 중복 방지 키도 없다.

### API16 GET /api/outbox

로그인 필요. 본인 계획과 연결된 로컬 알림을 생성 시각 내림차순, 최대 50건 반환한다.

```json
{
  "mail": [
    {
      "id": "44444444-4444-4444-8444-444444444444",
      "subject": "할 일 알림 예시",
      "body": "합성 데이터로 생성한 로컬 알림입니다.",
      "created_at": "2026-11-14T05:00:00.000Z"
    }
  ]
}
```

실제 스티비 발송 전체 이력 조회 API가 아니다. 수신자 이메일·프로바이더 전송 작업 전체는 반환하지 않는다.

## 7 질문과 사업자 상태조회

### API17 POST /api/support

계획 소유자만 허용한다. 현재 취소 계획에도 저장 결과 확인과 질문 접수가 가능하다.

```json
{
  "planId": "22222222-2222-4222-8222-222222222222",
  "command": "/질문",
  "message": "기존 근로자의 가입 이력은 어디에서 확인하나요?"
}
```

command는 `/혜택조회`, `/서류안내`, `/질문`, `/오류신고` 중 하나다. message는 생략 시 빈 문자열, 공백 제거 후 최대 2,000자다.

| command   | 처리                                | 응답 의미                      |
| --------- | ----------------------------------- | ------------------------------ |
| /혜택조회 | 본인 저장 판정의 혜택 요약          | escalated=false                |
| /서류안내 | 본인 준비 목록·기관·목표일 요약     | escalated=false                |
| /질문     | 미답변 질문을 규칙 보완 후보로 접수 | 유효한 접수이면 escalated=true |
| /오류신고 | 운영자 확인용 신고 접수             | 유효한 접수이면 escalated=true |

```json
{
  "answer": "운영자 검수함에 접수했습니다. 확인 전에는 새로운 조건을 추측해 안내하지 않습니다.",
  "escalated": true
}
```

질문·신고가 5자 미만이면 **422가 아니라 HTTP 200**으로 `{"answer":"확인할 내용을 5자 이상 적어주세요.","escalated":false}`를 반환하고 저장하지 않는다. 혜택·서류 안내에는 5자 제한을 적용하지 않는다. answer는 줄바꿈이 있는 일반 문자열이다. 기록 ID·전문가 답변은 반환하지 않는다. 계획 소유권 오류는 404다. 이 API 자체는 채널톡·ALF·LLM을 호출하지 않는다.

### API18 POST /api/integrations/nts

로그인 필요. 본문은 구분 기호 없는 숫자 10자리다.

```json
{ "number": "0000000000" }
```

위 번호는 형식 설명용 합성 값이며 실제 조회 예시가 아니다.

```json
{
  "status": "확인 불가",
  "taxType": "확인 불가",
  "checkedAt": "2026-11-14T05:00:00.000Z",
  "ownershipVerified": false
}
```

실제 연동이 켜져 있고 `NTS_API_KEY`가 필요하다. 사업자번호는 계획 DB·호출 기록에 저장하지 않는다. 계속·휴폐업 및 과세유형 참고용이며 본인 인증·혜택 자격 확정에 쓰지 않는다. 현재 서버 권한은 로그인 기준이고, 화면은 합성 데모 사용자에게 실행 버튼을 활성화하지 않는다.

숫자 형식 오류는 422, 연동 비활성·키 없음은 503, 제공자의 비정상 HTTP 응답은 502다. 미매핑 네트워크 예외·응답 검증 오류는 11절의 현재 구현 제한을 따른다.

## 8 운영자 검수와 규칙 관리

### API19 GET /api/admin/reviews

ADMIN 전용. 본문 없음. 응답은 `{reviews: Review[]}`이며 현재 건수 제한·페이지 처리가 없다. PENDING을 먼저, priority 오름차순, 생성 시각 내림차순으로 정렬한다.

Review는 `id`, `draft_version_id`, `base_version_id: UUID|null`, `priority`, `reason`, `status`, `reviewer_id: UUID|null`, `reviewed_at: datetime|null`, `created_at`, `title`, `policy_id`, `version`, `definition: Definition`, `previous_definition: Definition|null`, `is_demo`, `assessment: ReviewAssessment|null`을 가진다.

review의 status는 `PENDING`, `APPROVED`, `REJECTED`다. 규칙 버전의 `PENDING_REVIEW`와 이름이 다르다. assessment는 가장 최근 저장된 분류이며 아직 분류하지 않았으면 null이다.

### API20 POST /api/admin/reviews/:id/assess

ADMIN 전용. 요청 본문 없음. 서버에 저장된 PENDING 초안을 분류한다. 화면에서만 수정한 미저장 JSON은 대상이 아니다.

```json
{
  "assessment": {
    "kind": "UNKNOWN",
    "confidence": 0,
    "sourceAgreement": 0,
    "urgency": 1,
    "abstain": true,
    "method": "LOCAL_RULES",
    "priority": 2,
    "lane": "HUMAN_REVIEW",
    "reason": "대조할 수집 원문이 부족합니다. 직접 확인해야 합니다.",
    "model": null,
    "errorCode": null,
    "evidenceAvailable": false,
    "requiresHumanApproval": true
  }
}
```

위 값은 비핵심 변경에 원문이 없는 상황의 응답 형태 예시다. 신규·조건 변경 등 입력에 따라 kind·priority·lane은 달라진다. 실제 모델 사용 조건은 `LIVE_INTEGRATIONS_ENABLED=true`, `JEV_ENABLED=true`, `LINER_API_KEY` 존재다.

분류 결과·입력 해시·분류자를 이력에 남기고 검수 우선순위를 갱신한다. **승인·게시 상태를 변경하지 않는다.** 실제 모델 요청이 실패하면 로컬 분류로 대체해 HTTP 200을 반환하고 errorCode에 실패를 넣는다. 예: `UPSTREAM_CREDIT`, `UPSTREAM_RATE_LIMIT`, `UPSTREAM_ERROR`, `UPSTREAM_UNAVAILABLE`, `UPSTREAM_INVALID_RESPONSE`.

대기 상태가 아니거나 처리 중 초안 상태·내용이 바뀌면 409, 대상 없음은 404다. 반복 요청은 분류 이력을 추가하고, 활성화한 경우 외부 요청 비용이 생길 수 있다.

### API21 POST /api/admin/reviews/:id

ADMIN 전용. 승인 또는 반려한다.

```json
{ "decision": "reject" }
```

승인은 `{"decision":"approve"}`로 저장된 초안을 사용하거나 `{"decision":"approve","definition":Definition}`으로 수정 내용을 함께 제출한다. decision은 소문자 approve·reject만 허용한다. definition을 보내면 부분 수정이 아닌 Definition 전체다.

성공 응답은 `{"ok":true}`다. 승인은 규칙 형식·공식 근거 검수·허용 도메인·기준 버전을 검사한 뒤 활성 버전과 검수 이력을 저장한다. 모든 진행 계획을 재판정하고 의미 있는 변화가 있는 알림 동의 계획에 예약한다. HTTP 성공만으로 실제 메일 전송·수신을 뜻하지 않는다. 반려는 게시하지 않는다.

이미 처리된 항목·기준 버전 충돌은 409다. 규칙 오류·실제 근거 미검수·허용되지 않은 공식 출처·운영에서 가상 규칙 승인 시도는 422다. Jev의 높은 confidence나 LOW_RISK는 이 승인을 대체하지 않는다.

### API22 POST /api/admin/policies

ADMIN 전용. 본문은 3.6절 PolicyDraftInput이다.

```json
{
  "title": "채용 준비 절차 초안 예시",
  "kind": "TASK",
  "effectiveFrom": "2027-01-01",
  "effectiveTo": null,
  "definition": {
    "conditions": { "field": "hasHire", "op": "eq", "value": true },
    "explanation": "입력 형식을 설명하기 위한 초안이며 실제 제도 규칙이 아닙니다.",
    "tasks": [],
    "sources": [
      {
        "title": "원문 검토용 공식 사이트",
        "url": "https://www.moel.go.kr/",
        "verified": false,
        "section": "<공식 원문에서 직접 확인한 근거 구간을 입력>"
      }
    ]
  }
}
```

근거 문구는 실제 원문 확인 후 대체해야 한다. 예시를 법적 근거로 승인하지 않는다.

```json
{ "reviewId": "55555555-5555-4555-8555-555555555555" }
```

새 제도와 version=1·PENDING_REVIEW 규칙·PENDING 검수 항목을 생성한다. 실제 규칙으로 생성되며 요청으로 demo 규칙을 지정할 수 없다. 이전 제도의 새 버전을 생성하는 API는 현재 따로 없다. 등록은 승인·게시가 아니며 반복 요청은 별도 제도를 만든다. 규칙 형식·적용기간 오류는 422다.

### API23 POST /api/admin/policies/:id/suspend

ADMIN 전용. :id는 검수 ID가 아니라 **policy_id**다. 본문 없음. 성공 응답은 `{"ok":true}`다. 활성 규칙을 SUSPENDED로 바꾸고 이력을 남기며 진행 계획을 재판정한다. 실제 자격 부합으로 계속 사용하지 않게 한다. 활성 버전이 없는 제도는 404다. 직접 재개 API는 없고 복귀 가능한 이전 승인 버전이 있으면 API24를 사용할 수 있다.

### API24 POST /api/admin/policies/:id/rollback

ADMIN 전용. :id는 policy_id, 본문 없음. 현재보다 버전이 낮은 APPROVED 중 가장 최신 버전을 활성화한다. 성공 응답은 `{"ok":true}`이며 이력·진행 계획 재판정을 수행한다. 대상 없음 404, 이전 승인 버전 없음 409다. 임의 version ID를 요청해 복귀하는 API가 아니다. 반복 호출하면 더 이전 버전으로 이동할 수 있으므로 자동 재시도하지 않는다.

## 9 운영자 수집과 작업 실행

### API25 POST /api/admin/search

ADMIN 전용. Liner 검색을 호출한다.

```json
{ "query": "직원 채용 지원 조건 공식 안내" }
```

query는 공백 제거 후 3~300자다. 성공 응답은 다음 형태다.

```json
{
  "results": [
    {
      "title": "공식 근거 후보 예시",
      "url": "https://www.moel.go.kr/",
      "description": "검색 결과 설명",
      "date": null,
      "officialCandidate": true
    }
  ]
}
```

description·date는 생략될 수 있고 date는 null도 가능하다. 현재 최대 5개 결과를 요청한다. officialCandidate는 허용 호스트 후보 표시이며 원문 검수 완료를 뜻하지 않는다. 검색만으로 출처 등록·규칙 저장·승인하지 않는다. 실제 연동과 LINER_API_KEY가 필요하다. 비활성·키 없음 503, 제공자 비정상 HTTP 응답은 502 `UPSTREAM_ERROR`다.

### API26 POST /api/admin/sources

ADMIN 전용. 공식 출처 수집 대상을 등록한다.

```json
{ "title": "공식 공지 확인", "url": "https://www.moel.go.kr/" }
```

title은 1~200자, url은 허용된 HTTPS 주소다. 현재 허용 호스트는 `insurancesupport.or.kr`, `law.go.kr`, `moel.go.kr`, `data.go.kr`, `4insure.or.kr`와 각각의 `www.` 호스트다. 사용자정보·별도 포트·HTTP·유사 도메인·목록 밖 호스트는 거절한다.

성공 응답은 `{"ok":true}`다. collection_allowed=true로 등록하지만 즉시 수집하지 않는다. 같은 URL이 이미 있으면 성공 응답을 주고 기존 제목 등은 갱신하지 않는다. 출처 ID는 API29의 sources 목록에서 확인한다. 허용 주소 오류는 422다.

### API27 POST /api/admin/draft

ADMIN 전용. 저장된 원문 스냅샷으로 AI 제안을 생성한다.

```json
{ "snapshotId": "66666666-6666-4666-8666-666666666666" }
```

```text
200 {
  suggestion: PolicyDraftInput,
  sourceSnapshotId: UUID,
  published: false
}
```

제안의 근거 URL·문구를 수집 원문과 대조하고 verified를 false로 되돌린다. 이 응답은 **초안 DB 등록도 게시도 아니다.** 검토 후 suggestion을 API22에 보내 등록한다. 새로운 원문은 API28 수집 작업을 먼저 실행하고 API29의 changes.new_snapshot_id 등 확인 가능한 스냅샷 ID를 사용한다. 원문 스냅샷 전체 목록·본문 조회 API는 현재 없다.

대상 스냅샷 없음은 404다. 초안 생성 비활성·키·모델 설정 부족은 503이다. 원문 문구 불일치·지원하지 않는 규칙 형식은 422다. 실제 연동 외에 `DRAFT_GENERATION_ENABLED=true`, `LINER_DRAFT_MODEL`이 필요하다. 제안 요청 자체는 검수함을 자동 생성하지 않으며 반복 요청은 외부 비용이 생길 수 있다.

### API28 POST /api/admin/jobs

ADMIN 전용. 작업을 한 번 **동기 실행**한다. 일반 사용자 알림 예약 설정이나 비동기 202 작업 시작 API가 아니다.

```json
{ "kind": "notifications" }
```

kind는 `notifications` 또는 `collect`다. 성공 응답의 id는 작업 실행 기록 ID다.

```json
{
  "id": "77777777-7777-4777-8777-777777777777",
  "processed": 1,
  "local": 1,
  "accepted": 0,
  "failed": 0,
  "unknown": 0,
  "cancelled": 0
}
```

notifications는 만기가 된 PENDING 알림 최대 50건을 가져와 처리한다. 이는 운영자 본인 계획에 한정되지 않는 시스템 작업이다. local은 로컬 보관함 처리, accepted는 제공자 접수, failed는 실패, unknown은 접수 여부 불명확, cancelled는 발송 전 중지 건수다. 처리 묶음 요약이므로 모두 수신 완료 건수로 합산하지 않는다.

collect 응답 예시는 다음과 같다.

```json
{
  "id": "88888888-8888-4888-8888-888888888888",
  "skipped": false,
  "checked": 2,
  "changed": 1,
  "failed": 0
}
```

수집이 꺼진 경우는 정상 HTTP 200으로 다음을 반환한다.

```json
{
  "id": "88888888-8888-4888-8888-888888888888",
  "skipped": true,
  "reason": "공식 원문 수집이 꺼져 있습니다.",
  "changed": 0
}
```

collect는 등록·수집 허용 출처를 최대 20개 확인한다. 같은 본문은 중복 변경으로 만들지 않는다. 개별 출처 실패는 failed에 집계하므로 HTTP 200·작업 SUCCEEDED여도 일부 출처 실패가 있을 수 있다. 초기 스냅샷 저장과 기존 스냅샷 대비 변경 감지는 다르다. changed는 기존 원문에서 달라진 변경 건수다. AI 제안·승인은 별도 단계다.

notifications의 실제 전송 설정 부족 등 작업 전체 실패는 오류 응답을 주고 실행 기록을 FAILED로 남긴다. 개별 메일 전송 실패는 성공 응답의 failed·unknown으로 나타날 수 있다. Cron 설정·중지·실패 작업 재처리·작업 ID 단건 조회 API는 현재 없다.

### API29 GET /api/admin/operations

ADMIN 전용. 본문 없음. 수집·작업·신고·게시 상태의 운영 목록을 반환한다.

```json
{ "jobs": [], "feedback": [], "changes": [], "sources": [], "policies": [] }
```

| 목록     | 항목 필드                                                                            | 정렬과 최대 건수   |
| -------- | ------------------------------------------------------------------------------------ | ------------------ |
| jobs     | id, type, status, summary, last_error, created_at                                    | 최신 20건          |
| feedback | id, message, status, created_at                                                      | 최신 30건          |
| changes  | id, source_id, previous_snapshot_id, new_snapshot_id, status, created_at, title, url | 최신 20건          |
| sources  | id, title, url, last_success_at, last_error                                          | 제목 순, 제한 없음 |
| policies | id, title, version, status, is_demo                                                  | 제목 순, 제한 없음 |

jobs.type은 notifications·collect, status는 RUNNING·SUCCEEDED·FAILED이며 summary는 작업별 요약 객체 또는 null이다. feedback.status는 OPEN·RESOLVED지만 상태 수정 API는 없다. changes.status는 현재 수집 시 PENDING으로 만들며 처리 완료 API는 없다. policies는 활성 규칙이 없으면 version·status·is_demo가 null이다. 이 응답에 원문 본문·세션·키·신고자 이메일은 포함하지 않는다.

### API30 GET /api/admin/integrations

ADMIN 전용. 본문 없음.

```text
200 {
  live: boolean,
  items: IntegrationItem[]
}

IntegrationItem = {
  provider, operation, title, where, endpoint, file,
  required: string[], flag: string | null, note: string,
  configured: boolean, enabled: boolean,
  events: [{provider, operation, mode, status, count}]
}
```

provider는 현재 Liner·Stibee·NTS, operation은 search·draft·decisions·send·status다. title·where·endpoint·file·note는 표시용 문자열이다. required는 필요한 환경변수 **이름**이며 실제 값이 아니다.

configured는 필요한 설정 값이 존재하는지, enabled는 공통·개별 기능 스위치가 켜졌는지다. 둘 다 true여도 실제 제공자 인증 성공을 보장하지 않는다. flag는 기능별 활성 환경변수 이름 또는 null이다.

events.mode는 LIVE·LOCAL, status는 SUCCESS·FAILED·DISABLED이며 count는 정수다. 기록을 시작한 버전 이후 서버 요청 결과 집계다. LIVE의 FAILED는 실제 HTTP 전송 전후 오류를 포함할 수 있어 제공자 청구 횟수와 같지 않다. Jev 대체 결과가 LOCAL_RULES여도 실제 요청을 시도했다면 이벤트는 LIVE·FAILED일 수 있다.

## 10 외부 API 연결 경계

이 절은 현재 코드가 외부 API를 사용하는 위치를 설명한다. 외부 제공자의 전체 API 계약을 대신하지 않는다. 클라이언트는 비밀 키를 갖고 제공자를 직접 호출하지 않는다.

| 제공자       | 앱에서 호출되는 지점 | 외부 요청 또는 SDK                                          | 목적                            |
| ------------ | -------------------- | ----------------------------------------------------------- | ------------------------------- |
| Liner Search | API25                | POST `https://platform.liner.com/api/v1/tools/search/web`   | 공식 근거 후보 검색             |
| Liner Chat   | API27                | POST `https://platform.liner.com/api/v1/chat/completions`   | 원문 기반 구조화 초안           |
| Liner Jev    | API20                | POST `https://platform.liner.com/api/v1/decisions`          | 변경 종류·출처 일치 추정·긴급도 |
| 국세청       | API18                | POST `https://api.odcloud.kr/api/nts-businessman/v1/status` | 사업자 상태 참고                |
| 스티비       | API28 notifications  | 설정한 `https://stibee.com/api/v1.0/auto/...`에 POST        | 기한·계획 변경 메일             |

외부 키는 서버 설정에 둔다. 기본 `LIVE_INTEGRATIONS_ENABLED=false`이며 켜도 각 제공자의 키와 별도 설정이 필요하다. Jev 기본 모델은 보드에 맞춘 `typesafe/jev-1.14`이고 설정으로 바꿀 수 있다. 계정 지원 모델 확인은 별도다.

스티비는 `EMAIL_TRANSPORT=stibee`·키·자동 이메일 URL·계정 템플릿·등록 수신자 준비가 필요하다. 변수는 task_title·plan_url을 사용한다. API28은 계획 동의와 최신 할 일 상태를 확인한 개별 알림을 전송하며, 주소록 그룹 자동 등록은 아직 없다. 응답 접수는 실제 수신과 다르다.

질문과 오류 접수는 내부 support API에서 처리한다. 자세한 설정은 [API 사용 위치](API-USAGE.md)를 참고한다.

## 11 오류 계약

### 공통 형식

```json
{
  "error": "입력값을 확인하세요.",
  "code": "VALIDATION_ERROR",
  "fields": [{ "path": "business.currentHeadcount", "message": "입력 범위를 확인하세요." }]
}
```

fields는 입력 검증 오류에만 제공한다. path는 점으로 연결한 경로이며 message의 실제 문구는 검증 라이브러리에 따라 달라질 수 있다. 클라이언트 분기는 error의 한국어 문장보다 HTTP 상태·code·필드 경로를 기준으로 한다.

| HTTP | 주요 code                         | 현재 의미                                       |
| ---- | --------------------------------- | ----------------------------------------------- |
| 400  | REQUEST_ERROR                     | JSON 해석 실패                                  |
| 401  | UNAUTHENTICATED                   | 세션 없음·만료                                  |
| 401  | REQUEST_ERROR                     | 로그인 불일치                                   |
| 403  | ORIGIN_REJECTED                   | 변경 요청 Origin 누락·불일치                    |
| 403  | FORBIDDEN                         | ADMIN 권한 부족                                 |
| 403  | REQUEST_ERROR                     | 로컬 전용 기능 조건 위반 등                     |
| 404  | NOT_FOUND 또는 REQUEST_ERROR      | 자원 없음·소유권 없음·데모 비활성 등            |
| 409  | REVIEW_CONFLICT                   | 검수 상태 또는 기준 버전 충돌                   |
| 409  | REQUEST_ERROR                     | 취소 계획 변경·복귀 버전 없음·분류 상태 충돌 등 |
| 413  | REQUEST_ERROR                     | 읽은 JSON 요청 내용이 크기 한도 초과            |
| 415  | REQUEST_ERROR                     | 본문 API의 JSON Content-Type 없음·불일치        |
| 422  | VALIDATION_ERROR                  | 필드·UUID·스키마 검증 오류                      |
| 422  | REQUEST_ERROR                     | 규칙 의미·근거·허용 주소 등의 추가 검증 오류    |
| 429  | REQUEST_ERROR                     | 앱 요청 횟수 제한                               |
| 502  | UPSTREAM_ERROR 또는 REQUEST_ERROR | 명시적으로 매핑한 외부 요청 실패                |
| 503  | INTEGRATION_DISABLED              | 공통 외부 연동 꺼짐                             |
| 503  | INTEGRATION_NOT_CONFIGURED        | liveKey에서 필요한 키 없음                      |
| 503  | REQUEST_ERROR                     | 초안·메일 등 별도 활성·설정 부족                |
| 500  | INTERNAL_ERROR                    | 처리하지 못한 예외·DB 오류 등                   |

### HTTP 200이어도 확인해야 하는 값

| API   | 추가 확인                                                |
| ----- | -------------------------------------------------------- |
| API10 | 결과가 MATCH인지와 NEEDS_INFO·REVIEW_REQUIRED 등을 구별  |
| API17 | escalated=false이면 질문 접수가 완료된 것이 아닐 수 있음 |
| API20 | method·errorCode로 실제 Jev 사용과 로컬 대체 구별        |
| API27 | published=false, 별도 초안 등록 필요                     |
| API28 | skipped·failed·unknown·accepted 등 작업 결과 확인        |
| API30 | configured·enabled는 실제 인증 성공을 뜻하지 않음        |

### 현재 오류 매핑의 한계

Liner 검색·초안 생성·국세청 응답 일부는 제공자 응답을 Zod로 검증한다. 여기서 발생한 Zod 오류는 현재 공통 처리기에 의해 422 VALIDATION_ERROR로 표시될 수 있다. 별도 변환하지 않은 네트워크 예외는 500 INTERNAL_ERROR로 나올 수 있다. 모든 외부 장애가 502로 표준화된 상태는 아니다.

Jev는 외부 실패를 따로 분류하고 API20에서 로컬 대체한다. 그 외 API의 오류 코드 세분화·응답 DTO 정리·분산 요청 제한은 후속 정리 대상이다. 문서 작성 과정에서 코드를 바꾸거나 오류 동작을 새로 구현하지 않았다.

## 12 호출 순서와 재요청 원칙

### 사업주 기본 순서

1. API03 로그인 또는 API02 로컬 데모로 세션을 받는다.
2. API07에 business와 hire를 보내 계획 ID를 받는다.
3. API08에서 최신 결과와 할 일을 조회한다.
4. 가정 비교는 API10, 저장된 채용 조건 수정은 API09를 사용한다.
5. 준비 완료는 API14, 알림 동의는 API11을 사용한다.
6. FAQ·질문은 API17, 데모 알림 확인은 API13과 API16을 사용한다.
7. 계획을 중지하려면 API12, 세션 종료는 API04를 호출한다.

### 운영자 기본 순서

1. API25에서 근거를 검색하고 API26으로 허용 출처를 등록한다.
2. API28 collect로 수집하고 API29에서 변경·오류를 확인한다.
3. 확인 가능한 snapshot ID로 API27 제안을 요청하거나 수동으로 초안을 작성한다.
4. 제안·수정한 PolicyDraftInput을 API22에 등록해 reviewId를 받는다.
5. API19로 비교하고 API20으로 분류한 뒤 원문을 검수한다.
6. API21에서 수정 승인 또는 반려한다. 필요하면 API23·API24를 사용한다.
7. API28 notifications로 만기 알림을 처리하고 API29·API30으로 결과를 확인한다.

현재 초안 등록 API는 신규 제도를 만들기 때문에 기존 제도의 새 버전을 등록하는 흐름 전체가 공개 API로 연결된 상태는 아니다. 첫 원문 수집의 snapshot ID 조회도 전용 API가 없어 운영 도구 보완이 필요할 수 있다. 이 간격을 존재하지 않는 API로 채운 것으로 가정하지 않는다.

### 재요청과 중복

| 요청                     | 현재 주의점                                 |
| ------------------------ | ------------------------------------------- |
| 계획·제도·신고·질문 생성 | 재전송하면 별도 데이터가 생성될 수 있음     |
| 데모 시작·테스트 메일    | 반복마다 새 데이터 생성                     |
| 채용 조건 PATCH          | 같은 값도 입력 버전 증가 가능               |
| 알림 true                | 예약 중복은 방지하지만 동의 시각 갱신       |
| 출처 등록                | 같은 URL 중복은 무시, 기존 내용 수정은 아님 |
| 검수 분류                | 분류 이력 추가, 외부 활성 시 추가 요청 가능 |
| 검수 승인                | 이미 처리된 항목은 409, 임의 재승인 금지    |
| 이전 버전 복귀           | 반복하면 더 이전 버전으로 갈 수 있음        |
| 알림 UNKNOWN             | 제공자 접수 확인 없이 자동 재전송하지 않음  |

요청 시간이 길어도 저장·발송이 취소됐다고 단정하지 않는다. 생성·승인·복귀·전송에는 무조건 자동 재시도를 적용하지 말고 최신 상태부터 확인한다. 현재 서버의 Idempotency-Key·낙관적 입력 버전 조건·비동기 작업 조회를 지원하는 계약은 없다.

## 13 확장 시 관리 원칙과 미구현 범위

사업장 정보가 늘어날 가능성은 인지하되 현재 필수 입력을 임의로 추가하지 않는다. 항목이 확정되면 기능명세서 3번과 이 문서의 BusinessInput, 저장 스냅샷, 기존 계획 마이그레이션, 판정 입력·테스트를 함께 갱신한다. 선택 필드 추가라도 현재 strict 서버는 미정의 필드를 거절하므로 배포 순서를 관리해야 한다. 새 필수값·기존 필드 의미 변경은 별도 호환성 검토가 필요하다. 이는 향후 관리 원칙이며 새 API 구현을 뜻하지 않는다.

현재 없는 API는 독립 사업장 등록·수정, 공개 회원가입·비밀번호 복구·계정 삭제, 기존 제도의 새 버전 등록, 원문 스냅샷 목록·본문 조회, 검수 영향 사용자·정밀 우선순위 조회, 신고 처리·답변 전달, 메일 수신·반송·수신 거부 웹훅, 스티비 그룹 동기화, 문서 업로드·만료 등록, Alt 수집, VAPI 전화, 결제·B2B 사업장 권한이다.

향후 구현 시 이 문서의 API ID를 유지하고 요청·응답·오류·권한·기능명세서 ID를 함께 변경 이력에 기록한다.

## 14 작성 근거

- [기능명세서](기능명세서.md), [빠른 API 계약](API.md), [외부 API 사용 위치](API-USAGE.md).
- `src/app/api/[...path]/route.ts`: 실제 경로·요청 스키마·응답과 권한 진입.
- `src/domain/contracts.ts`, `simulation.ts`, `review-routing.ts`: 입력·규칙·시뮬레이션·분류 모델.
- `src/server/auth.ts`, `http.ts`, `service.ts`, `support.ts`, `jobs.ts`, `review-assessment.ts`, `integration-status.ts`: 인증·상태 변경·목록·작업·오류 처리.
- `db/migrations/0001_init.sql`, `0002_review_assessments.sql`: 실제 반환되는 DB 필드와 상태.

응답 필드와 예외는 현재 코드와 대조했다. 이 문서의 예시를 실제 운영 API 호출·제도 검수·외부 메일 수신 완료 증거로 사용하지 않는다.

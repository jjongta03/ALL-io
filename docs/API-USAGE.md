# API 사용 위치와 목적

2026-11-14 최신 Miro 재확인 후 반영한 개발 버전. 실제 설정 상태는 운영자 메뉴 **API 사용 현황**(`/admin/integrations`)에서 확인한다. 이번 실행 환경은 모든 외부 키가 비어 있고 `LIVE_INTEGRATIONS_ENABLED=false`이다. 따라서 **아래 외부 API는 연결 코드를 구현했으며 실제 계정 호출은 검증하지 않았다.** 테스트의 HTTP 응답은 모의 응답이다.

## 외부 API

| API                    | 화면·작동 시점                                              | 외부 요청                                                   | 구현                                                                                                            |
| ---------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Liner Search           | 운영자 → 수집·작업·신고 → 공식 자료 검색                    | `POST https://platform.liner.com/api/v1/tools/search/web`   | `src/integrations/providers.ts`의 `searchOfficialSources`                                                       |
| Liner Chat Completions | 수집한 변경 원문의 AI 초안 제안                             | `POST https://platform.liner.com/api/v1/chat/completions`   | `src/integrations/drafting.ts`의 `LinerRuleDraftGenerator.suggest`                                              |
| Liner Decisions / Jev  | 운영자 → 규칙 검수 → 변경 분류·우선순위 계산                | `POST https://platform.liner.com/api/v1/decisions`          | `src/integrations/decisions.ts`의 `assessWithJev`                                                               |
| 스티비 자동 이메일     | 동의한 사용자의 신규 혜택·프로젝트·반복 서류·기존 계획 알림 | 설정한 `https://stibee.com/api/v1.0/auto/...`에 POST        | `src/server/workspace-notifications.ts` / `src/server/jobs.ts` → `src/integrations/providers.ts`의 `sendStibee` |
| 국세청 사업자 상태조회 | 새 계획 입력 중 사업자 상태 조회                            | `POST https://api.odcloud.kr/api/nts-businessman/v1/status` | `src/integrations/providers.ts`의 `checkBusinessStatus`                                                         |

Liner Search는 공식 근거 후보를 찾는다. 검색 결과만으로 지원 조건을 확정하지 않는다. Chat Completions는 수집한 원문 안의 문구를 근거로 제안하고, 원문 불일치·잘못된 JSON을 거절하며 `verified`를 미검수로 돌린다.

Jev는 `choice`로 변경 종류, `noul`로 출처 일치 추정, `score`로 긴급도를 묻는다. 기본 모델은 보드의 `typesafe/jev-1.14`이며 계정에서 지원하는 모델인지 확인해야 한다. `LINER_DECISION_MODEL`로 바꿀 수 있다. 공식 문서의 예시 모델 버전과 보드 버전은 다를 수 있다. 신뢰도는 법적 정확도가 아니다. 모델의 확신이 높아도 조건·서류·기한 변경은 직접 검수하며, 모든 게시에는 사람 승인이 필요하다. 원문이 없거나 저신뢰·충돌·보류인 결과를 낮은 위험으로 취급하지 않는다. 402·429·5xx·형식 오류·타임아웃은 수동 검수를 유지하고 오류 코드를 남긴다. API가 꺼져 있으면 실제 모델 점수를 만들지 않고 **LOCAL_RULES**로 기록한다.

스티비는 주소록에 등록된 실제 수신자와 실행 중인 자동 이메일 템플릿이 필요하다. 템플릿 변수 `task_title`, `plan_url`을 설정한다. 응답 접수와 실제 수신은 다르므로 `ACCEPTED_BY_PROVIDER`와 `UNKNOWN`을 구분한다. 서비스 수신 동의 기반 주소록 동기화·외부 수신 거부 반영·주간 미완료 업무 요약을 추가했다. 업종×인원 그룹과 수신/반송 웹훅은 아직 구현하지 않았다. [추가 API와 실행](CONNECTED-WORKFLOWS.md)을 참고한다. 현재 전송 대상은 앱이 소유권·이메일 동의·최신 상태를 확인한 사업장과 개별 계획이다. 수신 주소는 로그인 계정의 이메일이다. v2 계약과 실행 방법은 [BACKEND-V2.md](BACKEND-V2.md)를 참고한다. 2026-11-15 요청에 따라 알림톡은 이메일로 바꾸고 채널톡 API·SDK·설정을 제거했다. 내부 FAQ·오류/미답변 접수는 `/api/support`에서 계속 동작한다.

국세청 응답은 계속·휴폐업 및 과세유형 참고용이다. 사업자 본인 인증 또는 지원 자격 검증으로 사용하지 않는다. 사업자번호는 호출 기록에 저장하지 않는다.

## 직접 만든 앱 API

| API                                  | 목적                                                      | 외부 호출 여부                          |
| ------------------------------------ | --------------------------------------------------------- | --------------------------------------- |
| `POST /api/plans/:id/simulate`       | 소유한 계획의 현재 인원·급여·보험 산정 인원을 가정해 비교 | 없음. 화면도 같은 순수 규칙 엔진을 사용 |
| `POST /api/admin/reviews/:id/assess` | 저장된 검수 초안을 분류하고 우선순위·이력 저장            | 명시적으로 켠 경우에만 Jev              |
| `POST /api/support`                  | 혜택·서류 FAQ, 오류/미답변 질문을 운영자 검수로 접수      | 없음                                    |
| `GET /api/admin/integrations`        | 키의 존재 여부·활성 상태·서버 요청 결과 집계              | 없음                                    |

새 API에도 세션·소유권 또는 ADMIN 검사와 쓰기 Origin 검사를 적용했다. 시뮬레이션은 계획·판정 이력·체크리스트·알림을 수정하지 않는다. 직원 수를 바꿔도 고용보험·국민연금 산정 인원을 자동으로 따라 바꾸지 않는다.

호출 기록은 `integration_events`, 검수 분류 이력은 `review_assessments`에 저장한다. 기록에 키·사업자번호·사용자 이메일·모델 입력 원문은 넣지 않는다. 사용 현황의 수치는 이 버전 이후 기록한 서버 요청 시도이며, 실제 과금·수신 성공 또는 SDK 브라우저 통계를 뜻하지 않는다.

## 실제 연동 설정

`.env.example`에 키 이름과 기본값을 두었다. 실제 값은 Git에서 제외한 `.env.local` 또는 배포 환경에 설정한다. 수정 후 서버를 재시작한다.

- 공통: `LIVE_INTEGRATIONS_ENABLED=true`.
- 검색: `LINER_API_KEY`.
- AI 초안: 위 키 + `DRAFT_GENERATION_ENABLED=true`, `LINER_DRAFT_MODEL`.
- Jev: 위 키 + `JEV_ENABLED=true`, 필요 시 `LINER_DECISION_MODEL`.
- 스티비: `EMAIL_TRANSPORT=stibee`, `STIBEE_API_KEY`, `STIBEE_AUTO_EMAIL_URL`. 주소록·템플릿은 계정에서 먼저 준비한다.
- 국세청: `NTS_API_KEY`.

## 후속 범위

EXAONE과 Alt는 사용자 요청으로 제외했다. Liner Search Agent·Deep Research, VAPI 전화는 미구현이다. 요금제 결제·매출 구간별 규칙·문서 만료일 데이터 수집도 남아 있다. 보드의 모든 아이디어가 운영 가능한 서비스로 완성된 상태는 아니다.

## 확인한 공식 문서

- [Liner Decisions](https://liner.com/developers/docs/liner-model-api-decisions)
- [Liner Chat Completions](https://liner.com/developers/docs/liner-model-api-chat-completions)
- [스티비 자동 이메일 API](https://help.stibee.com/email/automation/api)
- [스티비 API 목록·권한](https://developers.stibee.com/llms.txt)

스티비 OpenAPI의 구독자 추가/갱신 및 목록 조회 요청을 확인하고 주소록 동기화를 구현했다. 실제 계정 호출과 그룹 동기화는 수행하지 않았다.

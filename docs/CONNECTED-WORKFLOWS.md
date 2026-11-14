# Liner·스티비 활용 확장

2026-11-15 백엔드 추가 범위다. EXAONE·Alt는 요청에 따라 제외했다. Bivia·채널톡·알림톡도 사용하지 않는다. 기존 API와 화면은 유지하며 새 기능의 PC 웹 화면 연결은 별도 작업이다.

## 기존과 달라진 점

| 구분                  | 기존                                          | 추가                                                                                                  |
| --------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Liner                 | 운영자 수동 검색, 수집 원문 기반 AI 규칙 초안 | 저장한 검색어를 주기적으로 실행, 공식 공고 후보 저장, 운영자가 출처 등록, 원문 변경 이력 및 초안 연결 |
| 스티비 주소록         | 수신자를 계정에서 미리 등록                   | 마이페이지 이메일 동의 변경을 작업으로 저장하고 구독/수신 거부 상태 동기화                            |
| 스티비 외부 수신 거부 | 앱 동의만 검사                                | 주소록 조회로 수신 거부·대기·보관 상태를 로컬 동의에 반영하고 미발송 알림 취소                        |
| 주간 이메일           | 신규 혜택·기한별 알림                         | 월요일~일요일 단위 사업장별 미완료 업무 요약, 같은 주 중복 예약 방지, 발송 직전 재계산                |

## 동작과 제한

- 공고 검색 결과는 자격 조건으로 자동 적용되지 않는다. 공식 HTTPS 허용 목록만 후보로 저장하며, 운영자가 출처 등록을 승인해야 본문을 수집한다. 검색어당 최신 검색 결과 최대 5건이다. 실행당 검색어 20개·출처 50개를 오래된 확인 순으로 처리한다. HTML·텍스트만 지원하므로 PDF/HWP·로그인·동적 페이지는 수동 검수 대상이다.
- 원문 A→B→A 재변경도 별도 이벤트로 보존한다. 동일 본문 스냅샷을 재사용하며 이벤트와 검수 ID를 연결한다. AI 초안의 근거 문구가 수집 원문과 일치해야 하고 `verified=false`, `PENDING_REVIEW`로 저장한다. 게시와 기존 버전 교체는 기존 ADMIN 검수·승인 경로를 거친다. AI가 자동 승인하지 않는다.
- 주소록은 로그인 계정 이메일과 서비스 알림 동의만 동기화한다. 광고 동의는 부여하지 않는다(`marketingAllowed=false`). 동의 변경의 버전을 보존하고, 오래된 작업을 취소한다. 기존 프로필도 마이그레이션으로 작업을 생성한다. 외부 연동이 꺼져 있으면 `LOCAL_ONLY`로 저장하며, 명시적으로 활성화한 뒤 최신 로컬 작업만 실제 동기화한다.
- 작업은 외부 요청 전에 `CLAIMED`를 커밋한다. 같은 소유자의 동시 작업을 제한한다. 타임아웃·중단은 `UNKNOWN`으로 두고 자동 재시도하지 않는다. 해당 상태는 계정에서 실제 상태를 확인한 후 새 동의 변경으로 조정해야 한다. 이미 외부에 접수된 요청을 취소한다고 보장하지 않는다.
- 외부 수신 거부는 전체 주소록을 1,000건씩 최대 100,000건 조회한다. 그보다 큰 주소록은 명시적 오류로 끝나며 추가 페이지 처리 설계가 필요하다. 동기화 중 새로 변경한 동의를 이전 조회 결과로 덮어쓰지 않는다. 새 구독 작업이 아직 대기 중인 동의는 과거 외부 상태로 해제하지 않는다. 주소록에서 삭제된 수신자는 목록에 없으므로 수신 거부로 추정하지 않는다.
- 주소록 동기화를 켠 실제 이메일 전송은 `APPLIED`·`subscribed` 확인 전에는 대기한다. 로컬 수신 거부는 기존 계획과 v2 사업장 모두 발송 직전에 검사한다. 외부 수신 거부의 앱 반영 시점은 조회 작업 주기에 좌우된다. 반송/실수신 추적 웹훅은 추가하지 않았다. `ACCEPTED_BY_PROVIDER`는 실제 수신 성공이 아니다.
- 주간 요약은 일요일까지 마감인 미완료 업무, 지난 기한의 미완료 업무, 마감 미정 체크리스트를 포함한다. 제목에는 실제 총 건수와 최대 3개 업무명을 넣고 대시보드로 연결한다. 완료/비활성 업무를 발송 직전에 제외하고, 빈 요약이나 지난 주 예약을 취소한다. 기존 신규 혜택·개별 마감 알림은 별도로 유지한다.
- 변경된 입력으로 재진단하거나 승인된 공고를 적용하는 작업은 기존 `reassess` 작업이다. 감시 작업 자체는 사용자 판정과 불변 입력 스냅샷을 수정하지 않는다.

## 설정

기본값은 모두 비활성이고 키는 비어 있다. `.env.local`에 실제 값을 넣고 재시작한다.

```dotenv
LIVE_INTEGRATIONS_ENABLED=false
POLICY_WATCH_ENABLED=false
LINER_API_KEY=
DRAFT_GENERATION_ENABLED=false
LINER_DRAFT_MODEL=
STIBEE_CONTACT_SYNC_ENABLED=false
STIBEE_API_KEY=
STIBEE_LIST_ID=
STIBEE_AUTO_EMAIL_URL=
EMAIL_TRANSPORT=local
```

실제 감시는 공통·감시 플래그와 Liner 키, 초안 생성은 초안 플래그와 계정 지원 모델이 추가로 필요하다. 실제 주소록 동기화는 공통·주소록 플래그와 스티비 키/숫자 주소록 ID가 필요하다. 실제 메일은 `EMAIL_TRANSPORT=stibee`와 실행 중인 자동 이메일 URL이 추가로 필요하다. 주소록과 자동 이메일이 같은 계정·수신자 범위를 사용하는지 확인한다. 템플릿 변수는 `task_title`, `plan_url`이며 주간 요약도 같은 템플릿을 사용한다.

## API

모든 경로는 `/api/v2` 기준이다. 세션이 필요하며 쓰기 요청에는 허용된 `Origin`이 필요하다. `admin/`은 ADMIN 전용이다.

| 메서드·경로                          | 입력·결과                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `GET /email-contact`                 | 본인의 동의·외부 상태·동기화 상태·버전. 키와 이메일은 반환하지 않음                      |
| `PUT /profile`                       | 기존 `emailAlerts` 변경이 주소록 작업도 생성. 단순 재저장은 중복 작업 생성 안 함         |
| `GET /admin/watches`                 | 검색어 목록                                                                              |
| `POST /admin/watches`                | `{query, enabled}`. 같은 검색어는 활성 여부 갱신                                         |
| `PATCH /admin/watches/:id`           | `{enabled}`                                                                              |
| `GET /admin/discoveries`             | 검색된 공식 후보 최근 100개                                                              |
| `POST /admin/discoveries/:id/accept` | 공식 출처 수집 등록 및 감사 기록                                                         |
| `GET /admin/watch-events`            | 원문 변경 이벤트 최근 100개                                                              |
| `GET /admin/watch-events/:id`        | 이전·현재 원문 스냅샷과 검수 연결                                                        |
| `POST /admin/watch-events/:id/draft` | `{}` 또는 `{policyId}`. 새 정책 초안 또는 기존 정책의 새 버전, 이벤트당 하나의 검수 생성 |
| `POST /admin/jobs`                   | `{kind:"contacts"\|"contact-reconcile"\|"policy-watch"\|"weekly"}`                       |

발송은 기존 `{kind:"notifications"}`, 새 판정은 `{kind:"reassess"}` 작업을 사용한다. 이 구현은 백엔드 작업과 실행 진입점을 제공하며 외부 cron을 생성하지 않는다.

```powershell
npm run jobs:connected -- contacts
npm run jobs:connected -- contact-reconcile
npm run jobs:connected -- policy-watch
npm run jobs:connected -- weekly
npm run jobs:workspace -- reassess
npm run jobs:workspace -- notifications
```

권장 실행 순서: 외부 수신 거부 조회 → 주소록 변경 동기화 → 공고 감시 → 운영자 검수/승인 → 재진단 → 주간 예약 → 발송. 운영에서 감시·재진단은 일별, 주소록·발송은 주기적으로, 주간 예약은 월요일 실행하도록 별도 스케줄러를 연결한다. 로컬 PGlite는 앱을 중지하고 CLI를 실행한다. 동시 앱/cron은 `MAWD_DATABASE_URL`의 PostgreSQL을 사용한다.

## 검증과 남은 게이트

`npm run check`, `npm run build`, 실행 중인 로컬 앱의 `npm run smoke`, `npm run smoke:workspace`로 확인한다. 새 테스트는 합성 계정과 모의 HTTP 응답만 사용한다. 외부 키·실제 수신자·이메일·공고 페이지 호출 없이 검증한다.

검증 기록(2026-11-15): 전체 단위/DB 테스트, 형식 검사, Next.js 빌드, 기존 및 v2 HTTP 스모크 통과. 별도 ignored PGlite 경로 `data/connected-workflows-smoke`에 마이그레이션을 적용했고 검증 서버는 종료했다. 실제 키·이메일·외부 cron·배포는 사용하지 않았다.

운영 전에는 테스트 전용 스티비 주소록/자동메일과 실제 제공 키로 계정 권한·요금제·요청 형식·수신 거부·실제 수신을 검증해야 한다. Liner 모델 가용성 및 실제 공고 첨부파일의 수동 검수, 사람 승인 기록, PostgreSQL 동시 실행도 확인 대상이다. 시드의 가상 문턱값은 실제 보조금 조건이 아니며 운영에서 데모 규칙을 허용하지 않는다.

확인한 공식 문서: [Liner Search](https://liner.com/developers/docs/search-api), [Liner Chat Completions](https://liner.com/developers/docs/liner-model-api-chat-completions), [스티비 OpenAPI](https://developers.stibee.com/openapi.yml), [스티비 자동 이메일](https://help.stibee.com/email/automation/api).

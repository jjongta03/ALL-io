# PC 웹 와이어프레임용 백엔드 v2

구현 기준은 [Figma의 통합 섹션 105:2084](https://www.figma.com/design/S3Ur5di6qvUm7WugoJRbYX/?node-id=105-2084)과 대화에서 확정한 요구사항이다. 2026-11-15 요청에 따라 **백엔드를 추가했고 Bivia는 제외했다. 이후 같은 날 요청에 따라 알림톡을 스티비 이메일로 통일하고 채널톡 API·SDK·설정·상담 버튼을 제거했다.** 기존 채용 계획 앱은 유지하며 새 흐름은 `/api/v2`로 분리했다. 2026-11-15 Figma 기반 화면을 연결했다. 경로와 검증은 [FRONTEND.md](FRONTEND.md)를 참고한다.

## 화면과 데이터 흐름

1. 초기 입력은 4단계 임시 저장을 지원한다. 사장님 이름·생년월일·휴대전화·이메일 수신 동의, 사업장 정보, 과거 사업 이력, 직원 등록 순서로 사용할 수 있다. 임시 저장은 진단에 반영하지 않으며 프로필·사업장·직원 확정 저장 API를 호출해야 한다.
2. 직원 수는 직접 받지 않는다. 계약서 인식 결과를 확인 저장한 직원과 직접 등록한 직원에서 서버가 집계한다. 명단이 확정되지 않았다면 진단 인원은 null이다. 미래 입사자는 명단에는 보이지만 현재 인원에서는 제외한다. 보험별 산정 인원은 계약서의 직원 수와 별개로 확인한다.
3. 직원 목록은 기본 8개와 총원·현재 인원·페이지 정보를 반환한다. 초기 화면의 2열/8명/더보기, 마이페이지의 전체 목록은 같은 API의 offset/limit으로 연결한다. 2열 배치는 프론트엔드 작업이다.
4. PDF·PNG·JPEG 계약서를 최대 8MB까지 받는다. 자동 인식 결과는 미확인 초안이며 이름·근로 형태·주당 시간·시급·시작일을 수정한 뒤 확인 저장해야 직원과 진단에 반영된다. 모르는 값은 null이며 월급을 시급으로 추정하지 않는다. 외부 연동이 꺼져 있으면 실제 인식처럼 꾸미지 않고 `MANUAL_REQUIRED`와 빈 초안을 반환한다.
5. 직원 수정은 revision으로 덮어쓰기를 방지한다. 퇴사는 경고 화면에서 확인한 경우에만 `confirm:true`와 최신 revision을 전송한다. 직원·연결 계약서 원문·추출 초안은 같은 트랜잭션에서 삭제하고 재진단한다. 감사 기록에는 직원 ID만 남긴다.
6. 혜택 목록은 현재 사실로 MATCH인 BENEFIT만 반환한다. 운영에서는 사람이 승인하고 출처를 확인했으며 모집 중인 기간까지 검수된 제도만 통과한다. 정보 부족·검수 대기·모집 종료는 제외한다. 날짜 또는 규칙이 바뀌어 평가가 오래되면 `needsReevaluation:true`와 빈 목록을 반환하므로 재진단을 요청한다.
7. 시작하기는 정책의 모집 주기(현재는 검수된 effectiveFrom)당 프로젝트를 한 번 만든다. 순서·설명·신청 사이트 링크·체크 상태·진행률을 저장한다. 접수 기한을 모르면 null이며 준비용 상대 기한을 실제 공고 마감일로 간주하지 않는다. 운영자는 해당 모집 주기를 정확하게 구분해야 한다.
8. 진행 중인 혜택은 `workflowStatus:IN_PROGRESS`와 progress를, 완료하면 `COMPLETED`를 반환한다. 완료 프로젝트는 `completed`에도 남고 대시보드 진행 목록에서 빠진다. 회색 글씨·취소선은 프론트엔드에서 표시한다. 완료 해제를 지원한다. 직원 변경으로 조건에 맞지 않아도 진행 기록은 지우지 않고 `RECHECK_REQUIRED`로 표시한다.
9. 정기 서류는 주·월·년 반복, 기준일, 사전 알림 일수, 제출 링크를 저장한다. 월말 기준을 유지하며 회차별 완료 이력을 남긴다. 정기 재진단 작업은 사용자가 지난 회차를 완료하지 않아도 다가올 회차를 생성한다. 미완료 과거 회차는 보존한다.

## API 계약

인증은 기존 세션 쿠키를 사용한다. 아래 경로의 접두사는 `/api/v2`다. 모든 변경 요청은 `Origin`이 `APP_URL`의 Origin과 같아야 한다. JSON 요청은 `Content-Type:application/json`, 최대 64KB다. 다른 소유자의 리소스는 404, 미인증은 401, 권한 부족은 403, 검증 실패는 422, revision 충돌은 409다.

| 메서드 / 경로                                    | 용도 / 입력                                                                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET / PUT `/profile`                             | 사장님 프로필 조회 / 전체 저장. name, birthDate, phone은 nullable, emailAlerts는 boolean. 수신 주소는 로그인 계정 이메일이며 전화번호는 필수가 아님 |
| PUT `/onboarding`                                | `{stage:1~4, owner?:프로필, business?:사업장}`. 이전 단계 값을 보존하는 임시 저장                                                                   |
| GET / POST `/businesses`                         | 소유 사업장 목록 / 사업장 생성                                                                                                                      |
| GET / PUT `/businesses/:id`                      | 사업장 조회 / `{revision, facts:사업장}` 저장·재진단                                                                                                |
| GET `/businesses/:id/employees?offset=0&limit=8` | 직원 명단, total, currentCount. limit 최대 100, 더 필요한 경우 페이지 요청                                                                          |
| POST `/businesses/:id/employees`                 | 직원 직접 등록. name 필수, employmentType/weeklyHours/hourlyWage/startedOn nullable                                                                 |
| GET / PUT / DELETE `/employees/:id`              | 상세 / `{revision,details:직원}` 수정 / `{revision,confirm:true}` 퇴사·정보 삭제                                                                    |
| POST `/businesses/:id/scans`                     | multipart의 file 한 개. 미확인 초안·상태·requiresConfirmation 반환                                                                                  |
| GET / DELETE `/scans/:id`                        | 추출 초안 조회 / 미확정 스캔 삭제. 확정 스캔은 직원 상세에서 관리                                                                                   |
| GET `/scans/:id/document`                        | 소유자만 계약서 다운로드. no-store·attachment·nosniff                                                                                               |
| POST `/scans/:id/confirm`                        | 직원 정보 확인 저장. 중복 호출해도 직원이 중복 생성되지 않음                                                                                        |
| GET `/businesses/:id/benefits`                   | 현재 신청 가능 혜택, 진행 상태, 완료 이력, 재진단 필요 여부                                                                                         |
| GET `/businesses/:id/benefits/:policyId`         | 신청 가능 혜택 또는 이미 시작한 혜택의 설명·근거·프로젝트                                                                                           |
| POST `/businesses/:id/evaluate`                  | 현재 정보로 재진단. 입력·규칙 스냅샷을 새로 보존                                                                                                    |
| GET `/businesses/:id/dashboard`                  | 진행 프로젝트, 완료 수, 정기 서류                                                                                                                   |
| GET / POST `/businesses/:id/projects`            | 프로젝트 목록 / `{policyId}`로 시작                                                                                                                 |
| GET / DELETE `/projects/:id`                     | 조회: 정렬된 steps·guide·progress·complete. 삭제: `{confirm:true}`, 소유권 확인 후 단계·예약 알림도 함께 삭제                                       |
| PATCH `/project-steps/:id`                       | `{done?:boolean,deadline?:YYYY-MM-DD 또는 null}`                                                                                                    |
| GET / POST `/businesses/:id/documents`           | 반복 서류·회차 조회 / 반복 서류 생성                                                                                                                |
| PUT / DELETE `/documents/:id`                    | 반복 서류 전체 수정 / 회차와 예약까지 삭제                                                                                                          |
| POST `/occurrences/:id/complete`                 | 회차 완료와 다음 회차 생성. 중복 완료는 무해함                                                                                                      |
| GET `/businesses/:id/notifications`              | 예약·로컬 저장·발송 상태, 최근 100건                                                                                                                |
| POST `/admin/jobs`                               | ADMIN 전용. `{kind:"reassess" 또는 "notifications"}`                                                                                                |

사업장 입력 예시:

```json
{
  "nickname": "내 사업장",
  "industry": "CAFE",
  "region": "서울",
  "businessType": "SOLE",
  "startedOn": null,
  "revenueBand": null,
  "pastBusinesses": [],
  "pastBusinessHistoryConfirmed": false,
  "rosterConfirmed": false,
  "confirmedFacts": {}
}
```

industry는 CAFE/RESTAURANT/OTHER, businessType은 SOLE/CORPORATE 또는 null이다. pastBusinesses 항목은 name, industry, startedOn, endedOn, outcome(CLOSED/TRANSFERRED/OTHER), memo이며 값은 nullable이다. 이력을 확인하지 않은 빈 목록은 과거 사업이 없다는 뜻이 아니다. confirmedFacts는 검수 규칙에 필요한 확인된 보험 인원·급여·조건만 받고 현재/예정 인원이나 채용 계획은 받지 않는다. 정확한 허용 필드는 `src/domain/workspace.ts`가 계약이다.

반복 서류 입력은 title, anchorDate, frequency(WEEKLY/MONTHLY/YEARLY), leadDays(0~30), url(HTTPS 또는 null), memo(null 가능), enabled다. 직원 employmentType은 REGULAR/PART_TIME/DAILY/OTHER 또는 null이다. 임의 불리언을 null 대신 false로 채우지 않는다.

## 외부 API와 스티비 이메일

Bivia와 채널톡은 사용하지 않는다. 키는 기본 공란이고 외부 연동은 꺼져 있다. 로컬 검증은 실제 이메일이나 고객 문서를 외부로 보내지 않는다.

| 연동   | 구현                                                                    | 실제 사용에 필요한 설정                                                                                                                          |
| ------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Liner  | 공식 근거 검색·미검수 규칙 초안·계약서 정보 추출                        | LIVE_INTEGRATIONS_ENABLED=true, CONTRACT_SCAN_ENABLED=true, LINER_API_KEY, LINER_CONTRACT_MODEL(이미지), LINER_CONTRACT_PDF_MODEL(PDF 지원 모델) |
| 스티비 | 신규 혜택·프로젝트 D-7/D-3·3일 이내 임박 일정·반복 서류를 이메일로 안내 | EMAIL_TRANSPORT=stibee, LIVE_INTEGRATIONS_ENABLED=true, STIBEE_API_KEY, STIBEE_AUTO_EMAIL_URL                                                    |

수신 주소는 로그인 계정의 users.email이고 프로필의 emailAlerts가 true일 때만 예약·발송한다. phone은 일반 연락처로 남지만 이메일 발송에는 필요하지 않다. emailAlerts는 확정 프로필 저장으로 설정하며 초기 단계 임시 저장만으로는 동의하지 않는다. 새로운 요청에서 alimtalkAlerts는 허용하지 않는다.

스티비의 실행 중인 자동 이메일에서 ‘API로 요청하기’ 트리거 URL을 STIBEE_AUTO_EMAIL_URL에 설정한다. 해당 주소록에 수신자가 미리 등록되어 있어야 한다. 구독자 자동 등록은 하지 않는다. 사용자 정의 필드 task_title, plan_url을 만들고 제목·본문에는 `$%task_title%$`, 신청/관리 링크에는 `$%plan_url%$`을 사용한다. 제공자 접수(HTTP 200)는 실제 수신 성공과 다르다. 주소록에 없거나 수신 거부한 구독자는 발송되지 않을 수 있다. 합성 데모 사용자에게 외부 발송을 하지 않는다.

공식 자동 이메일 API의 제한은 초당 3회다. 작업 내부는 요청 간 500ms 간격을 두며 같은 API 키를 쓰는 운영 발송 작업은 한 워커로 직렬 실행한다. 여러 작업/인스턴스에서 함께 발송하려면 계정 단위 공유 속도 제한을 추가해야 한다.

기준 문서: [Liner Chat Completions](https://liner.com/developers/docs/liner-model-api-chat-completions), [스티비 자동 이메일 API](https://help.stibee.com/email/automation/api), [스티비 API](https://developers.stibee.com/). 모델별 입력 지원, 스티비 주소록·템플릿·계정 권한은 실제 계정에서 확인해야 한다.

## 작업 실행과 안전한 보존

새 혜택은 사업장 재진단 때 이전 평가와 비교해 예약한다. 승인된 규칙 변경·날짜 변경·다가올 서류 회차 반영을 위해 재진단 작업을 주기적으로 실행하고, 발송 작업을 별도로 실행한다. 서버가 자동 Cron을 설치하지는 않는다.

```powershell
# 로컬 PGlite에서는 먼저 주 앱을 끈다.
npm run setup
npm run jobs:workspace -- reassess
npm run jobs:workspace -- notifications
```

서버가 실행 중인 로컬 환경에서는 ADMIN 세션으로 `/api/v2/admin/jobs`를 호출한다. 운영 Cron과 앱을 함께 쓰려면 PostgreSQL의 MAWD_DATABASE_URL을 설정한다. 호스트의 일반 DATABASE_URL은 사용하지 않는다.

이메일 예약은 리소스·기한 버전으로 중복을 막는다. 완료·기한 변경·수신 동의 해제 때 미발송 예약을 취소하고, 발송 직전 상태를 다시 확인한다. 재동의 시 미완료 일정만 다시 예약한다. UNKNOWN(결과 불명)은 자동 재발송하지 않는다. 로컬 보관도 발송 완료로 표시하지 않고 LOCAL_ONLY로 구분한다. 스티비 접수는 ACCEPTED_BY_PROVIDER이며 실제 수신 확인은 아니다.

스키마는 `0003_workspace.sql`, 이메일 전용 전환은 새 `0004_email_only.sql`이다. 기존 마이그레이션은 수정하지 않았다. 새 마이그레이션은 알림톡 PENDING/CLAIMED 예약을 취소하고 프로필·임시 저장의 alimtalkAlerts를 제거한다. 이메일 동의를 자동으로 켜거나 취소한 알림톡을 이메일로 재발송하지 않는다. 이전 처리 이력과 연결정보 테이블은 보존하되 실행 코드와 API에서 접근하지 않는다. 평가 입력과 규칙 스냅샷은 UPDATE/DELETE 방지 트리거로 보존한다. 평가에는 이름·전화·계약서 원문을 넣지 않고 나이·현재 인원 등 판단에 필요한 정규화 사실만 남긴다. 사업 사실과 제안 채용은 별개다. 계약서 원문은 운영에서 CONTRACT_ENCRYPTION_KEY(64자리 hex)가 없으면 저장하지 않으며 AES-256-GCM으로 암호화한다. 로컬에서는 키 없이 합성 파일로 시험할 수 있다. DB의 직원 상세 필드는 접근 제어 대상이며 별도 필드 암호화는 하지 않는다.

## 검증과 출시 전 남은 확인

```powershell
npm run check
npm run build
# 빌드한 앱 실행 중, 다른 터미널에서
npm run smoke
npm run smoke:workspace
```

추가 테스트는 직원 소유권·스캔 확정·퇴사 삭제·불변 스냅샷·현재 혜택·운영 데모 차단·완료/해제·반복 월말·알림 중복/취소/재동의·UNKNOWN 보존·ADMIN 권한·스티비 모의 전송/중복 방지·알림 채널 전환 마이그레이션·Liner 응답 검증을 확인한다. HTTP 스모크는 합성 사용자·합성 파일만 사용한다. 실제 지원 조건은 테스트로 생성하거나 승인하지 않는다. 새 현재 정보용 데모 규칙은 명시적으로 가상이며 운영에서 거부된다.

2026-11-15 최종 결과: `npm run check`의 타입 검사와 11개 파일·76개 테스트, `npm run build`, 실행 중인 앱에 대한 `npm run smoke`와 `npm run smoke:workspace`가 모두 통과했다. 스티비 전송은 모의 응답으로 수신 계정·템플릿 치환·접수 상태·중복 방지를 검증했다. HTTP에서는 전화번호 없는 이메일 동의·기존 알림톡 입력 거부·EMAIL 전용 예약·삭제한 채널톡 경로의 404 응답을 확인했다.

HTTP 검증은 별도의 무시된 `data/backend-v2-smoke` DB와 합성 사용자·파일로 실행했고 검증 서버는 종료했다. 기존 로컬 DB에는 직접 마이그레이션하지 않았다. 기존 DB에 적용할 때는 서버를 끄고 `npm run setup`을 실행한다. 실제 외부 API 호출·이메일 발송·PostgreSQL 운영 부하 검증은 실행하지 않았다.

출시 전에 남은 게이트:

- 실제 지원사업 원문·모집 기간·신청 단계·주기 구분을 운영자가 검수하고 승인해야 한다. 지금 포함된 기준은 가상 데모이며 실제 수급 판정이 아니다.
- 실제 키로 Liner 모델별 PDF/이미지 입력과 스티비 주소록·템플릿·수신을 비공개 테스트 환경에서 확인해야 한다. 계정 이메일 인증·변경과 구독 취소/반송 동기화는 운영 전 추가 확인이 필요하다.
- API 키·계약서 암호화 키의 보관/교체, DB·백업 접근 제어, 계약서 외부 전송 고지·동의 및 백업 삭제/보존 정책을 운영 환경에 적용해야 한다. 퇴사는 현재 DB의 원문과 상세를 삭제하지만 기존 백업과 외부 처리자의 보관본까지 지우는 기능은 포함하지 않는다.
- 채널톡과 Nest/reflect-metadata/rxjs 의존성을 제거해 기존 SDK 보안 경고도 제거했다. npm 설치 검사 결과 취약점은 0건이다.
- 새 프론트엔드 구현은 이번 변경 범위가 아니다. 기존 화면에서는 채널톡 상담 버튼·관리자 카드를 제거했다. 4단계 PC 입력 화면·내비게이션·이름 버튼·토글·경고 모달·취소선·진행 게이지를 위 API와 연결해야 한다.

## Liner·스티비 추가 활용

공고 탐색·원문 변경 검수, 주소록/수신 거부 동기화, 주간 미완료 업무 요약을 추가했다. EXAONE과 Alt는 제외했다. [추가 API·환경 설정·작업 실행·실연동 검증 게이트](CONNECTED-WORKFLOWS.md)를 참고한다.

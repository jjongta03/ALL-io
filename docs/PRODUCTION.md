# 실제 서비스 전환

현재 결과는 로컬 개발용 가상 규칙이다. 이 문서는 운영 전환에 필요한 설정과 검증 지점을 정리하며, 클라우드 자원은 생성하지 않았다.

## 1. 최신 요구사항 다시 확인

Miro는 이번 세션에서 비공개 로그인 화면 때문에 최신 내용을 읽지 못했다. 실제 배포 전에 `docs/MIRO-2026-11-14.md`와 최신 보드를 비교하고 범위를 확정한다. 원래 상세설계와 달리, 현재 실행 가능한 규칙은 실제 두루누리 판정이 아닌 가상 구조 예시다.

## 2. 새 PostgreSQL과 환경

운영용 DB를 명확하게 지정하고 로컬 데모 DB를 운영 DB로 올리지 않는다.

```dotenv
APP_ENV=production
APP_MODE=live
APP_URL=https://your-service.example
MAWD_DATABASE_URL=postgres://YOUR_PROVISIONED_DATABASE
EMAIL_TRANSPORT=local
LIVE_INTEGRATIONS_ENABLED=false
SOURCE_COLLECTION_ENABLED=false
DRAFT_GENERATION_ENABLED=false
NEXT_TELEMETRY_DISABLED=1
```

- `APP_URL`은 실제 HTTPS 도메인과 일치해야 한다. 이 값은 CSRF·이메일 링크의 기준이다.
- 운영 설정은 데모 모드, PostgreSQL 미설정, HTTP 주소를 거절한다.
- DB의 `is_demo` 세션과 가상 규칙은 운영 판정에 사용할 수 없다.
- `MAWD_DATABASE_URL`을 사용한다. 다른 프로젝트의 호스트 `DATABASE_URL`을 재사용하지 않는다.
- DB 공급자의 TLS·백업·접속 제한은 해당 서비스 권장 방식으로 설정한다. 인증서 검증을 임의로 끄지 않는다.

## 3. 마이그레이션과 계정

```powershell
npm ci
npm run db:migrate
npm run user:create -- operator@example.com ADMIN
npm run user:create -- owner@example.com OWNER
npm run build
npm run start:host
```

CLI는 무작위 초기 비밀번호를 Git에서 제외된 `data/account-UUID.txt`에만 기록한다. 파일에는 로그인 정보가 있으므로 공개하지 않는다. 외부 배포 환경에서 계정 생성은 운영 콘솔·명령 실행 환경에 맞게 수행한다. 공개 회원가입, 이메일 인증, 비밀번호 재설정, MFA는 이번 기반에서 구현하지 않았다. 실제 고객 파일럿 전 계정 수명주기를 보완하거나 관리형 인증으로 교체한다.

## 4. 실제 제도 규칙 검수

1. 제도명·담당 기관·적용연도·적용기간·기준일을 기록한다.
2. 보험별 사업장 규모·인원 산정 방식과 적용 시점을 확인한다.
3. 보수·가입 이력·제외 요건·과거 지원기간·예외가 입력 스키마에 표현되는지 확인한다.
4. 고용보험과 국민연금은 별도 규칙과 별도 사실 값을 사용한다.
5. 조건을 표현할 수 없으면 스키마와 테스트를 확장한다. ‘대체로 해당’으로 통과시키지 않는다.
6. 서류별 준비·발급·제출 경로와 기한 근거를 확인한다.
7. 실제 규칙의 모든 출처를 검토하고 `verified`를 표시한다. 허용된 공식 HTTPS 도메인과 근거 구간이 있어야 승인할 수 있다.
8. 기준값 T-1/T/T+1, 누락 정보, 적용기간 경계, 제외 사유, 보험별 차이를 테스트한다.
9. 검수 대기함에서 승인하고 결과·할 일·알림 영향을 확인한다.

금전 효과 계산은 아직 구현하지 않았다. 실제 비율·상한·대상 부담분·기간·반올림을 검증하기 전 지원액이나 채용의 순이익을 표시하지 않는다. 현재 인원 4→5만으로 노동법 적용을 확정하지 않는다.

## 5. 외부 서비스 연결

### Liner

`.env` 또는 배포 서비스의 비밀 설정에 `LINER_API_KEY`를 넣고 `LIVE_INTEGRATIONS_ENABLED=true`로 설정한다. 검색은 `include_knowledge:false`로 요청한다. 검색 결과는 후보이며 공식 근거의 검수 완료를 뜻하지 않는다. [공식 Search API](https://liner.com/developers/docs/search-api)

AI 초안 제안은 추가로 `DRAFT_GENERATION_ENABLED=true`와 계정에서 허용된 `LINER_DRAFT_MODEL`을 명시해야 한다. 모델명·요금·권한은 계정에서 확인한다. 요청은 저장된 공식 원문 일부만 포함하고 사업장·직원 입력은 보내지 않는다. 원문과 일치하는 근거 문장이 없거나 스키마가 맞지 않으면 제안을 거절한다. 반환값은 자동 저장·승인·게시하지 않는다. [Chat Completions API](https://liner.com/developers/docs/liner-model-api-chat-completions)

### 스티비

`EMAIL_TRANSPORT=stibee`, `LIVE_INTEGRATIONS_ENABLED=true`, `STIBEE_API_KEY`, `STIBEE_AUTO_EMAIL_URL`을 설정한다.

- 자동 이메일 템플릿을 생성하고 실행 중 상태로 둔다.
- 해당 주소록에 실제 수신자가 있어야 하며 수신 중지 상태도 확인한다.
- 사용자 정의 필드 `task_title`, `plan_url`을 템플릿에 준비한다.
- 현재 앱은 스티비 주소록 구독자를 자동 등록하지 않는다. 계정별 연동·구독 동기화는 추가 작업이다.
- 실제 발송은 본인이 동의한 테스트 주소 한 건으로 먼저 검증한다.
- HTTP 200은 제공자 접수로만 기록한다. 실제 발송 결과는 스티비 기록에서 확인한다.
- 타임아웃·서버 오류 후 상태 불명확은 UNKNOWN으로 남기고 자동 재발송하지 않는다.
- 현재 앱은 제공자 전달·반송 웹훅과 주소록 수신 거부 동기화를 구현하지 않았다. 실제 운영 전 추가한다.

[스티비 자동 이메일 API](https://help.stibee.com/email/automation/api)

### 국세청

`NTS_API_KEY`와 외부 연동 설정이 필요하다. 사업자 상태조회 어댑터는 요청·응답 경계를 준비한 상태이며 실제 키로 호출하지 않았다. 현행 공식 Swagger·개발계정 권한·키 인코딩·오류 응답과 성공 응답을 확인한다. 업종·매출·직원 수·사용자 소유권 확인 기능으로 확장 해석하지 않는다. [공식 서비스 안내](https://www.data.go.kr/data/15081808/openapi.do)

### 알림 채널

2026-11-15 요청에 따라 스티비 이메일로 통일하고 채널톡 SDK·앱·연결 API·환경 설정은 제거했다. v2 프로필의 emailAlerts에 동의한 사용자의 계정 이메일로 신규 혜택·프로젝트·반복 서류를 안내한다. 기존 알림톡 동의를 이메일 동의로 전환하지 않는다. 상세 설정과 마이그레이션은 [BACKEND-V2.md](BACKEND-V2.md)를 참고한다.

## 6. 정기 작업

- 알림: `npm run jobs:run -- notifications`
- 공식 원문 수집: `npm run jobs:run -- collect`
- Render Cron은 UTC이다. 한국시간 오전 9시 일일 실행은 `0 0 * * *`이다. [Render Cron](https://render.com/docs/cronjobs)
- `render.yaml`은 웹과 알림 Cron 설정의 템플릿이다. APP_URL·MAWD_DATABASE_URL·메일 설정을 양쪽에 동일하게 지정한다.
- PostgreSQL에서는 웹과 Cron을 별도 프로세스로 실행한다. 로컬 PGlite를 두 프로세스가 공유하지 않는다.
- 수집기는 정확한 공식 호스트만 허용하고 리디렉션을 따르지 않는다. HTML·텍스트 1MB까지 지원한다. PDF·다른 인코딩·동적 페이지는 수동 검수한다.
- 수집에서 감지한 원문 변경은 별도 기록이다. 실제 제도 규칙 변경으로 자동 간주하지 않는다.

## 7. 확장 전 남은 엔지니어링

- 운영 DB 공급자의 실제 환경에서 마이그레이션·트랜잭션·경쟁 요청·백업 복구 검증.
- 계정 이메일 인증, 비밀번호 재설정 또는 관리형 인증 도입.
- 계정별 로그인 제한은 DB에 저장한다. PostgreSQL 동시 요청과 프록시/게이트웨이의 전체 트래픽 제한을 검증한다. [로그인 구현·검증](AUTHENTICATION.md)을 참고한다.
- 동일 계획 입력을 두 탭에서 편집하는 경우 revision 기반 낙관적 잠금 추가.
- 규칙 승인 후 영향 재평가를 현재의 소규모 동기 트랜잭션에서 작업 큐로 분리.
- 제도별 중요 변경·신고 오류의 정정 메일 내용과 대응 절차.
- 법정 마감과 사용자 준비 목표일의 계산 확장. 현재 자동 예약은 준비 목표일만 사용.
- 실제 고객 데이터 보관·삭제·내보내기·탈퇴 절차와 운영 모니터링.
- Docker/Render 템플릿 실제 실행·권한·비용·계정 조건 확인.

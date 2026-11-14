# 현재 구현한 API 계약

요청·응답·권한·상태 변경·예외를 정리한 전체 문서는 [API 명세서](API-명세서.md)를 참고한다. 사업장 정보는 확장될 수 있으나 추가 필드는 아직 확정하지 않았다.

모든 응답은 JSON이다. 변경 요청은 `Origin`이 `APP_URL`의 Origin과 일치해야 한다. 본문이 있는 요청은 `Content-Type: application/json`이다. 세션은 HttpOnly 쿠키로 전달한다. 서버는 사용자 소유권과 ADMIN 권한을 별도로 검사한다.

## 인증·사용자

| Method | 경로           | 용도                           |
| ------ | -------------- | ------------------------------ |
| GET    | `/api/health`  | DB 연결 확인, 앱 모드          |
| POST   | `/api/demo`    | 로컬 데모 세션 발급. 운영 불가 |
| POST   | `/api/session` | `{email,password}` 로그인      |
| DELETE | `/api/session` | 세션 폐기                      |
| GET    | `/api/me`      | 내 사용자 조회                 |

새 계정은 공개 가입 대신 `user:create` CLI로 사전 발급한다. 초기 비밀번호는 Git에서 제외된 파일에 생성되며 CLI 로그에 출력하지 않는다.

## 계획·할 일

| Method | 경로                       | 입력                                  |
| ------ | -------------------------- | ------------------------------------- |
| GET    | `/api/plans`               | 내 계획 목록                          |
| POST   | `/api/plans`               | `{business,hire}`                     |
| GET    | `/api/plans/:id`           | 내 계획·최신 판정·할 일               |
| PATCH  | `/api/plans/:id`           | 전체 hire 입력, null 허용             |
| PUT    | `/api/plans/:id/alerts`    | `{enabled: boolean}`                  |
| POST   | `/api/plans/:id/cancel`    | 계획 취소·미발송 예약 중지            |
| POST   | `/api/plans/:id/test-mail` | 로컬 전용 테스트 알림, 알림 동의 필요 |
| PATCH  | `/api/tasks/:id`           | `{done: boolean}`                     |
| POST   | `/api/feedback`            | `{evaluationId,message}`              |
| GET    | `/api/outbox`              | 내 로컬 알림 보관함                   |

### 계획 생성 예시

아래는 합성 데이터이며 실제 제도 기준이 아니다.

```json
{
  "business": {
    "nickname": "다음 카페 · 가상",
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

산정 인원·이력 null은 미확인이다. 실제 제도 규칙은 고용보험과 국민연금을 별도 필드로 판정한다. 데모 공통 필드는 가상 규칙의 동작 확인용이다.

## 운영자

| Method | 경로                               | 용도                                                    |
| ------ | ---------------------------------- | ------------------------------------------------------- |
| GET    | `/api/admin/reviews`               | 규칙 비교·검수 상태                                     |
| POST   | `/api/admin/reviews/:id`           | `{decision: "approve" 또는 "reject", definition?: ...}` |
| POST   | `/api/admin/policies`              | 새 규칙 초안 생성, 자동 게시 없음                       |
| POST   | `/api/admin/policies/:id/suspend`  | 게시 중지·재평가                                        |
| POST   | `/api/admin/policies/:id/rollback` | 이전 승인 버전 활성화·재평가                            |
| GET    | `/api/admin/operations`            | 작업·오류 신고·원문 변경·출처·게시 규칙                 |
| POST   | `/api/admin/search`                | `{query}` Liner 검색. 기본 비활성                       |
| POST   | `/api/admin/sources`               | `{title,url}` 정확한 허용 호스트만 등록                 |
| POST   | `/api/admin/draft`                 | `{snapshotId}` 원문 기반 AI 제안만 반환                 |
| POST   | `/api/admin/jobs`                  | `{kind: "notifications" 또는 "collect"}`                |

신규 초안 입력은 `{title,kind,effectiveFrom,effectiveTo,definition}`이다. `definition`은 `{conditions,explanation,tasks,sources}`이며 정확한 타입은 `src/domain/contracts.ts`에 있다.

조건 연산은 `eq/ne/lt/lte/gt/gte/in/all/any`. 임의 코드·SQL을 규칙으로 입력할 수 없다. 모든 실제 출처가 검수되지 않으면 승인을 거절한다. 출처의 `verified`는 운영자가 원문과 적용기간·대상·예외를 검토한 뒤 표시해야 한다.

## 외부 연동

`POST /api/integrations/nts`: `{number: "숫자10자리"}`를 서버에서 상태조회하고 상태·과세유형·확인시각만 반환한다. 사업자번호는 DB에 저장하지 않는다. 신청자의 소유권을 확인하는 API가 아니다.

외부 호출은 `LIVE_INTEGRATIONS_ENABLED=true`와 필요한 키가 있어야 한다. AI 초안 생성은 별도 `DRAFT_GENERATION_ENABLED=true`, `LINER_DRAFT_MODEL`도 필요하다. 민감한 사업장·직원 입력은 Liner 리서치나 초안 생성 요청에 넣지 않는다.

## 오류

| HTTP    | 의미                                           |
| ------- | ---------------------------------------------- |
| 400     | JSON 해석 실패                                 |
| 401     | 로그인 필요·로그인 불일치                      |
| 403     | Origin 불일치·운영자 권한 없음                 |
| 404     | 자원 없음 또는 다른 사용자 소유                |
| 409     | 취소한 계획 변경·검수 버전 충돌·복귀 버전 없음 |
| 413/415 | 요청 크기·본문 형식 제한                       |
| 422     | 타입·날짜·규칙·출처 검증 실패                  |
| 429     | 요청 속도 제한                                 |
| 502/503 | 외부 연동 실패·연동 비활성·키 미설정           |

에러 응답은 `{error,code,fields?}`이다. 키·비밀번호·SQL 내용·원문 사업자번호를 반환하지 않는다.

# 최신 추가 API — 2026-11-14

- `POST /api/plans/:id/simulate`: `{currentHeadcount, monthlyAveragePay, insuranceHeadcount, employmentHeadcount?, pensionHeadcount?}` → `{result,comparison}`. nullable 수치는 모르면 null. 소유권 검사, 저장 상태 변경 없음.
- `POST /api/admin/reviews/:id/assess`: body 없음 → `{assessment}`. ADMIN 전용. 대기 중인 저장 초안만 분류하며 게시하지 않음.
- `POST /api/support`: `{planId, command, message?}`. command는 `/혜택조회`, `/서류안내`, `/오류신고`, `/질문`. 소유 계획만 허용. 질문·신고 5~2000자. 응답 `{answer,escalated}`.
- `GET /api/admin/integrations`: ADMIN 전용, 설정 존재 여부·활성·호출 결과 집계. 비밀 값 반환 없음.

외부 API의 사용 위치·설정·실제 호출 여부는 [API-USAGE.md](API-USAGE.md)를 확인한다.

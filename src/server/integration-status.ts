import { randomUUID } from "node:crypto";
import type { Sql } from "./db";
import { AppError } from "./errors";
import { getConfig } from "./config";

export async function trackIntegration<T>(
  sql: Sql,
  provider: string,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  let result: T;
  try {
    result = await fn();
  } catch (e) {
    const disabled = e instanceof AppError && e.status === 503;
    await sql.query(
      "INSERT INTO integration_events(id,provider,operation,mode,status,error_code) VALUES($1,$2,$3,$4,$5,$6)",
      [
        randomUUID(),
        provider,
        operation,
        disabled ? "LOCAL" : "LIVE",
        disabled ? "DISABLED" : "FAILED",
        e instanceof AppError ? e.code : "UPSTREAM_ERROR",
      ],
    );
    throw e;
  }
  const failed = result === "FAILED" || result === "UNKNOWN";
  await sql.query(
    "INSERT INTO integration_events(id,provider,operation,mode,status,error_code) VALUES($1,$2,$3,'LIVE',$4,$5)",
    [
      randomUUID(),
      provider,
      operation,
      failed ? "FAILED" : "SUCCESS",
      failed ? `DELIVERY_${result}` : null,
    ],
  );
  return result;
}
export const integrationCatalog = [
  {
    provider: "Liner",
    operation: "search",
    title: "공식 근거 검색",
    where: "운영자 → 수집·작업·신고 → 공식 자료 검색",
    endpoint: "POST /api/admin/search",
    file: "src/integrations/providers.ts · searchOfficialSources",
    required: ["LINER_API_KEY"],
    flag: null,
    note: "허용된 공식 사이트 후보를 찾습니다. 검색 결과를 규칙으로 자동 게시하지 않습니다.",
  },
  {
    provider: "Liner",
    operation: "draft",
    title: "원문 기반 규칙 초안",
    where: "운영자 → 수집한 변경 → AI 초안 제안",
    endpoint: "POST /api/admin/draft",
    file: "src/integrations/drafting.ts · suggest",
    required: ["LINER_API_KEY", "LINER_DRAFT_MODEL"],
    flag: "DRAFT_GENERATION_ENABLED",
    note: "수집 원문과 근거 문구를 대조한 뒤 미검수 초안만 제안합니다.",
  },
  {
    provider: "Liner",
    operation: "decisions",
    title: "Jev 검수 분류",
    where: "운영자 → 규칙 검수 → 변경 분류·우선순위 계산",
    endpoint: "POST /api/admin/reviews/:id/assess",
    file: "src/integrations/decisions.ts · assessWithJev",
    required: ["LINER_API_KEY"],
    flag: "JEV_ENABLED",
    note: "변경 종류·출처 일치 추정·긴급도를 계산합니다. 꺼져 있으면 로컬 비교를 기록하며 승인은 사람이 합니다.",
  },
  {
    provider: "Stibee",
    operation: "send",
    title: "신규 혜택·마감·반복 서류 이메일",
    where: "이메일 수신 동의 → 사업장 재진단·알림 작업",
    endpoint: "POST /api/v2/admin/jobs (notifications) · /api/admin/jobs",
    file: "src/integrations/providers.ts · sendStibee / src/server/workspace-notifications.ts / src/server/jobs.ts",
    required: ["STIBEE_API_KEY", "STIBEE_AUTO_EMAIL_URL"],
    flag: null,
    note: "신규 혜택·프로젝트 D-7/D-3·임박 일정·반복 서류를 이메일로 안내합니다. EMAIL_TRANSPORT=stibee가 필요합니다. 로컬은 보관함에 저장합니다. 수신자는 스티비 주소록에 미리 등록되어야 합니다.",
  },
  {
    provider: "NTS",
    operation: "status",
    title: "사업자 상태 확인",
    where: "새 계획 → 사업자 상태 조회",
    endpoint: "POST /api/integrations/nts",
    file: "src/integrations/providers.ts · checkBusinessStatus",
    required: ["NTS_API_KEY"],
    flag: null,
    note: "계속·휴폐업 상태와 과세유형을 참고합니다. 사업자 본인 인증이나 지원 자격 판정에 사용하지 않습니다.",
  },
] as const;
export async function integrationStatus(sql: Sql) {
  const live = getConfig().liveIntegrations;
  const events = await sql.query<{
    provider: string;
    operation: string;
    mode: string;
    status: string;
    count: number;
  }>(
    "SELECT provider,operation,mode,status,count(*)::int AS count FROM integration_events GROUP BY provider,operation,mode,status",
  );
  return {
    live,
    items: integrationCatalog.map((item) => ({
      ...item,
      configured: item.required.every((key) => Boolean(process.env[key])),
      enabled:
        live &&
        (!item.flag || process.env[item.flag] === "true") &&
        (item.provider !== "Stibee" || getConfig().emailTransport === "stibee"),
      events: events.filter((e) => e.provider === item.provider && e.operation === item.operation),
    })),
  };
}

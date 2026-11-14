import "./env";
import assert from "node:assert/strict";
import { addDays, seoulDate } from "../src/domain/dates";
import { getConfig } from "../src/server/config";

async function main() {
  const config = getConfig();
  if (!config.demo || config.production || config.liveIntegrations)
    throw new Error("스모크 테스트는 외부 연동이 꺼진 로컬 데모에서만 실행합니다.");
  const origin = new URL(config.appUrl).origin;
  const request = async (
    path: string,
    options: { method?: string; body?: unknown; cookie?: string; origin?: string | null } = {},
  ) => {
    const response = await fetch(`${origin}/api/${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.origin === null ? {} : { Origin: options.origin ?? origin }),
        ...(options.cookie ? { Cookie: options.cookie } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    return { response, body: await response.json() };
  };
  assert.equal((await request("health")).response.status, 200);
  assert.equal((await request("plans")).response.status, 401);
  assert.equal(
    (await request("demo", { method: "POST", origin: "https://untrusted.invalid" })).response
      .status,
    403,
  );
  const login = await request("demo", { method: "POST" });
  assert.equal(login.response.status, 200);
  const cookie = login.response.headers.get("set-cookie")!.split(";")[0];
  const business = {
    nickname: "HTTP 스모크 · 합성 카페",
    industry: "CAFE",
    region: "경기 안산",
    businessType: "SOLE",
    currentHeadcount: 4,
    existingBenefit: "UNKNOWN",
  };
  const hire = {
    startDate: addDays(seoulDate(), 15),
    employmentType: "REGULAR",
    monthlyAveragePay: 2450000,
    insuranceHeadcount: 5,
    historyRequirementMet: true,
    exclusionClear: true,
    durationRemaining: true,
    hoursRequirementMet: true,
    coverageConfirmed: true,
    laborCountConfirmed: null,
  };
  assert.equal(
    (
      await request("plans", {
        method: "POST",
        cookie,
        body: { business: { ...business, currentHeadcount: -1 }, hire },
      })
    ).response.status,
    422,
  );
  const created = await request("plans", { method: "POST", cookie, body: { business, hire } });
  assert.equal(created.response.status, 200);
  const id = created.body.id;
  const detail = await request(`plans/${id}`, { cookie });
  assert.equal(detail.body.evaluation.result.gains[0].status, "MATCH");
  assert.ok(detail.body.tasks.length > 0);
  const renderedPlan = await fetch(`${origin}/plans/${id}`, { headers: { Cookie: cookie } });
  assert.equal(renderedPlan.status, 200);
  assert.ok((await renderedPlan.text()).includes("HTTP 스모크"));
  const simulated = await request(`plans/${id}/simulate`, {
    method: "POST",
    cookie,
    body: { currentHeadcount: 5, monthlyAveragePay: 2500000, insuranceHeadcount: 5 },
  });
  assert.equal(simulated.response.status, 200);
  assert.equal(simulated.body.result.gains[0].status, "NO_MATCH");
  assert.equal((await request(`plans/${id}`, { cookie })).body.plan.input_revision, 1);
  const help = await request("support", {
    method: "POST",
    cookie,
    body: { planId: id, command: "/서류안내" },
  });
  assert.equal(help.response.status, 200);
  assert.equal(help.body.escalated, false);
  const apiMap = await request("admin/integrations", { cookie });
  assert.equal(apiMap.response.status, 200);
  assert.equal(apiMap.body.live, false);
  const reviews = (await request("admin/reviews", { cookie })).body.reviews;
  const pending = reviews.find((r: { status: string }) => r.status === "PENDING");
  if (pending) {
    const classified = await request(`admin/reviews/${pending.id}/assess`, {
      method: "POST",
      cookie,
    });
    assert.equal(classified.response.status, 200);
    assert.equal(classified.body.assessment.method, "LOCAL_RULES");
    assert.equal(classified.body.assessment.requiresHumanApproval, true);
  }
  const renderedIntegrations = await fetch(`${origin}/admin/integrations`, {
    headers: { Cookie: cookie },
  });
  assert.equal(renderedIntegrations.status, 200);
  assert.ok((await renderedIntegrations.text()).includes("API MAP"));
  const renderedAdmin = await fetch(`${origin}/admin`, { headers: { Cookie: cookie } });
  assert.equal(renderedAdmin.status, 200);
  assert.ok((await renderedAdmin.text()).includes("규칙 검수"));
  const other = await request("demo", { method: "POST" });
  const otherCookie = other.response.headers.get("set-cookie")!.split(";")[0];
  assert.equal((await request(`plans/${id}`, { cookie: otherCookie })).response.status, 404);
  assert.equal(
    (
      await request(`plans/${id}/simulate`, {
        method: "POST",
        cookie: otherCookie,
        body: { currentHeadcount: 4, monthlyAveragePay: null, insuranceHeadcount: null },
      })
    ).response.status,
    404,
  );
  assert.equal(
    (
      await request("support", {
        method: "POST",
        cookie: otherCookie,
        body: { planId: id, command: "/혜택조회" },
      })
    ).response.status,
    404,
  );
  assert.equal(
    (await request(`plans/${id}/alerts`, { method: "PUT", cookie, body: { enabled: true } }))
      .response.status,
    200,
  );
  assert.equal(
    (await request(`plans/${id}/test-mail`, { method: "POST", cookie })).response.status,
    200,
  );
  assert.equal((await request("outbox", { cookie })).body.mail.length, 1);
  const taskId = detail.body.tasks[0].id;
  assert.equal(
    (await request(`tasks/${taskId}`, { method: "PATCH", cookie, body: { done: true } })).response
      .status,
    200,
  );
  assert.equal(
    (
      await request(`tasks/${taskId}`, {
        method: "PATCH",
        cookie: otherCookie,
        body: { done: true },
      })
    ).response.status,
    404,
  );
  const feedback = await request("feedback", {
    method: "POST",
    cookie,
    body: { evaluationId: detail.body.evaluation.id, message: "스모크 테스트 오류 신고 연결 확인" },
  });
  assert.equal(feedback.response.status, 200);
  assert.equal((await request("admin/reviews", { cookie })).response.status, 200);
  assert.equal(
    (await request("integrations/nts", { method: "POST", cookie, body: { number: "0000000000" } }))
      .response.status,
    503,
  );
  assert.equal(
    (await request(`plans/${id}/cancel`, { method: "POST", cookie })).response.status,
    200,
  );
  assert.equal(
    (await request(`plans/${id}/alerts`, { method: "PUT", cookie, body: { enabled: true } }))
      .response.status,
    409,
  );
  assert.equal((await request("session", { method: "DELETE", cookie })).response.status, 200);
  assert.equal((await request("plans", { cookie })).response.status, 401);
  console.log(
    "HTTP 스모크 통과: 인증·CSRF·입력 검증·격리·판정·시뮬레이터·FAQ·검수 분류·API 현황·할 일·알림·오류 신고·연동 비활성·계획 취소·로그아웃",
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "HTTP 검증 실패");
  process.exitCode = 1;
});

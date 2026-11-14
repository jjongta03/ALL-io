import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase, business, hire } from "./helpers";
import type { Database } from "../src/server/db";
import { assessReview } from "../src/server/review-assessment";
import { createPlan, listReviews, planDetail, setAlerts } from "../src/server/service";
import { supportAnswer } from "../src/server/support";
import { integrationStatus } from "../src/server/integration-status";
let db: Database, owner: string, other: string;
beforeAll(async () => {
  ({ db, owner, other } = await testDatabase());
}, 30000);
afterAll(async () => {
  if (db) await db.close();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
test("로컬 분류는 결과를 기록하지만 승인·게시하지 않는다", async () => {
  vi.stubEnv("LIVE_INTEGRATIONS_ENABLED", "false");
  const spy = vi.fn();
  vi.stubGlobal("fetch", spy);
  const review = (await listReviews(db)).find((r) => r.status === "PENDING")!;
  const assessment = await assessReview(db, review.id, owner);
  expect(assessment.method).toBe("LOCAL_RULES");
  expect(assessment.requiresHumanApproval).toBe(true);
  const saved = (await listReviews(db)).find((r) => r.id === review.id)!;
  expect(saved.status).toBe("PENDING");
  expect(saved.assessment?.method).toBe("LOCAL_RULES");
  expect(spy).not.toHaveBeenCalled();
  const status = await integrationStatus(db);
  expect(status.items.find((i) => i.operation === "decisions")?.events).toContainEqual(
    expect.objectContaining({ mode: "LOCAL", status: "DISABLED", count: 1 }),
  );
});
test("Jev 429 실패도 분류 이력을 남기고 수동 검수를 유지한다", async () => {
  vi.stubEnv("LIVE_INTEGRATIONS_ENABLED", "true");
  vi.stubEnv("JEV_ENABLED", "true");
  vi.stubEnv("LINER_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));
  const review = (await listReviews(db)).find((r) => r.status === "PENDING")!;
  const assessment = await assessReview(db, review.id, owner);
  expect(assessment).toMatchObject({
    method: "LOCAL_RULES",
    errorCode: "UPSTREAM_RATE_LIMIT",
    requiresHumanApproval: true,
  });
  expect((await listReviews(db)).find((r) => r.id === review.id)?.status).toBe("PENDING");
});
test("FAQ는 소유한 계획의 결과를 사용하고 미답변 질문은 운영 검수로 접수한다", async () => {
  const id = await createPlan(db, owner, business, hire);
  expect(
    (await supportAnswer(db, owner, { planId: id, command: "/혜택조회", message: "" })).answer,
  ).toContain("조건 부합");
  await expect(
    supportAnswer(db, other, { planId: id, command: "/서류안내", message: "" }),
  ).rejects.toMatchObject({ status: 404 });
  const response = await supportAnswer(db, owner, {
    planId: id,
    command: "/질문",
    message: "기존 근로자의 이력은 어떻게 확인하나요?",
  });
  expect(response.escalated).toBe(true);
  const feedback = await db.query<{ message: string }>(
    "SELECT message FROM feedback WHERE owner_id=$1",
    [owner],
  );
  expect(feedback.some((f) => f.message.includes("미답변 질문"))).toBe(true);
});
test("이전 D-1 예약을 취소하고 D-7·D-3만 유지한다", async () => {
  const id = await createPlan(db, owner, business, hire);
  const task = (await planDetail(db, id, owner)).tasks.find((t) => t.deadline_date)!;
  await db.query(
    "INSERT INTO notification_jobs(id,plan_id,task_id,type,dedupe_key,deadline_version,scheduled_at,payload) VALUES($1,$2,$3,'D-1',$4,$5,'2027-03-01','{}')",
    [randomUUID(), id, task.id, `legacy:${task.id}:D-1`, task.deadline_version],
  );
  await setAlerts(db, id, owner, true);
  const jobs = await db.query<{ type: string; status: string }>(
    "SELECT type,status FROM notification_jobs WHERE plan_id=$1",
    [id],
  );
  expect(jobs.find((j) => j.type === "D-1")?.status).toBe("CANCELLED");
  expect(
    jobs.filter((j) => j.status === "PENDING").every((j) => ["D-7", "D-3"].includes(j.type)),
  ).toBe(true);
  expect(jobs.some((j) => j.type === "D-3" && j.status === "PENDING")).toBe(true);
});

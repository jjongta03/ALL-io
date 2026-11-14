import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { business, hire, testDatabase } from "./helpers";
import {
  createPlan,
  ownPlan,
  planDetail,
  setTaskStatus,
  setAlerts,
  cancelPlan,
  updatePlan,
  decideReview,
  changePublication,
  listReviews,
  type EvaluationRow,
} from "../src/server/service";
import { dispatchNotifications, queueDemoMail } from "../src/server/jobs";
import { migrate, type Database } from "../src/server/db";

let db: Database, owner: string, other: string;
beforeAll(async () => {
  ({ db, owner, other } = await testDatabase());
}, 30000);
afterAll(async () => {
  if (db) await db.close();
});
describe("저장·검수·알림 통합", () => {
  test("마이그레이션과 시드가 정상 적용된다", async () => {
    expect((await listReviews(db)).filter((r) => r.status === "PENDING")).toHaveLength(1);
  });
  test("적용한 마이그레이션은 재실행 시 중복 적용하지 않는다", async () => {
    await migrate(db);
    expect(await db.query("SELECT name FROM schema_migrations")).toHaveLength(4);
  });
  test("다른 사용자 자원은 조회·수정할 수 없다", async () => {
    const id = await createPlan(db, owner, business, hire);
    await expect(ownPlan(db, id, other)).rejects.toMatchObject({ status: 404 });
    const detail = await planDetail(db, id, owner);
    await expect(setTaskStatus(db, detail.tasks[0].id, other, true)).rejects.toMatchObject({
      status: 404,
    });
  });
  test("완료·알림 해제·계획 취소가 예약을 취소한다", async () => {
    const id = await createPlan(db, owner, business, hire);
    await setAlerts(db, id, owner, true);
    const detail = await planDetail(db, id, owner);
    const task = detail.tasks.find((t) => t.deadline_date)!;
    expect(
      (
        await db.query("SELECT id FROM notification_jobs WHERE task_id=$1 AND status='PENDING'", [
          task.id,
        ])
      ).length,
    ).toBeGreaterThan(0);
    await setTaskStatus(db, task.id, owner, true);
    expect(
      await db.query("SELECT id FROM notification_jobs WHERE task_id=$1 AND status='PENDING'", [
        task.id,
      ]),
    ).toHaveLength(0);
    await setAlerts(db, id, owner, false);
    expect(
      await db.query("SELECT id FROM notification_jobs WHERE plan_id=$1 AND status='PENDING'", [
        id,
      ]),
    ).toHaveLength(0);
    await cancelPlan(db, id, owner);
    await expect(setAlerts(db, id, owner, true)).rejects.toMatchObject({ status: 409 });
  });
  test("같은 일정을 재설정해도 중복 예약하지 않는다", async () => {
    const id = await createPlan(db, owner, business, hire);
    await setAlerts(db, id, owner, true);
    const a = await db.query("SELECT id FROM notification_jobs WHERE plan_id=$1", [id]);
    await setAlerts(db, id, owner, true);
    const b = await db.query("SELECT id FROM notification_jobs WHERE plan_id=$1", [id]);
    expect(b).toHaveLength(a.length);
  });
  test("입사일 변경으로 오래된 마감 예약이 취소되고 완료 상태는 유지된다", async () => {
    const id = await createPlan(db, owner, business, hire);
    await setAlerts(db, id, owner, true);
    const before = await planDetail(db, id, owner);
    const done = before.tasks.find((t) => t.stable_key.includes("contract"))!;
    await setTaskStatus(db, done.id, owner, true);
    await updatePlan(db, id, owner, { ...hire, startDate: "2027-04-20" });
    const after = await planDetail(db, id, owner);
    expect(after.tasks.find((t) => t.id === done.id)?.status).toBe("DONE");
    expect(after.plan.before_snapshot.currentHeadcount).toBe(4);
    expect(after.plan.input_revision).toBe(2);
    expect(
      (
        await db.query<{ input_snapshot: { hire: { startDate: string } } }>(
          "SELECT input_snapshot FROM evaluations WHERE plan_id=$1 ORDER BY created_at ASC",
          [id],
        )
      )[0].input_snapshot.hire.startDate,
    ).toBe(hire.startDate);
  });
  test("로컬 메일은 외부 발송 없이 한 번 보관되고 재실행으로 복제되지 않는다", async () => {
    const id = await createPlan(db, owner, business, hire);
    await setAlerts(db, id, owner, true);
    await queueDemoMail(db, id, owner);
    const before = await db.query(
      "SELECT o.id FROM outbox o JOIN notification_jobs j ON j.id=o.notification_id WHERE j.plan_id=$1",
      [id],
    );
    expect(before).toHaveLength(1);
    await dispatchNotifications(db);
    const after = await db.query(
      "SELECT o.id FROM outbox o JOIN notification_jobs j ON j.id=o.notification_id WHERE j.plan_id=$1",
      [id],
    );
    expect(after).toHaveLength(1);
  });
  test("승인 전후 판정·재평가·충돌·되돌리기", async () => {
    const id = await createPlan(db, owner, business, { ...hire, monthlyAveragePay: 2550000 });
    await setAlerts(db, id, owner, true);
    expect((await planDetail(db, id, owner)).evaluation?.result.gains[0].status).toBe("NO_MATCH");
    const review = (await listReviews(db)).find((r) => r.status === "PENDING")!;
    await decideReview(db, review.id, owner, "approve");
    expect((await planDetail(db, id, owner)).evaluation?.result.gains[0].status).toBe("MATCH");
    expect(
      (
        await db.query(
          "SELECT id FROM notification_jobs WHERE plan_id=$1 AND type='POLICY_CHANGE'",
          [id],
        )
      ).length,
    ).toBeGreaterThan(0);
    await expect(decideReview(db, review.id, owner, "approve")).rejects.toMatchObject({
      status: 409,
    });
    await changePublication(db, review.policy_id, owner, "rollback");
    expect((await planDetail(db, id, owner)).evaluation?.result.gains[0].status).toBe("NO_MATCH");
    await changePublication(db, review.policy_id, owner, "suspend");
    expect((await planDetail(db, id, owner)).evaluation?.result.gains[0].status).toBe(
      "REVIEW_REQUIRED",
    );
  });
  test("중단한 작업은 자동 재발송하지 않고 UNKNOWN으로 남긴다", async () => {
    const id = await createPlan(db, owner, business, hire);
    await setAlerts(db, id, owner, true);
    await db.query(
      "INSERT INTO notification_jobs(id,plan_id,type,dedupe_key,scheduled_at,status,claimed_at,payload) VALUES($1,$2,'DEMO_TEST',$3,now(),'CLAIMED',now()-interval '20 minutes',$4)",
      [
        randomUUID(),
        id,
        randomUUID(),
        JSON.stringify({ title: "interrupted", path: `/plans/${id}` }),
      ],
    );
    await dispatchNotifications(db);
    expect(
      await db.query("SELECT id FROM notification_jobs WHERE plan_id=$1 AND status='UNKNOWN'", [
        id,
      ]),
    ).toHaveLength(1);
  });
});

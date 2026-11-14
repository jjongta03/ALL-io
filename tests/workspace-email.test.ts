import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { testDatabase } from "./helpers";
import type { Database } from "../src/server/db";
import { ownerProfileSchema, workspaceBusinessSchema } from "../src/domain/workspace";
import { addDays, seoulDate } from "../src/domain/dates";
import * as w from "../src/server/workspace";
import {
  dispatchWorkspaceNotifications,
  notificationInbox,
} from "../src/server/workspace-notifications";

let db: Database, owner: string;
beforeAll(async () => {
  ({ db, owner } = await testDatabase());
  // Synthetic account. All provider calls below are mocked before live mode is enabled.
  await db.query("UPDATE users SET email='delivery-test@example.com',is_demo=false WHERE id=$1", [
    owner,
  ]);
}, 30000);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(async () => {
  if (db) await db.close();
});
const profile = { name: null, birthDate: null, phone: null, emailAlerts: true };
async function business() {
  return (
    await w.createBusiness(
      db,
      owner,
      workspaceBusinessSchema.parse({
        nickname: "합성 이메일 테스트",
        industry: null,
        region: null,
        businessType: null,
        startedOn: null,
        revenueBand: null,
        pastBusinesses: [],
        rosterConfirmed: false,
      }),
    )
  ).id;
}

test("스티비 이메일은 계정 주소로 한 번만 요청하고 제공자 접수로 기록한다", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("LIVE_INTEGRATIONS_ENABLED", "true");
  vi.stubEnv("EMAIL_TRANSPORT", "stibee");
  vi.stubEnv("STIBEE_API_KEY", "synthetic-test-key");
  vi.stubEnv("STIBEE_AUTO_EMAIL_URL", "https://stibee.com/api/v1.0/auto/synthetic");
  await w.putProfile(db, owner, profile);
  const bid = await business();
  const d = await w.createDocument(db, bid, owner, {
    title: "합성 마감 <서류>",
    anchorDate: addDays(seoulDate(), 2),
    frequency: "MONTHLY",
    leadDays: 3,
    url: null,
    memo: null,
    enabled: true,
  });
  expect((await dispatchWorkspaceNotifications(db)).accepted).toBe(1);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, options] = fetchMock.mock.calls[0];
  expect(String(url)).toBe("https://stibee.com/api/v1.0/auto/synthetic");
  expect(options.headers.AccessToken).toBe("synthetic-test-key");
  expect(JSON.parse(options.body)).toMatchObject({
    subscriber: "delivery-test@example.com",
    task_title: "합성 마감 &lt;서류&gt;",
  });
  expect(JSON.parse(options.body).plan_url).toContain(`/schedule?document=${d.id}`);
  expect((await notificationInbox(db, bid, owner))[0]).toMatchObject({
    channel: "EMAIL",
    status: "ACCEPTED_BY_PROVIDER",
  });
  await dispatchWorkspaceNotifications(db);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("전화번호 없이 이메일 동의를 저장하고 알림톡 입력은 계약에서 제외한다", async () => {
  expect(ownerProfileSchema.safeParse(profile).success).toBe(true);
  expect(ownerProfileSchema.safeParse({ ...profile, alimtalkAlerts: true }).success).toBe(false);
  await w.putProfile(db, owner, { ...profile, emailAlerts: false });
  const bid = await business();
  await w.createDocument(db, bid, owner, {
    title: "비동의 합성 서류",
    anchorDate: seoulDate(),
    frequency: "MONTHLY",
    leadDays: 0,
    url: null,
    memo: null,
    enabled: true,
  });
  expect(await notificationInbox(db, bid, owner)).toHaveLength(0);
});

test("마이그레이션은 알림톡 예약을 취소하고 이메일 동의와 과거 처리 이력을 보존한다", async () => {
  const bid = await business();
  await db.query("UPDATE owner_profiles SET profile=$1,onboarding=$2 WHERE owner_id=$3", [
    JSON.stringify({ ...profile, emailAlerts: false, alimtalkAlerts: true }),
    JSON.stringify({ stage: 1, owner: { ...profile, emailAlerts: false, alimtalkAlerts: true } }),
    owner,
  ]);
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  for (const [i, status] of ["PENDING", "CLAIMED", "LOCAL_ONLY", "PENDING"].entries())
    await db.query(
      "INSERT INTO workspace_notifications(id,business_id,kind,channel,dedupe_key,scheduled_at,status,payload) VALUES($1,$2,'NEW_BENEFIT',$3,$6,now(),$4,$5)",
      [
        ids[i],
        bid,
        i === 3 ? "EMAIL" : "ALIMTALK",
        status,
        JSON.stringify({ title: "합성 이전 알림", path: "/" }),
        ids[i],
      ],
    );
  await db.exec(await readFile("db/migrations/0004_email_only.sql", "utf8"));
  const rows = await db.query<{ id: string; status: string }>(
    "SELECT id,status FROM workspace_notifications WHERE business_id=$1",
    [bid],
  );
  expect(ids.map((id) => rows.find((r) => r.id === id)?.status)).toEqual([
    "CANCELLED",
    "CANCELLED",
    "LOCAL_ONLY",
    "PENDING",
  ]);
  const saved = await w.getProfile(db, owner);
  expect(saved.profile?.emailAlerts).toBe(false);
  expect(saved.profile).not.toHaveProperty("alimtalkAlerts");
  expect(saved.onboarding).toMatchObject({ owner: { emailAlerts: false } });
  expect(JSON.stringify(saved.onboarding)).not.toContain("alimtalkAlerts");
});

import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./helpers";
import type { Database } from "../src/server/db";
import * as w from "../src/server/workspace";
import {
  contactStatus,
  syncEmailContacts,
  reconcileEmailContacts,
} from "../src/server/email-contacts";
import { queueWeeklySummaries, weeklySummary, digestWeek } from "../src/server/weekly-digest";
import { dispatchWorkspaceNotifications } from "../src/server/workspace-notifications";
import {
  saveWatch,
  acceptDiscovery,
  runPolicyWatches,
  draftWatchEvent,
} from "../src/server/policy-watches";
import { connectedApi } from "../src/server/connected-workflows";
import { LinerRuleDraftGenerator, validateDraftEvidence } from "../src/integrations/drafting";
import { addDays, seoulDate } from "../src/domain/dates";
import { workspaceBusinessSchema } from "../src/domain/workspace";
let db: Database, owner: string, other: string;
const profile = (emailAlerts = true) => ({ name: null, birthDate: null, phone: null, emailAlerts });
const facts = () =>
  workspaceBusinessSchema.parse({
    nickname: "합성 사업장",
    industry: "CAFE",
    region: "서울",
    businessType: "SOLE",
    startedOn: null,
    revenueBand: null,
    pastBusinesses: [],
    rosterConfirmed: true,
  });
beforeAll(async () => {
  ({ db, owner, other } = await testDatabase());
}, 30000);
beforeEach(() => {
  vi.stubEnv("LIVE_INTEGRATIONS_ENABLED", "false");
  vi.stubEnv("STIBEE_CONTACT_SYNC_ENABLED", "false");
  vi.stubEnv("POLICY_WATCH_ENABLED", "false");
  vi.stubEnv("EMAIL_TRANSPORT", "local");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await db.close();
});
async function customer() {
  const id = randomUUID();
  await db.query("INSERT INTO users(id,email,role,is_demo) VALUES($1,$2,'OWNER',false)", [
    id,
    `${id}@example.com`,
  ]);
  return id;
}
function liveContacts() {
  vi.stubEnv("LIVE_INTEGRATIONS_ENABLED", "true");
  vi.stubEnv("STIBEE_CONTACT_SYNC_ENABLED", "true");
  vi.stubEnv("STIBEE_API_KEY", "synthetic-test-key");
  vi.stubEnv("STIBEE_LIST_ID", "123");
}
async function pendingNotice(id: string) {
  const b = (await w.createBusiness(db, id, facts())).id;
  await db.transaction(async (tx) => {
    await w.queueWorkspaceNotice(
      tx,
      await w.ownBusiness(tx, b, id),
      "NEW_BENEFIT",
      randomUUID(),
      new Date(),
      { title: "합성 알림", path: "/dashboard" },
    );
  });
  return b;
}
test("수신 동의 변경만 주소록 작업을 생성하고 기본값은 외부 호출 없이 보관한다", async () => {
  const id = await customer(),
    fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await w.putProfile(db, id, profile());
  await w.putProfile(db, id, profile());
  expect(await db.query("SELECT id FROM email_sync_jobs WHERE owner_id=$1", [id])).toHaveLength(1);
  await syncEmailContacts(db);
  expect(await contactStatus(db, id)).toMatchObject({
    desired: true,
    sync_status: "LOCAL_ONLY",
    revision: 1,
  });
  expect(fetcher).not.toHaveBeenCalled();
  await w.putProfile(db, id, profile(false));
  expect(await contactStatus(db, id)).toMatchObject({ desired: false, revision: 2 });
  expect(await contactStatus(db, other)).toBeNull();
});
test("스티비 주소록은 서비스 동의만 반영하고 중복 호출하지 않는다", async () => {
  const id = await customer();
  await w.putProfile(db, id, profile());
  liveContacts();
  const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
  vi.stubGlobal("fetch", fetcher);
  await syncEmailContacts(db);
  await syncEmailContacts(db);
  const calls = fetcher.mock.calls.filter(
    (c) => JSON.parse(c[1].body).subscriber.email === `${id}@example.com`,
  );
  expect(calls).toHaveLength(1);
  expect(JSON.parse(calls[0][1].body)).toMatchObject({
    subscriber: { status: "subscribed", marketingAllowed: false },
    updateEnabled: true,
  });
  expect(await contactStatus(db, id)).toMatchObject({
    sync_status: "APPLIED",
    remote_status: "subscribed",
  });
});
test("주소록 결과 불명은 자동 재시도하지 않으며 외부 수신 거부는 로컬 알림을 취소한다", async () => {
  const id = await customer();
  await w.putProfile(db, id, profile());
  liveContacts();
  const failed = vi.fn().mockRejectedValue(new Error("synthetic timeout"));
  vi.stubGlobal("fetch", failed);
  await syncEmailContacts(db);
  const count = failed.mock.calls.length;
  await syncEmailContacts(db);
  expect(failed).toHaveBeenCalledTimes(count);
  expect(await contactStatus(db, id)).toMatchObject({ sync_status: "UNKNOWN" });
  const bid = await pendingNotice(id);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify([{ email: `${id}@example.com`, status: "unsubscribed" }])),
      ),
  );
  await reconcileEmailContacts(db);
  expect((await w.getProfile(db, id)).profile?.emailAlerts).toBe(false);
  expect(await contactStatus(db, id)).toMatchObject({
    desired: false,
    sync_status: "REMOTE_BLOCKED",
  });
  expect(
    await db.query(
      "SELECT id FROM workspace_notifications WHERE business_id=$1 AND status='PENDING'",
      [bid],
    ),
  ).toHaveLength(0);
  await w.putProfile(db, id, profile(false));
  expect(await contactStatus(db, id)).toMatchObject({
    desired: false,
    sync_status: "REMOTE_BLOCKED",
  });
});
test("동기화 중 수신 거부를 저장하면 최신 작업이 이전 응답에 덮이지 않는다", async () => {
  const id = await customer();
  await w.putProfile(db, id, profile());
  liveContacts();
  const states: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (_url: string, options: { body: string }) => {
      const subscriber = JSON.parse(options.body).subscriber;
      if (subscriber.email === `${id}@example.com`) {
        states.push(subscriber.status);
        if (subscriber.status === "subscribed") {
          expect(
            await db.query(
              "SELECT id FROM email_sync_jobs WHERE owner_id=$1 AND status='CLAIMED'",
              [id],
            ),
          ).toHaveLength(1);
          await w.putProfile(db, id, profile(false));
        }
      }
      return new Response("{}", { status: 201 });
    }),
  );
  await syncEmailContacts(db);
  expect(await contactStatus(db, id)).toMatchObject({
    desired: false,
    revision: 2,
    sync_status: "PENDING",
  });
  await syncEmailContacts(db);
  expect(states).toEqual(["subscribed", "unsubscribed"]);
  expect(await contactStatus(db, id)).toMatchObject({
    desired: false,
    revision: 2,
    sync_status: "APPLIED",
    remote_status: "unsubscribed",
  });
});
test("주소록 확인 전에는 이메일을 발송하지 않고 옵트아웃 후에도 발송하지 않는다", async () => {
  const id = await customer();
  await w.putProfile(db, id, profile());
  const bid = await pendingNotice(id);
  liveContacts();
  vi.stubEnv("EMAIL_TRANSPORT", "stibee");
  vi.stubEnv("STIBEE_AUTO_EMAIL_URL", "https://stibee.com/api/v1.0/auto/synthetic");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await dispatchWorkspaceNotifications(db);
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    await db.query(
      "SELECT id FROM workspace_notifications WHERE business_id=$1 AND status='PENDING'",
      [bid],
    ),
  ).toHaveLength(1);
  await w.putProfile(db, id, profile(false));
  await dispatchWorkspaceNotifications(db);
  expect(fetcher).not.toHaveBeenCalled();
});
test("외부 동의 조회 중 새로 저장한 동의를 오래된 결과로 덮어쓰지 않는다", async () => {
  const id = await customer();
  await w.putProfile(db, id, profile(false));
  liveContacts();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => {
      await w.putProfile(db, id, profile());
      return new Response(JSON.stringify([{ email: `${id}@example.com`, status: "unsubscribed" }]));
    }),
  );
  await reconcileEmailContacts(db);
  expect((await w.getProfile(db, id)).profile?.emailAlerts).toBe(true);
});
test("주간 요약은 한 주에 한 번 생성하고 발송 직전에 완료·비활성 업무를 제외한다", async () => {
  const id = await customer();
  await w.putProfile(db, id, profile());
  const bid = (await w.createBusiness(db, id, facts())).id;
  await w.createDocument(db, bid, id, {
    title: "합성 주간 서류",
    anchorDate: seoulDate(),
    frequency: "MONTHLY",
    leadDays: 1,
    url: null,
    memo: null,
    enabled: true,
  });
  expect(await weeklySummary(db, bid)).toMatchObject({ total: 1 });
  await queueWeeklySummaries(db);
  await queueWeeklySummaries(db);
  expect(
    await db.query(
      "SELECT id FROM workspace_notifications WHERE business_id=$1 AND kind='WEEKLY_DIGEST'",
      [bid],
    ),
  ).toHaveLength(1);
  await db.query(
    "UPDATE document_occurrences SET done=true WHERE document_id IN (SELECT id FROM recurring_documents WHERE business_id=$1)",
    [bid],
  );
  await dispatchWorkspaceNotifications(db);
  expect(
    (
      await db.query(
        "SELECT status FROM workspace_notifications WHERE business_id=$1 AND kind='WEEKLY_DIGEST'",
        [bid],
      )
    )[0].status,
  ).toBe("CANCELLED");
});
test("주간 요약은 실제 총 건수를 표시하고 지난 주 예약은 취소한다", async () => {
  const id = await customer();
  await w.putProfile(db, id, profile());
  const bid = (await w.createBusiness(db, id, facts())).id;
  for (let i = 0; i < 5; i++)
    await w.createDocument(db, bid, id, {
      title: `합성 서류 ${i}`,
      anchorDate: seoulDate(),
      frequency: "MONTHLY",
      leadDays: 1,
      url: null,
      memo: null,
      enabled: true,
    });
  expect(await weeklySummary(db, bid)).toMatchObject({ total: 5, items: expect.any(Array) });
  await queueWeeklySummaries(db);
  await dispatchWorkspaceNotifications(db);
  expect(
    (
      await db.query(
        "SELECT o.title FROM workspace_outbox o JOIN workspace_notifications n ON n.id=o.notification_id WHERE n.business_id=$1 AND n.kind='WEEKLY_DIGEST'",
        [bid],
      )
    )[0].title,
  ).toContain("5건");
  await db.transaction(async (tx) => {
    await w.queueWorkspaceNotice(
      tx,
      await w.ownBusiness(tx, bid, id),
      "WEEKLY_DIGEST",
      randomUUID(),
      new Date(),
      { title: "오래된 예약", path: "/dashboard", deadline: addDays(digestWeek(), -1) },
    );
  });
  await dispatchWorkspaceNotifications(db);
  expect(
    await db.query(
      "SELECT id FROM workspace_notifications WHERE business_id=$1 AND kind='WEEKLY_DIGEST' AND status='CANCELLED'",
      [bid],
    ),
  ).toHaveLength(1);
});
test("Liner 감시는 공식 후보만 저장하고 승인한 출처의 A→B→A 변경을 모두 기록한다", async () => {
  const url = "https://www.bizinfo.go.kr/synthetic-test-only";
  await saveWatch(db, owner, { query: "합성 테스트 공고 검색", enabled: true });
  vi.stubEnv("LIVE_INTEGRATIONS_ENABLED", "true");
  vi.stubEnv("POLICY_WATCH_ENABLED", "true");
  vi.stubEnv("LINER_API_KEY", "synthetic-test-key");
  let text = "합성 원문 A ".repeat(20);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: string) =>
      String(input).includes("platform.liner.com")
        ? new Response(
            JSON.stringify({
              results: [
                { title: "합성 공고", url },
                { title: "비공식", url: "https://example.com/no" },
              ],
            }),
          )
        : new Response(text, { headers: { "content-type": "text/plain" } }),
    ),
  );
  await db.query("UPDATE sources SET collection_allowed=false");
  await runPolicyWatches(db);
  expect(await db.query("SELECT id FROM policy_discoveries")).toHaveLength(1);
  expect(await db.query("SELECT id FROM watched_source_events")).toHaveLength(0);
  const d = (await db.query<{ id: string }>("SELECT id FROM policy_discoveries"))[0];
  await acceptDiscovery(db, d.id, owner);
  await runPolicyWatches(db);
  await runPolicyWatches(db);
  text = "합성 원문 B ".repeat(20);
  await runPolicyWatches(db);
  text = "합성 원문 A ".repeat(20);
  await runPolicyWatches(db);
  expect(await db.query("SELECT id FROM watched_source_events")).toHaveLength(3);
  expect(
    await db.query(
      "SELECT id FROM source_snapshots WHERE source_id IN (SELECT source_id FROM policy_discoveries)",
    ),
  ).toHaveLength(2);
});
test("감시 초안은 원문 근거와 연결되고 승인 대기로만 생성된다", async () => {
  const e = (
    await db.query<{ id: string; snapshot_id: string; url: string; normalized_text: string }>(
      "SELECT e.*,s.url,n.normalized_text FROM watched_source_events e JOIN sources s ON s.id=e.source_id JOIN source_snapshots n ON n.id=e.snapshot_id ORDER BY revision DESC",
    )
  )[0];
  const draft = validateDraftEvidence(
    {
      title: "합성 테스트 초안",
      kind: "BENEFIT",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      definition: {
        conditions: { field: "currentHeadcount", op: "gte", value: 1 },
        explanation: "실제 조건이 아닌 검증용 원문입니다.",
        tasks: [],
        sources: [
          { title: "합성", url: e.url, section: e.normalized_text.slice(0, 30), verified: true },
        ],
      },
    },
    { snapshotId: e.snapshot_id, title: "합성", url: e.url, text: e.normalized_text },
  );
  vi.spyOn(LinerRuleDraftGenerator.prototype, "suggest").mockResolvedValue(draft);
  const r = await draftWatchEvent(db, e.id, owner);
  expect(r).toMatchObject({ requiresHumanApproval: true });
  const row = (
    await db.query<{
      status: string;
      active_version_id: string | null;
      definition: { sources: { verified: boolean }[] };
    }>(
      "SELECT v.status,p.active_version_id,v.definition FROM review_items r JOIN policy_versions v ON v.id=r.draft_version_id JOIN policies p ON p.id=v.policy_id WHERE r.id=$1",
      [r.reviewId],
    )
  )[0];
  expect(row.status).toBe("PENDING_REVIEW");
  expect(row.active_version_id).toBeNull();
  expect(row.definition.sources[0].verified).toBe(false);
  expect((await draftWatchEvent(db, e.id, owner)).reviewId).toBe(r.reviewId);
});
test("외부 연동 기본 차단·운영자 권한·본인 연락처 접근을 유지하고 제외한 API는 없다", async () => {
  await expect(runPolicyWatches(db)).rejects.toMatchObject({ status: 503 });
  await expect(reconcileEmailContacts(db)).rejects.toMatchObject({ status: 503 });
  const user = { id: other, email: "other@local.invalid", role: "OWNER" as const, is_demo: true };
  await expect(
    connectedApi(new Request("http://local.invalid"), db, user, ["admin", "watches"]),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    await connectedApi(new Request("http://local.invalid"), db, user, ["email-contact"]),
  ).toEqual({ contact: null });
  expect(
    await connectedApi(new Request("http://local.invalid"), db, user, ["integrations", "alt"]),
  ).toBeUndefined();
});

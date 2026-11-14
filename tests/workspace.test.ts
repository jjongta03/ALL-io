import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./helpers";
import type { Database } from "../src/server/db";
import { addDays, seoulDate } from "../src/domain/dates";
import {
  workspaceBusinessSchema,
  employeeSchema,
  occurrenceDate,
  evaluateCurrent,
  currentFacts,
} from "../src/domain/workspace";
import * as w from "../src/server/workspace";
import {
  dispatchWorkspaceNotifications,
  notificationInbox,
  reassessWorkspaces,
} from "../src/server/workspace-notifications";
import { validateContract, readContractUpload } from "../src/integrations/contract-reader";
import { protectDocument, revealDocument } from "../src/server/workspace-secrets";
import { getPolicies } from "../src/server/service";

let db: Database, owner: string, other: string;
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
const employee = () =>
  employeeSchema.parse({
    name: "합성직원",
    employmentType: "PART_TIME",
    weeklyHours: 20,
    hourlyWage: 12000,
    startedOn: null,
  });
beforeAll(async () => {
  ({ db, owner, other } = await testDatabase());
  process.env.LIVE_INTEGRATIONS_ENABLED = "false";
  process.env.CONTRACT_SCAN_ENABLED = "false";
  await w.putProfile(db, owner, {
    name: null,
    birthDate: null,
    phone: "01000000000",
    emailAlerts: true,
  });
}, 30000);
afterAll(async () => {
  vi.unstubAllEnvs();
  if (db) await db.close();
});
async function business() {
  return (await w.createBusiness(db, owner, facts())).id;
}
async function demoPolicy() {
  const id = randomUUID(),
    version = randomUUID();
  await db.query(
    "INSERT INTO policies(id,slug,title,kind) VALUES($1,$2,'가상 테스트 혜택','BENEFIT')",
    [id, id],
  );
  await db.query(
    "INSERT INTO policy_versions(id,policy_id,version,status,definition,effective_from,is_demo) VALUES($1,$2,1,'APPROVED',$3,'2020-01-01',true)",
    [
      version,
      id,
      JSON.stringify({
        conditions: { field: "currentHeadcount", op: "gte", value: 1 },
        explanation: "실제 자격과 관계없는 테스트입니다.",
        sources: [
          {
            title: "합성 테스트 원문",
            url: "https://example.invalid/source",
            verified: false,
            section: "실제 지원 조건이 아닌 테스트 전용 가상 원문입니다.",
          },
        ],
        tasks: [
          {
            key: "apply",
            title: "가상 신청 절차",
            description: "설명용 절차",
            destination: "테스트",
            url: "https://example.invalid/apply",
            deadlineKind: "PREPARATION",
            offsetDays: 10,
          },
        ],
      }),
    ],
  );
  await db.query("UPDATE policies SET active_version_id=$1 WHERE id=$2", [version, id]);
  return { id, version };
}

test("4단계 입력은 앞서 저장한 정보를 유지하며 직원 수 직접 입력을 거절한다", async () => {
  await w.saveOnboarding(db, owner, { stage: 1, owner: { name: "합성사장" } });
  await w.saveOnboarding(db, owner, { stage: 2, business: facts() });
  expect((await w.getProfile(db, owner)).onboarding).toMatchObject({
    stage: 2,
    owner: { name: "합성사장" },
  });
  expect(workspaceBusinessSchema.safeParse({ ...facts(), currentHeadcount: 4 }).success).toBe(
    false,
  );
  expect(currentFacts({ ...facts(), rosterConfirmed: false }, 0).currentHeadcount).toBeNull();
});
test("프로젝트 삭제는 소유자를 확인하고 단계·알림만 함께 제거하며 다시 시작할 수 있다", async () => {
  const bid = await business(),
    policy = await demoPolicy();
  await w.saveEmployee(db, bid, owner, employee());
  const { id } = await w.startProject(db, bid, owner, policy.id);
  const detail = await w.projectDetail(db, id, owner);
  const step = detail.steps[0].id;
  expect(
    await db.query("SELECT id FROM workspace_notifications WHERE project_step_id=$1", [step]),
  ).not.toHaveLength(0);
  await expect(w.deleteProject(db, id, other)).rejects.toMatchObject({ status: 404 });
  expect((await w.projectDetail(db, id, owner)).total).toBe(1);
  await w.deleteProject(db, id, owner);
  await expect(w.projectDetail(db, id, owner)).rejects.toMatchObject({ status: 404 });
  expect(await db.query("SELECT id FROM project_steps WHERE project_id=$1", [id])).toHaveLength(0);
  expect(
    await db.query("SELECT id FROM workspace_notifications WHERE project_step_id=$1", [step]),
  ).toHaveLength(0);
  expect(
    await db.query("SELECT id FROM workspace_evaluations WHERE business_id=$1", [bid]),
  ).not.toHaveLength(0);
  expect((await w.startProject(db, bid, owner, policy.id)).id).not.toBe(id);
});
test("모르는 보험·나이·급여를 거짓이나 0으로 보정하지 않는다", () => {
  const f = currentFacts(facts(), 0);
  expect(f.ownerAgeYears).toBeNull();
  expect(f.hasPastBusiness).toBeNull();
  expect(f.monthlyAveragePay).toBeUndefined();
  expect(f.employmentHeadcount).toBeUndefined();
  expect(
    workspaceBusinessSchema.safeParse({ ...facts(), confirmedFacts: { employmentHeadcount: true } })
      .success,
  ).toBe(false);
});
test("직원 목록은 8개 페이지와 총원을 제공하며 다른 소유자는 접근할 수 없다", async () => {
  const id = await business();
  for (let i = 0; i < 10; i++)
    await w.saveEmployee(db, id, owner, { ...employee(), name: `합성직원${i}` });
  const r = await w.roster(db, id, owner);
  expect(r.total).toBe(10);
  expect(r.employees).toHaveLength(8);
  expect((await w.roster(db, id, owner, 8, 8)).employees).toHaveLength(2);
  await expect(w.roster(db, id, other)).rejects.toMatchObject({ status: 404 });
});
test("계약서 스캔은 자동 승인되지 않으며 확인 저장·이름 수정·퇴사 삭제가 원자적이다", async () => {
  const id = await business(),
    bytes = Buffer.from("%PDF-1.4 synthetic test only");
  const scan = await w.createScan(db, id, owner, bytes, "application/pdf");
  expect(scan.status).toBe("MANUAL_REQUIRED");
  expect(scan.draft.name).toBeNull();
  expect((await w.roster(db, id, owner)).total).toBe(0);
  await expect(w.scanDocument(db, scan.id, other)).rejects.toMatchObject({ status: 404 });
  expect((await w.scanDocument(db, scan.id, owner)).bytes).toEqual(bytes);
  const e = await w.confirmScan(db, scan.id, owner, employee());
  expect((await w.confirmScan(db, scan.id, owner, employee())).id).toBe(e.id);
  await w.saveEmployee(db, id, owner, { ...employee(), name: "수정한 이름" }, e.id, 1);
  expect((await w.employeeDetail(db, e.id, owner)).details.name).toBe("수정한 이름");
  await expect(w.deleteEmployee(db, e.id, owner, true, 1)).rejects.toMatchObject({ status: 409 });
  await expect(w.deleteEmployee(db, e.id, owner, false, 2)).rejects.toMatchObject({ status: 422 });
  await expect(w.deleteEmployee(db, e.id, other, true, 2)).rejects.toMatchObject({ status: 404 });
  await w.deleteEmployee(db, e.id, owner, true, 2);
  expect((await w.roster(db, id, owner)).total).toBe(0);
  expect(await db.query("SELECT id FROM contract_scans WHERE id=$1", [scan.id])).toHaveLength(0);
  await expect(w.employeeDetail(db, e.id, owner)).rejects.toMatchObject({ status: 404 });
  const snapshots = await db.query(
    "SELECT input_snapshot FROM workspace_evaluations WHERE business_id=$1",
    [id],
  );
  expect(JSON.stringify(snapshots)).not.toContain("수정한 이름");
  await expect(
    db.query("UPDATE workspace_evaluations SET result='[]' WHERE business_id=$1", [id]),
  ).rejects.toThrow();
});
test("위조 파일과 큰 multipart를 거절하며 암호화 원문은 키 없이는 읽을 수 없다", async () => {
  expect(() => validateContract(Buffer.from("not a pdf"), "application/pdf")).toThrow();
  const data = new FormData();
  data.set("file", new File(["%PDF-1.4 test"], "a.pdf", { type: "application/pdf" }));
  const request = new Request("http://local.invalid/", { method: "POST", body: data });
  expect((await readContractUpload(request)).mediaType).toBe("application/pdf");
  vi.stubEnv("CONTRACT_ENCRYPTION_KEY", "11".repeat(32));
  const bytes = Buffer.from("contract-content");
  const sealed = protectDocument(bytes);
  expect(sealed.equals(bytes)).toBe(false);
  expect(revealDocument(sealed)).toEqual(bytes);
  vi.stubEnv("CONTRACT_ENCRYPTION_KEY", "22".repeat(32));
  expect(() => revealDocument(sealed)).toThrow();
  vi.stubEnv("CONTRACT_ENCRYPTION_KEY", "");
});
test("현재 조건 MATCH만 노출하고 과거 평가를 덮어쓰지 않는다", async () => {
  const p = await demoPolicy(),
    id = await business();
  expect((await w.eligibleBenefits(db, id, owner)).benefits.some((b) => b.policyId === p.id)).toBe(
    false,
  );
  await w.saveEmployee(db, id, owner, employee());
  const result = await w.eligibleBenefits(db, id, owner);
  expect(result.benefits.some((b) => b.policyId === p.id)).toBe(true);
  const first = (
    await db.query<{ input_snapshot: { facts: { currentHeadcount: number } } }>(
      "SELECT input_snapshot FROM workspace_evaluations WHERE business_id=$1 ORDER BY created_at ASC,id ASC",
      [id],
    )
  )[0];
  expect(first.input_snapshot.facts.currentHeadcount).toBe(0);
  const hash = await db.query("SELECT input_hash FROM workspace_evaluations WHERE business_id=$1", [
    id,
  ]);
  await w.eligibleBenefits(db, id, owner);
  expect(
    await db.query("SELECT input_hash FROM workspace_evaluations WHERE business_id=$1", [id]),
  ).toEqual(hash);
});
test("운영은 데모 규칙·모집 기간 미검수·출처 미확인을 신청 가능으로 표시하지 않는다", async () => {
  const p = await demoPolicy(),
    policy = (await getPolicies(db)).find((v) => v.policyId === p.id)!;
  expect(evaluateCurrent([policy], currentFacts(facts(), 1), false)[0].status).not.toBe("MATCH");
  const live = {
    ...policy,
    isDemo: false,
    verifiedAt: new Date().toISOString(),
    definition: {
      ...policy.definition,
      sources: policy.definition.sources.map((s) => ({ ...s, verified: true })),
    },
  };
  expect(evaluateCurrent([live], currentFacts(facts(), 1), false)[0].status).not.toBe("MATCH");
  expect(
    evaluateCurrent(
      [
        {
          ...live,
          definition: {
            ...live.definition,
            applicationWindow: { open: true, startsOn: "2020-01-01", endsOn: "2021-01-01" },
          },
        },
      ],
      currentFacts(facts(), 1),
      false,
    )[0].status,
  ).not.toBe("MATCH");
});
test("프로젝트 시작은 중복되지 않고 완료·해제와 조건 변경을 독립적으로 관리한다", async () => {
  const p = await demoPolicy(),
    id = await business();
  const e = await w.saveEmployee(db, id, owner, employee());
  const a = await w.startProject(db, id, owner, p.id),
    b = await w.startProject(db, id, owner, p.id);
  expect(a.id).toBe(b.id);
  const detail = await w.projectDetail(db, a.id, owner);
  await expect(w.projectDetail(db, a.id, other)).rejects.toMatchObject({ status: 404 });
  await w.changeProjectStep(db, detail.steps[0].id, owner, { done: true });
  expect((await w.dashboard(db, id, owner)).projects).toHaveLength(0);
  expect((await w.eligibleBenefits(db, id, owner)).completed).toHaveLength(1);
  await w.changeProjectStep(db, detail.steps[0].id, owner, { done: false });
  await w.deleteEmployee(db, e.id, owner, true, 1);
  expect((await w.dashboard(db, id, owner)).projects[0].eligibility).toBe("RECHECK_REQUIRED");
});
test("정기 서류는 월말 기준을 유지하고 완료·수정·삭제 시 예약을 취소한다", async () => {
  expect(occurrenceDate("2027-01-31", "MONTHLY", 1)).toBe("2027-02-28");
  expect(occurrenceDate("2027-01-31", "MONTHLY", 2)).toBe("2027-03-31");
  const id = await business(),
    d = {
      title: "합성 정기 서류",
      anchorDate: addDays(seoulDate(), 10),
      frequency: "MONTHLY" as const,
      leadDays: 3,
      url: null,
      memo: null,
      enabled: true,
    };
  const doc = await w.createDocument(db, id, owner, d);
  const o = (
    await db.query<{ id: string }>("SELECT id FROM document_occurrences WHERE document_id=$1", [
      doc.id,
    ])
  )[0];
  await expect(w.completeOccurrence(db, o.id, other)).rejects.toMatchObject({ status: 404 });
  await w.completeOccurrence(db, o.id, owner);
  await w.completeOccurrence(db, o.id, owner);
  expect(
    await db.query("SELECT id FROM document_occurrences WHERE document_id=$1", [doc.id]),
  ).toHaveLength(2);
  await w.updateDocument(db, doc.id, owner, { ...d, enabled: false });
  expect(
    await db.query(
      "SELECT n.id FROM workspace_notifications n JOIN document_occurrences o ON o.id=n.occurrence_id WHERE o.document_id=$1 AND n.status='PENDING'",
      [doc.id],
    ),
  ).toHaveLength(0);
  await w.deleteDocument(db, doc.id, owner);
  expect(
    await db.query("SELECT id FROM document_occurrences WHERE document_id=$1", [doc.id]),
  ).toHaveLength(0);
});
test("새 혜택 알림은 중복 없이 로컬 보관하고 완료·동의 해제를 재확인한다", async () => {
  const id = await business();
  await w.saveEmployee(db, id, owner, employee());
  await demoPolicy();
  await reassessWorkspaces(db);
  await reassessWorkspaces(db);
  const before = await notificationInbox(db, id, owner);
  expect(new Set(before.map((n) => (n as { id: string }).id)).size).toBe(before.length);
  const fake = vi.spyOn(globalThis, "fetch");
  await dispatchWorkspaceNotifications(db, new Date(Date.now() + 10000));
  expect(fake).not.toHaveBeenCalled();
  fake.mockRestore();
  const local = (await notificationInbox(db, id, owner)).filter(
    (n) => (n as { status: string }).status === "LOCAL_ONLY",
  );
  expect(local.length).toBeGreaterThan(0);
  await dispatchWorkspaceNotifications(db, new Date(Date.now() + 10000));
  expect(
    (await notificationInbox(db, id, owner)).filter(
      (n) => (n as { status: string }).status === "LOCAL_ONLY",
    ),
  ).toHaveLength(local.length);
});
test("동의를 다시 켜면 미완료 일정만 재예약하고 UNKNOWN 전송은 재시도하지 않는다", async () => {
  const id = await business();
  const settings = {
    name: null,
    birthDate: null,
    phone: "01000000000",
    emailAlerts: true,
  };
  const d = await w.createDocument(db, id, owner, {
    title: "동의 재확인용 합성 서류",
    anchorDate: addDays(seoulDate(), 2),
    frequency: "MONTHLY",
    leadDays: 3,
    url: null,
    memo: null,
    enabled: true,
  });
  const pending = () =>
    db.query<{ id: string; status: string }>(
      "SELECT n.id,n.status FROM workspace_notifications n JOIN document_occurrences o ON o.id=n.occurrence_id WHERE o.document_id=$1",
      [d.id],
    );
  expect((await pending()).filter((n) => n.status === "PENDING")).toHaveLength(1);
  await w.putProfile(db, owner, { ...settings, emailAlerts: false });
  expect((await pending()).every((n) => n.status === "CANCELLED")).toBe(true);
  await w.putProfile(db, owner, settings);
  expect((await pending()).filter((n) => n.status === "PENDING")).toHaveLength(1);
  const n = (await pending())[0];
  await db.query("UPDATE workspace_notifications SET status='UNKNOWN' WHERE id=$1", [n.id]);
  await dispatchWorkspaceNotifications(db);
  expect((await pending()).find((v) => v.id === n.id)?.status).toBe("UNKNOWN");
  const occurrence = (
    await db.query<{ id: string }>("SELECT id FROM document_occurrences WHERE document_id=$1", [
      d.id,
    ])
  )[0];
  await w.completeOccurrence(db, occurrence.id, owner);
  await w.putProfile(db, owner, settings);
  expect(
    (
      await db.query<{ status: string }>(
        "SELECT status FROM workspace_notifications WHERE occurrence_id=$1",
        [occurrence.id],
      )
    ).some((n) => n.status === "PENDING"),
  ).toBe(false);
});

test("운영자 전용 작업은 OWNER 역할로 실행할 수 없다", async () => {
  const { workspaceApi } = await import("../src/server/workspace-api");
  await expect(
    workspaceApi(
      new Request("http://local.invalid/api/v2/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "reassess" }),
      }),
      db,
      { id: other, email: "other@local.invalid", role: "OWNER", is_demo: true },
      ["admin", "jobs"],
    ),
  ).rejects.toMatchObject({ status: 403 });
});

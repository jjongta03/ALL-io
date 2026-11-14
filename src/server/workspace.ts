import { randomUUID } from "node:crypto";
import type { Database, Sql } from "./db";
import { AppError, notFound } from "./errors";
import { hash } from "./hashing";
import { getConfig } from "./config";
import { getPolicies } from "./service";
import { addDays, seoulDate, seoulMorning } from "@/domain/dates";
import {
  currentFacts,
  evaluateCurrent,
  occurrenceDate,
  workspaceBusinessSchema,
  type WorkspaceBusiness,
  type OwnerProfile,
  type EmployeeDetails,
  type RecurringDocument,
} from "@/domain/workspace";
import type { PolicyVersion } from "@/domain/contracts";
import { extractContract, validateContract } from "@/integrations/contract-reader";
import { protectDocument, revealDocument } from "./workspace-secrets";
import { queueContactSync } from "./email-contacts";

export type BusinessRow = {
  id: string;
  owner_id: string;
  facts: WorkspaceBusiness;
  revision: number;
};
export async function ownBusiness(
  sql: Sql,
  id: string,
  owner: string,
  lock = false,
): Promise<BusinessRow> {
  return (
    (
      await sql.query<BusinessRow>(
        `SELECT * FROM businesses WHERE id=$1 AND owner_id=$2${lock ? " FOR UPDATE" : ""}`,
        [id, owner],
      )
    )[0] ?? notFound()
  );
}
export async function getProfile(sql: Sql, owner: string) {
  return (
    (
      await sql.query<{ profile: OwnerProfile; onboarding: unknown }>(
        "SELECT profile,onboarding FROM owner_profiles WHERE owner_id=$1",
        [owner],
      )
    )[0] ?? { profile: null, onboarding: null }
  );
}
export async function putProfile(db: Database, owner: string, profile: OwnerProfile) {
  await db.transaction(async (tx) => {
    await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [owner]);
    await tx.query(
      "INSERT INTO owner_profiles(owner_id,profile) VALUES($1,$2) ON CONFLICT(owner_id) DO UPDATE SET profile=$2,updated_at=now()",
      [owner, JSON.stringify({ ...profile, consentRecordedAt: new Date().toISOString() })],
    );
    await queueContactSync(tx, owner, profile.emailAlerts);
    if (!profile.emailAlerts)
      await tx.query(
        "UPDATE notification_jobs SET status='CANCELLED' WHERE status='PENDING' AND plan_id IN (SELECT id FROM change_plans WHERE owner_id=$1)",
        [owner],
      );
    if (!profile.emailAlerts)
      await tx.query(
        "UPDATE workspace_notifications SET status='CANCELLED' WHERE channel='EMAIL' AND status='PENDING' AND business_id IN (SELECT id FROM businesses WHERE owner_id=$1)",
        [owner],
      );
    const businesses = await tx.query<BusinessRow>(
      "SELECT * FROM businesses WHERE owner_id=$1 ORDER BY id FOR UPDATE",
      [owner],
    );
    for (const b of businesses)
      if (workspaceBusinessSchema.safeParse(b.facts).success) {
        await evaluateWorkspaceIn(tx, b);
        await refreshBusinessSchedules(tx, b);
      }
  });
  return getProfile(db, owner);
}
export async function saveOnboarding(db: Database, owner: string, draft: unknown) {
  await db.query(
    "INSERT INTO owner_profiles(owner_id,onboarding) VALUES($1,$2) ON CONFLICT(owner_id) DO UPDATE SET onboarding=owner_profiles.onboarding || $2::jsonb,updated_at=now()",
    [owner, JSON.stringify(draft)],
  );
  return getProfile(db, owner);
}
export async function createBusiness(db: Database, owner: string, facts: WorkspaceBusiness) {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.query("INSERT INTO businesses(id,owner_id,facts) VALUES($1,$2,$3)", [
      id,
      owner,
      JSON.stringify(facts),
    ]);
    await evaluateWorkspaceIn(tx, await ownBusiness(tx, id, owner));
  });
  return { id };
}
export async function updateBusiness(
  db: Database,
  id: string,
  owner: string,
  facts: WorkspaceBusiness,
  revision: number,
) {
  return db.transaction(async (tx) => {
    const b = await ownBusiness(tx, id, owner, true);
    if (b.revision !== revision)
      throw new AppError(409, "사업장 정보가 변경되었습니다. 새로고침 후 다시 저장하세요.");
    await tx.query(
      "UPDATE businesses SET facts=$1,revision=revision+1,updated_at=now() WHERE id=$2",
      [JSON.stringify(facts), id],
    );
    return evaluateWorkspaceIn(tx, { ...b, facts, revision: b.revision + 1 });
  });
}
async function countEmployees(sql: Sql, id: string) {
  return (
    await sql.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM employees WHERE business_id=$1 AND (details->>'startedOn' IS NULL OR (details->>'startedOn')::date <= $2::date)",
      [id, seoulDate()],
    )
  )[0].count;
}
export async function roster(db: Database, bid: string, owner: string, offset = 0, limit = 8) {
  await ownBusiness(db, bid, owner);
  const total = (
    await db.query<{ n: number }>("SELECT count(*)::int AS n FROM employees WHERE business_id=$1", [
      bid,
    ])
  )[0].n;
  return {
    total,
    currentCount: await countEmployees(db, bid),
    offset,
    limit,
    employees: await db.query(
      "SELECT id,details,revision,created_at FROM employees WHERE business_id=$1 ORDER BY created_at,id LIMIT $2 OFFSET $3",
      [bid, limit, offset],
    ),
  };
}
export async function employeeDetail(sql: Sql, id: string, owner: string) {
  return (
    (
      await sql.query<{
        id: string;
        business_id: string;
        scan_id: string | null;
        details: EmployeeDetails;
        revision: number;
      }>(
        "SELECT e.* FROM employees e JOIN businesses b ON b.id=e.business_id WHERE e.id=$1 AND b.owner_id=$2",
        [id, owner],
      )
    )[0] ?? notFound()
  );
}
export async function saveEmployee(
  db: Database,
  bid: string,
  owner: string,
  details: EmployeeDetails,
  employeeId?: string,
  revision?: number,
) {
  return db.transaction(async (tx) => {
    const b = await ownBusiness(tx, bid, owner, true);
    let id = employeeId;
    if (id) {
      const e = await employeeDetail(tx, id, owner);
      if (e.business_id !== bid) notFound();
      if (e.revision !== revision) throw new AppError(409, "직원 정보가 변경되었습니다.");
      await tx.query(
        "UPDATE employees SET details=$1,revision=revision+1,updated_at=now() WHERE id=$2",
        [JSON.stringify(details), id],
      );
    } else {
      id = randomUUID();
      await tx.query("INSERT INTO employees(id,business_id,details) VALUES($1,$2,$3)", [
        id,
        bid,
        JSON.stringify(details),
      ]);
    }
    await tx.query("UPDATE businesses SET revision=revision+1,updated_at=now() WHERE id=$1", [bid]);
    await evaluateWorkspaceIn(tx, { ...b, revision: b.revision + 1 });
    return { id };
  });
}
export async function deleteEmployee(
  db: Database,
  id: string,
  owner: string,
  confirm: boolean,
  revision: number,
) {
  if (!confirm) throw new AppError(422, "퇴사·정보 삭제를 명시적으로 확인하세요.");
  return db.transaction(async (tx) => {
    const e = await employeeDetail(tx, id, owner),
      b = await ownBusiness(tx, e.business_id, owner, true);
    const current = await employeeDetail(tx, id, owner);
    if (current.revision !== revision) throw new AppError(409, "직원 정보가 변경되었습니다.");
    await tx.query("DELETE FROM employees WHERE id=$1", [id]);
    if (current.scan_id)
      await tx.query("DELETE FROM contract_scans WHERE id=$1 AND business_id=$2", [
        current.scan_id,
        e.business_id,
      ]);
    await tx.query("UPDATE businesses SET revision=revision+1,updated_at=now() WHERE id=$1", [
      b.id,
    ]);
    await evaluateWorkspaceIn(tx, { ...b, revision: b.revision + 1 });
    await tx.query(
      "INSERT INTO audit_events(id,actor_id,action,entity_id) VALUES($1,$2,'employee.deleted',$3)",
      [randomUUID(), owner, id],
    );
    return { deleted: true };
  });
}
export async function createScan(
  db: Database,
  bid: string,
  owner: string,
  bytes: Buffer,
  mediaType: string,
) {
  await ownBusiness(db, bid, owner);
  validateContract(bytes, mediaType);
  const protectedBytes = protectDocument(bytes);
  const result = await extractContract(bytes, mediaType),
    id = randomUUID();
  await db.transaction(async (tx) => {
    await ownBusiness(tx, bid, owner, true);
    await tx.query(
      "INSERT INTO contract_scans(id,business_id,media_type,document,draft,provider,status) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        id,
        bid,
        mediaType,
        protectedBytes,
        JSON.stringify(result.draft),
        result.provider,
        result.status,
      ],
    );
  });
  return { id, ...result, requiresConfirmation: true };
}
export async function scanDetail(sql: Sql, id: string, owner: string) {
  return (
    (
      await sql.query<{
        id: string;
        business_id: string;
        media_type: string;
        draft: unknown;
        status: string;
        provider: string;
      }>(
        "SELECT s.id,s.business_id,s.media_type,s.draft,s.status,s.provider FROM contract_scans s JOIN businesses b ON b.id=s.business_id WHERE s.id=$1 AND b.owner_id=$2",
        [id, owner],
      )
    )[0] ?? notFound()
  );
}
export async function scanDocument(sql: Sql, id: string, owner: string) {
  await scanDetail(sql, id, owner);
  const r =
    (
      await sql.query<{ document: Uint8Array; media_type: string }>(
        "SELECT document,media_type FROM contract_scans WHERE id=$1",
        [id],
      )
    )[0] ?? notFound();
  return { bytes: revealDocument(Buffer.from(r.document)), mediaType: r.media_type };
}
export async function confirmScan(
  db: Database,
  id: string,
  owner: string,
  details: EmployeeDetails,
) {
  return db.transaction(async (tx) => {
    const scan = await scanDetail(tx, id, owner),
      b = await ownBusiness(tx, scan.business_id, owner, true);
    const s = await scanDetail(tx, id, owner);
    if (s.status === "CONFIRMED") {
      const existing = (
        await tx.query<{ id: string }>("SELECT id FROM employees WHERE scan_id=$1", [id])
      )[0];
      return existing ?? notFound();
    }
    const eid = randomUUID();
    await tx.query("INSERT INTO employees(id,business_id,scan_id,details) VALUES($1,$2,$3,$4)", [
      eid,
      b.id,
      id,
      JSON.stringify(details),
    ]);
    await tx.query("UPDATE contract_scans SET status='CONFIRMED',draft=$1 WHERE id=$2", [
      JSON.stringify(details),
      id,
    ]);
    await tx.query("UPDATE businesses SET revision=revision+1,updated_at=now() WHERE id=$1", [
      b.id,
    ]);
    await evaluateWorkspaceIn(tx, { ...b, revision: b.revision + 1 });
    return { id: eid };
  });
}
export async function deleteScan(db: Database, id: string, owner: string) {
  await db.transaction(async (tx) => {
    const s = await scanDetail(tx, id, owner);
    await ownBusiness(tx, s.business_id, owner, true);
    if ((await scanDetail(tx, id, owner)).status === "CONFIRMED")
      throw new AppError(409, "확인한 직원은 직원 상세에서 관리하세요.");
    await tx.query("DELETE FROM contract_scans WHERE id=$1", [id]);
  });
}

type CurrentResult = ReturnType<typeof evaluateCurrent>;
type EvaluationRow = {
  id: string;
  result: CurrentResult;
  input_hash: string;
  ruleset_hash: string;
  revision: number;
};
export async function evaluateWorkspaceIn(tx: Sql, b: BusinessRow) {
  const profile = await getProfile(tx, b.owner_id);
  const facts = currentFacts(
      b.facts,
      await countEmployees(tx, b.id),
      profile.profile?.birthDate ?? null,
    ),
    policies = await getPolicies(tx),
    basisDate = seoulDate();
  const input = {
    facts,
    basisDate,
    industry: b.facts.industry,
    region: b.facts.region,
    businessType: b.facts.businessType,
  };
  const inputHash = hash(input),
    rulesHash = hash(policies);
  const last = (
    await tx.query<EvaluationRow>(
      "SELECT * FROM workspace_evaluations WHERE business_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1",
      [b.id],
    )
  )[0];
  if (
    last &&
    last.input_hash === inputHash &&
    last.ruleset_hash === rulesHash &&
    last.revision === b.revision
  )
    return last;
  const result = evaluateCurrent(policies, facts, getConfig().demo, basisDate),
    id = randomUUID();
  await tx.query(
    "INSERT INTO workspace_evaluations(id,business_id,revision,input_snapshot,rules_snapshot,input_hash,ruleset_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      id,
      b.id,
      b.revision,
      JSON.stringify(input),
      JSON.stringify(policies),
      inputHash,
      rulesHash,
      JSON.stringify(result),
    ],
  );
  for (const p of result.filter(
    (r) =>
      r.kind === "BENEFIT" &&
      r.status === "MATCH" &&
      !last?.result.some((old) => old.policyId === r.policyId && old.status === "MATCH"),
  )) {
    await queueWorkspaceNotice(
      tx,
      b,
      "NEW_BENEFIT",
      `policy:${p.policyVersionId}`,
      new Date(),
      { title: p.title, path: `/benefits/${p.policyId}` },
      { policyVersionId: p.policyVersionId },
    );
  }
  return { id, result, input_hash: inputHash, ruleset_hash: rulesHash, revision: b.revision };
}
export async function evaluateWorkspace(db: Database, bid: string, owner: string) {
  return db.transaction(async (tx) =>
    evaluateWorkspaceIn(tx, await ownBusiness(tx, bid, owner, true)),
  );
}
export async function eligibleBenefits(db: Database, bid: string, owner: string) {
  const b = await ownBusiness(db, bid, owner),
    policies = await getPolicies(db);
  const e = (
    await db.query<EvaluationRow & { revision: number; input_snapshot: { basisDate: string } }>(
      "SELECT * FROM workspace_evaluations WHERE business_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1",
      [bid],
    )
  )[0];
  const stale =
    !e ||
    e.revision !== b.revision ||
    e.input_snapshot.basisDate !== seoulDate() ||
    e.ruleset_hash !== hash(policies);
  const allProjects = await projects(db, bid, owner);
  return {
    evaluationId: e?.id ?? null,
    needsReevaluation: stale,
    benefits: stale
      ? []
      : e.result
          .filter((r) => r.kind === "BENEFIT" && r.status === "MATCH")
          .map((r) => {
            const policy = policies.find((p) => p.policyId === r.policyId);
            const project = allProjects.find(
              (p) =>
                p.project.policy_id === r.policyId && p.project.cycle_key === policy?.effectiveFrom,
            );
            return {
              ...r,
              projectId: project?.project.id ?? null,
              progress: project?.progress ?? null,
              workflowStatus: project
                ? project.complete
                  ? "COMPLETED"
                  : "IN_PROGRESS"
                : "NOT_STARTED",
            };
          }),
    completed: allProjects.filter((p) => p.complete),
    isEligibilityGuarantee: false,
  };
}
export async function projectDetail(sql: Sql, id: string, owner: string) {
  const project =
    (
      await sql.query<{
        id: string;
        business_id: string;
        policy_id: string;
        title: string;
        cycle_key: string;
      }>(
        "SELECT p.* FROM benefit_projects p JOIN businesses b ON b.id=p.business_id WHERE p.id=$1 AND b.owner_id=$2",
        [id, owner],
      )
    )[0] ?? notFound();
  const steps = await sql.query<{
    id: string;
    done: boolean;
    deadline: string | null;
    deadline_revision: number;
    guide: unknown;
  }>(
    "SELECT *,deadline::text AS deadline FROM project_steps WHERE project_id=$1 ORDER BY position",
    [id],
  );
  const completed = steps.filter((s) => s.done).length;
  return {
    project,
    steps,
    completed,
    total: steps.length,
    progress: steps.length ? Math.round((completed / steps.length) * 100) : 0,
    complete: steps.length > 0 && completed === steps.length,
  };
}
export async function benefitDetail(db: Database, bid: string, owner: string, policyId: string) {
  const available = await eligibleBenefits(db, bid, owner);
  const active = available.benefits.find((p) => p.policyId === policyId);
  const old = (await projects(db, bid, owner)).find((p) => p.project.policy_id === policyId);
  if (!active && !old) notFound();
  const policy = (await getPolicies(db)).find((p) => p.policyId === policyId) ?? notFound();
  return {
    policy,
    eligibility: active ? "MATCH" : "RECHECK_REQUIRED",
    project: old ?? null,
    needsReevaluation: available.needsReevaluation,
  };
}
export async function projects(db: Sql, bid: string, owner: string) {
  await ownBusiness(db, bid, owner);
  const rows = await db.query<{ id: string }>(
    "SELECT id FROM benefit_projects WHERE business_id=$1 ORDER BY created_at DESC",
    [bid],
  );
  return Promise.all(rows.map((r) => projectDetail(db, r.id, owner)));
}
export async function startProject(db: Database, bid: string, owner: string, policyId: string) {
  return db.transaction(async (tx) => {
    const b = await ownBusiness(tx, bid, owner, true),
      policies = await getPolicies(tx),
      policy = policies.find((p) => p.policyId === policyId && p.kind === "BENEFIT") ?? notFound();
    const cycle = policy.effectiveFrom;
    const existing = (
      await tx.query<{ id: string }>(
        "SELECT id FROM benefit_projects WHERE business_id=$1 AND policy_id=$2 AND cycle_key=$3",
        [bid, policyId, cycle],
      )
    )[0];
    if (existing) return { id: existing.id };
    const e = await evaluateWorkspaceIn(tx, b);
    if (!e.result.some((r) => r.policyId === policyId && r.status === "MATCH"))
      throw new AppError(409, "현재 신청 조건이 확인되지 않았습니다.");
    if (!policy.definition.tasks.length)
      throw new AppError(409, "검수된 신청 절차가 아직 없습니다.");
    const id = randomUUID();
    await tx.query(
      "INSERT INTO benefit_projects(id,business_id,policy_id,policy_version_id,evaluation_id,cycle_key,title) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [id, bid, policyId, policy.id, e.id, cycle, policy.title],
    );
    for (const [i, step] of policy.definition.tasks.entries()) {
      const sid = randomUUID(),
        date =
          step.deadlineKind === "PREPARATION" && step.offsetDays !== null
            ? addDays(seoulDate(), step.offsetDays)
            : null;
      await tx.query(
        "INSERT INTO project_steps(id,project_id,position,title,guide,deadline) VALUES($1,$2,$3,$4,$5,$6)",
        [sid, id, i, step.title, JSON.stringify(step), date],
      );
      if (date) await scheduleStep(tx, b, sid, 1, step.title, date, id);
    }
    return { id };
  });
}
export async function changeProjectStep(
  db: Database,
  id: string,
  owner: string,
  input: { done?: boolean; deadline?: string | null },
) {
  return db.transaction(async (tx) => {
    const s =
      (
        await tx.query<{ project_id: string; business_id: string }>(
          "SELECT s.project_id,p.business_id FROM project_steps s JOIN benefit_projects p ON p.id=s.project_id JOIN businesses b ON b.id=p.business_id WHERE s.id=$1 AND b.owner_id=$2",
          [id, owner],
        )
      )[0] ?? notFound();
    const b = await ownBusiness(tx, s.business_id, owner, true);
    const rows = await tx.query<{
      done: boolean;
      deadline: string | null;
      deadline_revision: number;
      title: string;
    }>(
      "UPDATE project_steps SET done=COALESCE($1,done),deadline=CASE WHEN $2 THEN $3::date ELSE deadline END,deadline_revision=deadline_revision+1 WHERE id=$4 RETURNING *,deadline::text AS deadline",
      [input.done ?? null, "deadline" in input, input.deadline ?? null, id],
    );
    await tx.query(
      "UPDATE workspace_notifications SET status='CANCELLED' WHERE project_step_id=$1 AND status='PENDING'",
      [id],
    );
    const step = rows[0];
    if (!step.done && step.deadline)
      await scheduleStep(
        tx,
        b,
        id,
        step.deadline_revision,
        step.title,
        step.deadline,
        s.project_id,
      );
    return projectDetail(tx, s.project_id, owner);
  });
}
async function scheduleStep(
  tx: Sql,
  b: BusinessRow,
  id: string,
  revision: number,
  title: string,
  date: string,
  projectId: string,
) {
  for (const days of [7, 3]) {
    const at = seoulMorning(addDays(date, -days));
    if (at > new Date())
      await queueWorkspaceNotice(
        tx,
        b,
        "PROJECT_DEADLINE",
        `step:${id}:${revision}:D-${days}`,
        at,
        { title, path: `/projects/${projectId}`, deadline: date },
        { stepId: id, revision },
      );
  }
  if (date >= seoulDate() && seoulMorning(addDays(date, -3)) <= new Date()) {
    await queueWorkspaceNotice(
      tx,
      b,
      "PROJECT_DEADLINE",
      `step:${id}:${revision}:DUE_SOON`,
      new Date(),
      { title, path: `/projects/${projectId}`, deadline: date },
      { stepId: id, revision },
    );
  }
}
type NoticeRef = {
  stepId?: string;
  occurrenceId?: string;
  policyVersionId?: string;
  revision?: number;
};
export async function queueWorkspaceNotice(
  tx: Sql,
  b: BusinessRow,
  kind: string,
  key: string,
  at: Date,
  payload: { title: string; path: string; deadline?: string },
  ref: NoticeRef = {},
) {
  const p = (await getProfile(tx, b.owner_id)).profile;
  if (p?.emailAlerts) {
    const channel = "EMAIL";
    await tx.query(
      "INSERT INTO workspace_notifications(id,business_id,kind,channel,dedupe_key,scheduled_at,payload,project_step_id,occurrence_id,policy_version_id,resource_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(dedupe_key) DO UPDATE SET status='PENDING',scheduled_at=EXCLUDED.scheduled_at WHERE workspace_notifications.status='CANCELLED'",
      [
        randomUUID(),
        b.id,
        kind,
        channel,
        `${b.id}:${channel}:${key}`,
        at,
        JSON.stringify(payload),
        ref.stepId ?? null,
        ref.occurrenceId ?? null,
        ref.policyVersionId ?? null,
        ref.revision ?? null,
      ],
    );
  }
}
export async function createDocument(
  db: Database,
  bid: string,
  owner: string,
  input: RecurringDocument,
) {
  return db.transaction(async (tx) => {
    const b = await ownBusiness(tx, bid, owner, true),
      id = randomUUID();
    await tx.query(
      "INSERT INTO recurring_documents(id,business_id,title,anchor_date,frequency,lead_days,url,memo,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        id,
        bid,
        input.title,
        input.anchorDate,
        input.frequency,
        input.leadDays,
        input.url,
        input.memo,
        input.enabled,
      ],
    );
    await makeOccurrence(tx, b, id, input, 0, 1);
    return { id };
  });
}
async function makeOccurrence(
  tx: Sql,
  b: BusinessRow,
  id: string,
  d: RecurringDocument,
  index: number,
  revision: number,
) {
  const date = occurrenceDate(d.anchorDate, d.frequency, index);
  const occurrence = (
    await tx.query<{ id: string; done: boolean }>(
      "INSERT INTO document_occurrences(id,document_id,due_date) VALUES($1,$2,$3) ON CONFLICT(document_id,due_date) DO UPDATE SET due_date=EXCLUDED.due_date RETURNING id,done",
      [randomUUID(), id, date],
    )
  )[0];
  if (d.enabled && !occurrence.done)
    await queueWorkspaceNotice(
      tx,
      b,
      "DOCUMENT_DEADLINE",
      `document:${occurrence.id}:${revision}`,
      seoulMorning(addDays(date, -d.leadDays)),
      { title: d.title, path: `/schedule?document=${id}`, deadline: date },
      { occurrenceId: occurrence.id, revision },
    );
  return occurrence;
}
export async function documents(sql: Sql, bid: string, owner: string) {
  await ownBusiness(sql, bid, owner);
  return sql.query(
    "SELECT d.*,d.anchor_date::text AS anchor_date,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'dueDate',o.due_date::text,'done',o.done) ORDER BY o.due_date) FROM document_occurrences o WHERE o.document_id=d.id),'[]'::jsonb) AS occurrences FROM recurring_documents d WHERE business_id=$1 ORDER BY d.created_at",
    [bid],
  );
}
async function ownDocument(sql: Sql, id: string, owner: string) {
  return (
    (
      await sql.query<{
        id: string;
        business_id: string;
        title: string;
        anchor_date: string;
        frequency: RecurringDocument["frequency"];
        lead_days: number;
        url: string | null;
        memo: string | null;
        enabled: boolean;
        revision: number;
      }>(
        "SELECT d.*,d.anchor_date::text AS anchor_date FROM recurring_documents d JOIN businesses b ON b.id=d.business_id WHERE d.id=$1 AND b.owner_id=$2",
        [id, owner],
      )
    )[0] ?? notFound()
  );
}
export async function updateDocument(
  db: Database,
  id: string,
  owner: string,
  d: RecurringDocument,
) {
  return db.transaction(async (tx) => {
    const old = await ownDocument(tx, id, owner),
      b = await ownBusiness(tx, old.business_id, owner, true);
    const current = await ownDocument(tx, id, owner);
    await tx.query(
      "UPDATE recurring_documents SET title=$1,anchor_date=$2,frequency=$3,lead_days=$4,url=$5,memo=$6,enabled=$7,revision=revision+1 WHERE id=$8",
      [d.title, d.anchorDate, d.frequency, d.leadDays, d.url, d.memo, d.enabled, id],
    );
    await tx.query(
      "UPDATE workspace_notifications SET status='CANCELLED' WHERE status='PENDING' AND occurrence_id IN (SELECT id FROM document_occurrences WHERE document_id=$1)",
      [id],
    );
    await makeOccurrence(tx, b, id, d, 0, current.revision + 1);
    await refreshBusinessSchedules(tx, b);
  });
}
export async function completeOccurrence(db: Database, id: string, owner: string) {
  return db.transaction(async (tx) => {
    const r =
      (
        await tx.query<{ document_id: string; due_date: string; done: boolean }>(
          "SELECT o.*,o.due_date::text AS due_date FROM document_occurrences o JOIN recurring_documents d ON d.id=o.document_id JOIN businesses b ON b.id=d.business_id WHERE o.id=$1 AND b.owner_id=$2",
          [id, owner],
        )
      )[0] ?? notFound();
    const initial = await ownDocument(tx, r.document_id, owner),
      b = await ownBusiness(tx, initial.business_id, owner, true);
    const d = await ownDocument(tx, r.document_id, owner);
    const locked = (
      await tx.query<{ done: boolean }>("SELECT done FROM document_occurrences WHERE id=$1", [id])
    )[0];
    if (locked.done) return { ok: true };
    await tx.query("UPDATE document_occurrences SET done=true WHERE id=$1", [id]);
    await tx.query(
      "UPDATE workspace_notifications SET status='CANCELLED' WHERE occurrence_id=$1 AND status='PENDING'",
      [id],
    );
    let i = 0;
    while (i < 10000 && occurrenceDate(d.anchor_date, d.frequency, i) <= r.due_date) i++;
    if (i >= 10000) throw new AppError(422, "반복 일정 범위를 초과했습니다.");
    return makeOccurrence(
      tx,
      b,
      d.id,
      {
        title: d.title,
        anchorDate: d.anchor_date,
        frequency: d.frequency,
        leadDays: d.lead_days,
        url: d.url,
        memo: d.memo,
        enabled: d.enabled,
      },
      i,
      d.revision,
    );
  });
}
export async function deleteDocument(db: Database, id: string, owner: string) {
  await db.transaction(async (tx) => {
    const d = await ownDocument(tx, id, owner);
    await ownBusiness(tx, d.business_id, owner, true);
    await tx.query("DELETE FROM recurring_documents WHERE id=$1", [id]);
  });
}
export async function dashboard(db: Database, bid: string, owner: string) {
  const benefits = await eligibleBenefits(db, bid, owner),
    all = await projects(db, bid, owner);
  return {
    eligibleBenefits: benefits.benefits.length,
    projects: all
      .filter((p) => !p.complete)
      .map((p) => ({
        ...p,
        eligibility: benefits.benefits.some((b) => b.policyId === p.project.policy_id)
          ? "MATCH"
          : "RECHECK_REQUIRED",
      })),
    completedProjects: all.filter((p) => p.complete).length,
    documents: await documents(db, bid, owner),
  };
}
export async function refreshBusinessSchedules(tx: Sql, b: BusinessRow) {
  const steps = await tx.query<{
    id: string;
    title: string;
    deadline: string;
    deadline_revision: number;
    project_id: string;
  }>(
    "SELECT s.id,s.title,s.deadline::text AS deadline,s.deadline_revision,s.project_id FROM project_steps s JOIN benefit_projects p ON p.id=s.project_id WHERE p.business_id=$1 AND s.done=false AND s.deadline >= $2::date",
    [b.id, seoulDate()],
  );
  for (const s of steps)
    await scheduleStep(tx, b, s.id, s.deadline_revision, s.title, s.deadline, s.project_id);
  const docs = await tx.query<{ id: string }>(
    "SELECT id FROM recurring_documents WHERE business_id=$1 AND enabled=true",
    [b.id],
  );
  for (const row of docs) {
    const d = await ownDocument(tx, row.id, b.owner_id);
    let i = 0;
    while (i < 10000 && occurrenceDate(d.anchor_date, d.frequency, i) < seoulDate()) i++;
    for (let attempts = 0; attempts < 2 && i < 10000; attempts++, i++) {
      const o = await makeOccurrence(
        tx,
        b,
        d.id,
        {
          title: d.title,
          anchorDate: d.anchor_date,
          frequency: d.frequency,
          leadDays: d.lead_days,
          url: d.url,
          memo: d.memo,
          enabled: d.enabled,
        },
        i,
        d.revision,
      );
      if (!o.done) break;
    }
  }
}

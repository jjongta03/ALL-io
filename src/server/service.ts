import { randomUUID } from "node:crypto";
import {
  type BusinessInput,
  type Definition,
  type Evaluation,
  type HireInput,
  type PolicyVersion,
  definitionSchema,
} from "@/domain/contracts";
import { evaluatePlan, validateDefinition } from "@/domain/engine";
import { hash, meaningfulHash } from "./hashing";
import { addDays, reminderSchedule } from "@/domain/dates";
import { type Database, type Sql } from "./db";
import { getConfig } from "./config";
import { AppError, notFound } from "./errors";
import { isAllowedSource } from "@/integrations/providers";
import type { ReviewAssessment } from "@/domain/review-routing";

export type PlanRow = {
  id: string;
  business_id: string;
  owner_id: string;
  before_snapshot: BusinessInput;
  proposed_change: HireInput;
  input_revision: number;
  status: "DRAFT" | "ACTIVE" | "CANCELLED";
  email_alerts: boolean;
  created_at: string;
};
export type TaskRow = {
  id: string;
  plan_id: string;
  stable_key: string;
  title: string;
  status: "TODO" | "DONE" | "NEEDS_REVIEW" | "RETIRED";
  deadline_kind: "PREPARATION" | "NEEDS_CONFIRMATION";
  deadline_date: string | null;
  deadline_version: number;
  guide: { description: string; destination: string; url: string };
  policy_version_id: string;
};
export type EvaluationRow = {
  id: string;
  input_revision: number;
  result: Evaluation;
  meaningful_hash: string;
  input_hash: string;
  ruleset_hash: string;
};
export async function getPolicies(sql: Sql): Promise<PolicyVersion[]> {
  const rows = await sql.query<{
    id: string;
    policy_id: string;
    title: string;
    kind: PolicyVersion["kind"];
    version: number;
    status: PolicyVersion["status"];
    is_demo: boolean;
    effective_from: string;
    effective_to: string | null;
    verified_at: string | null;
    definition: Definition;
  }>(
    "SELECT v.*,v.effective_from::text AS effective_from,v.effective_to::text AS effective_to,p.title,p.kind FROM policies p JOIN policy_versions v ON v.id=p.active_version_id ORDER BY p.slug",
  );
  return rows.map((r) => ({
    id: r.id,
    policyId: r.policy_id,
    title: r.title,
    kind: r.kind,
    version: r.version,
    status: r.status,
    isDemo: r.is_demo,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    verifiedAt: r.verified_at,
    definition: r.definition,
  }));
}
export async function ownPlan(
  sql: Sql,
  planId: string,
  ownerId: string,
  forUpdate = false,
): Promise<PlanRow> {
  const rows = await sql.query<PlanRow>(
    `SELECT * FROM change_plans WHERE id=$1 AND owner_id=$2${forUpdate ? " FOR UPDATE" : ""}`,
    [planId, ownerId],
  );
  return rows[0] ?? notFound();
}
export async function listPlans(sql: Sql, ownerId: string) {
  return sql.query<PlanRow & { result: Evaluation | null }>(
    "SELECT p.*,e.result FROM change_plans p LEFT JOIN LATERAL (SELECT result FROM evaluations WHERE plan_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1) e ON true WHERE p.owner_id=$1 ORDER BY p.created_at DESC",
    [ownerId],
  );
}
export async function planDetail(sql: Sql, planId: string, ownerId: string) {
  const plan = await ownPlan(sql, planId, ownerId);
  const evaluations = await sql.query<EvaluationRow>(
    "SELECT * FROM evaluations WHERE plan_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1",
    [plan.id],
  );
  const tasks = await sql.query<TaskRow>(
    "SELECT t.*,t.deadline_date::text AS deadline_date FROM plan_tasks t WHERE t.plan_id=$1 AND t.status<>'RETIRED' ORDER BY t.deadline_date NULLS LAST,t.title",
    [plan.id],
  );
  return { plan, evaluation: evaluations[0] ?? null, tasks };
}
export async function createPlan(
  db: Database,
  ownerId: string,
  business: BusinessInput,
  hire: HireInput,
) {
  return db.transaction(async (tx) => {
    const businessId = randomUUID(),
      planId = randomUUID();
    await tx.query("INSERT INTO businesses(id,owner_id,facts) VALUES($1,$2,$3)", [
      businessId,
      ownerId,
      JSON.stringify(business),
    ]);
    await tx.query(
      "INSERT INTO change_plans(id,business_id,owner_id,before_snapshot,proposed_change,status) VALUES($1,$2,$3,$4,$5,'ACTIVE')",
      [planId, businessId, ownerId, JSON.stringify(business), JSON.stringify(hire)],
    );
    const plan = await ownPlan(tx, planId, ownerId, true);
    await evaluateIn(tx, plan);
    return planId;
  });
}
export async function updatePlan(db: Database, planId: string, ownerId: string, hire: HireInput) {
  return db.transaction(async (tx) => {
    const plan = await ownPlan(tx, planId, ownerId, true);
    if (plan.status === "CANCELLED") throw new AppError(409, "취소된 계획은 수정할 수 없습니다.");
    await tx.query(
      "UPDATE change_plans SET proposed_change=$1,input_revision=input_revision+1,updated_at=now() WHERE id=$2",
      [JSON.stringify(hire), planId],
    );
    await evaluateIn(tx, {
      ...plan,
      proposed_change: hire,
      input_revision: plan.input_revision + 1,
    });
  });
}
async function evaluateIn(tx: Sql, plan: PlanRow) {
  const policies = await getPolicies(tx);
  const result = evaluatePlan(
    plan.before_snapshot,
    plan.proposed_change,
    policies,
    getConfig().demo,
  );
  const input = { business: plan.before_snapshot, hire: plan.proposed_change };
  const inputHash = hash(input),
    rulesetHash = hash(
      policies.map((p) => ({ id: p.id, status: p.status, definition: p.definition })),
    );
  const previous = (
    await tx.query<EvaluationRow>(
      "SELECT * FROM evaluations WHERE plan_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1",
      [plan.id],
    )
  )[0];
  if (previous?.input_hash === inputHash && previous.ruleset_hash === rulesetHash) return previous;
  const id = randomUUID();
  const meaningful = meaningfulHash(result);
  await tx.query(
    "INSERT INTO evaluations(id,plan_id,input_revision,input_snapshot,input_hash,ruleset_hash,meaningful_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      id,
      plan.id,
      plan.input_revision,
      JSON.stringify(input),
      inputHash,
      rulesetHash,
      meaningful,
      JSON.stringify(result),
    ],
  );
  await syncTasks(tx, plan, result);
  if (
    previous &&
    previous.meaningful_hash !== meaningful &&
    plan.email_alerts &&
    plan.status === "ACTIVE"
  ) {
    await tx.query(
      "INSERT INTO notification_jobs(id,plan_id,evaluation_id,type,dedupe_key,scheduled_at,payload) VALUES($1,$2,$3,'POLICY_CHANGE',$4,now(),$5) ON CONFLICT(dedupe_key) DO NOTHING",
      [
        randomUUID(),
        plan.id,
        id,
        `${plan.id}:change:${id}`,
        JSON.stringify({
          title: "저장한 채용 계획의 안내가 변경되었습니다.",
          path: `/plans/${plan.id}`,
        }),
      ],
    );
  }
  return {
    id,
    input_revision: plan.input_revision,
    input_hash: inputHash,
    ruleset_hash: rulesetHash,
    meaningful_hash: meaningful,
    result,
  };
}
async function syncTasks(tx: Sql, plan: PlanRow, result: Evaluation) {
  const activeKeys: string[] = [];
  for (const rule of result.all)
    for (const template of rule.tasks) {
      const key = `${rule.policyId}:${template.key}`;
      activeKeys.push(key);
      const deadline =
        template.deadlineKind === "PREPARATION" && template.offsetDays !== null
          ? addDays(plan.proposed_change.startDate, template.offsetDays)
          : null;
      const guide = {
        description: template.description,
        destination: template.destination,
        url: template.url,
      };
      await tx.query(
        `INSERT INTO plan_tasks(id,plan_id,stable_key,policy_version_id,title,guide,deadline_kind,deadline_date)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(plan_id,stable_key) DO UPDATE SET
      status=CASE WHEN plan_tasks.status='RETIRED' THEN 'TODO' WHEN plan_tasks.guide IS DISTINCT FROM EXCLUDED.guide AND plan_tasks.status='DONE' THEN 'NEEDS_REVIEW' ELSE plan_tasks.status END,
      deadline_version=CASE WHEN plan_tasks.deadline_date IS DISTINCT FROM EXCLUDED.deadline_date OR plan_tasks.guide IS DISTINCT FROM EXCLUDED.guide THEN plan_tasks.deadline_version+1 ELSE plan_tasks.deadline_version END,
      policy_version_id=EXCLUDED.policy_version_id,title=EXCLUDED.title,guide=EXCLUDED.guide,deadline_kind=EXCLUDED.deadline_kind,deadline_date=EXCLUDED.deadline_date,updated_at=now()`,
        [
          randomUUID(),
          plan.id,
          key,
          rule.policyVersionId,
          template.title,
          JSON.stringify(guide),
          template.deadlineKind,
          deadline,
        ],
      );
    }
  const oldTasks = await tx.query<TaskRow>(
    "SELECT *,deadline_date::text AS deadline_date FROM plan_tasks WHERE plan_id=$1",
    [plan.id],
  );
  for (const t of oldTasks)
    if (!activeKeys.includes(t.stable_key))
      await tx.query("UPDATE plan_tasks SET status='RETIRED',updated_at=now() WHERE id=$1", [t.id]);
  await scheduleTasks(tx, plan);
}
export async function scheduleTasks(tx: Sql, plan: PlanRow, now = new Date()) {
  const tasks = await tx.query<TaskRow>(
    "SELECT *,deadline_date::text AS deadline_date FROM plan_tasks WHERE plan_id=$1",
    [plan.id],
  );
  for (const task of tasks) {
    await tx.query(
      "UPDATE notification_jobs SET status='CANCELLED' WHERE task_id=$1 AND status='PENDING' AND (deadline_version<>$2 OR $3::boolean OR type NOT IN ('D-7','D-3'))",
      [
        task.id,
        task.deadline_version,
        !plan.email_alerts ||
          plan.status !== "ACTIVE" ||
          task.status === "DONE" ||
          task.status === "RETIRED",
      ],
    );
    if (
      !plan.email_alerts ||
      plan.status !== "ACTIVE" ||
      !task.deadline_date ||
      task.status === "DONE" ||
      task.status === "RETIRED"
    )
      continue;
    for (const reminder of reminderSchedule(task.deadline_date, now)) {
      const key = `${plan.id}:${task.id}:${task.deadline_version}:${reminder.type}`;
      await tx.query(
        "INSERT INTO notification_jobs(id,plan_id,task_id,type,dedupe_key,deadline_version,scheduled_at,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(dedupe_key) DO UPDATE SET status=CASE WHEN notification_jobs.status='CANCELLED' THEN 'PENDING' ELSE notification_jobs.status END",
        [
          randomUUID(),
          plan.id,
          task.id,
          reminder.type,
          key,
          task.deadline_version,
          reminder.scheduledAt,
          JSON.stringify({
            title: task.title,
            deadline: task.deadline_date,
            deadlineKind: task.deadline_kind,
            path: `/plans/${plan.id}`,
          }),
        ],
      );
    }
  }
}
export async function setAlerts(db: Database, planId: string, ownerId: string, enabled: boolean) {
  return db.transaction(async (tx) => {
    const plan = await ownPlan(tx, planId, ownerId, true);
    if (enabled && plan.status === "CANCELLED")
      throw new AppError(409, "취소한 계획에는 알림을 켤 수 없습니다.");
    await tx.query(
      "UPDATE change_plans SET email_alerts=$1,consent_at=CASE WHEN $1 THEN now() ELSE consent_at END WHERE id=$2",
      [enabled, planId],
    );
    if (!enabled)
      await tx.query(
        "UPDATE notification_jobs SET status='CANCELLED' WHERE plan_id=$1 AND status='PENDING'",
        [planId],
      );
    await scheduleTasks(tx, { ...plan, email_alerts: enabled });
  });
}
export async function setTaskStatus(db: Database, taskId: string, ownerId: string, done: boolean) {
  return db.transaction(async (tx) => {
    const rows = await tx.query<{ plan_id: string }>(
      "SELECT t.plan_id FROM plan_tasks t JOIN change_plans p ON p.id=t.plan_id WHERE t.id=$1 AND p.owner_id=$2 AND p.status='ACTIVE' AND t.status<>'RETIRED' FOR UPDATE OF p,t",
      [taskId, ownerId],
    );
    if (!rows[0]) return notFound();
    await tx.query("UPDATE plan_tasks SET status=$1,updated_at=now() WHERE id=$2", [
      done ? "DONE" : "TODO",
      taskId,
    ]);
    await scheduleTasks(tx, await ownPlan(tx, rows[0].plan_id, ownerId));
  });
}
export async function cancelPlan(db: Database, id: string, ownerId: string) {
  await db.transaction(async (tx) => {
    await ownPlan(tx, id, ownerId, true);
    await tx.query(
      "UPDATE change_plans SET status='CANCELLED',email_alerts=false,updated_at=now() WHERE id=$1",
      [id],
    );
    await tx.query(
      "UPDATE notification_jobs SET status='CANCELLED' WHERE plan_id=$1 AND status='PENDING'",
      [id],
    );
  });
}
export async function listReviews(sql: Sql) {
  return sql.query<{
    id: string;
    reason: string;
    status: string;
    priority: number;
    title: string;
    policy_id: string;
    version: number;
    definition: Definition;
    previous_definition: Definition | null;
    is_demo: boolean;
    assessment: ReviewAssessment | null;
  }>(
    "SELECT r.*,p.title,p.id AS policy_id,v.version,v.definition,v.is_demo,b.definition AS previous_definition,a.assessment FROM review_items r JOIN policy_versions v ON v.id=r.draft_version_id JOIN policies p ON p.id=v.policy_id LEFT JOIN policy_versions b ON b.id=r.base_version_id LEFT JOIN LATERAL (SELECT assessment FROM review_assessments WHERE review_id=r.id ORDER BY created_at DESC,id DESC LIMIT 1) a ON true ORDER BY CASE WHEN r.status='PENDING' THEN 0 ELSE 1 END,r.priority,r.created_at DESC",
  );
}
export async function decideReview(
  db: Database,
  reviewId: string,
  actorId: string,
  decision: "approve" | "reject",
  revised?: Definition,
) {
  await db.transaction(async (tx) => {
    const rows = await tx.query<{
      draft_version_id: string;
      base_version_id: string | null;
      policy_id: string;
      active_version_id: string | null;
      status: string;
      definition: Definition;
      is_demo: boolean;
    }>(
      "SELECT r.draft_version_id,r.base_version_id,r.status,v.policy_id,v.definition,v.is_demo,p.active_version_id FROM review_items r JOIN policy_versions v ON v.id=r.draft_version_id JOIN policies p ON p.id=v.policy_id WHERE r.id=$1 FOR UPDATE OF r,p,v",
      [reviewId],
    );
    const item = rows[0] ?? notFound();
    if (item.status !== "PENDING" || item.active_version_id !== item.base_version_id)
      throw new AppError(
        409,
        "다른 검수로 버전이 변경되었습니다. 새로고침 후 비교하세요.",
        "REVIEW_CONFLICT",
      );
    const definition = revised ?? item.definition;
    if (decision === "approve") {
      const errors = validateDefinition(definition);
      if (errors.length) throw new AppError(422, errors.join(" / "));
      if (item.is_demo && !getConfig().demo)
        throw new AppError(422, "가상 규칙은 운영 환경에 게시할 수 없습니다.");
      if (!item.is_demo && !definition.sources.every((s) => s.verified))
        throw new AppError(422, "실제 규칙은 모든 공식 근거 구간의 검수 완료가 필요합니다.");
      if (!item.is_demo && !definition.sources.every((s) => isAllowedSource(s.url)))
        throw new AppError(422, "실제 규칙은 등록된 공식 도메인의 출처가 필요합니다.");
      await tx.query(
        "UPDATE policy_versions SET status='APPROVED',definition=$1,reviewer_id=$2,verified_at=now() WHERE id=$3",
        [JSON.stringify(definition), actorId, item.draft_version_id],
      );
      await tx.query("UPDATE policies SET active_version_id=$1 WHERE id=$2", [
        item.draft_version_id,
        item.policy_id,
      ]);
    } else
      await tx.query("UPDATE policy_versions SET status='REJECTED',reviewer_id=$1 WHERE id=$2", [
        actorId,
        item.draft_version_id,
      ]);
    await tx.query(
      "UPDATE review_items SET status=$1,reviewer_id=$2,reviewed_at=now() WHERE id=$3",
      [decision === "approve" ? "APPROVED" : "REJECTED", actorId, reviewId],
    );
    await tx.query(
      "INSERT INTO audit_events(id,actor_id,action,entity_id,metadata) VALUES($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        actorId,
        `review.${decision}`,
        reviewId,
        JSON.stringify({ version: item.draft_version_id }),
      ],
    );
    if (decision === "approve") {
      const plans = await tx.query<PlanRow>(
        "SELECT * FROM change_plans WHERE status='ACTIVE' ORDER BY id FOR UPDATE",
      );
      for (const plan of plans) await evaluateIn(tx, plan);
    }
  });
}
export async function changePublication(
  db: Database,
  policyId: string,
  actorId: string,
  action: "suspend" | "rollback",
) {
  await db.transaction(async (tx) => {
    const rows = await tx.query<{ active_version_id: string; version: number }>(
      "SELECT p.active_version_id,v.version FROM policies p JOIN policy_versions v ON v.id=p.active_version_id WHERE p.id=$1 FOR UPDATE OF p,v",
      [policyId],
    );
    const current = rows[0] ?? notFound();
    if (action === "suspend")
      await tx.query("UPDATE policy_versions SET status='SUSPENDED' WHERE id=$1", [
        current.active_version_id,
      ]);
    else {
      const previous = await tx.query<{ id: string }>(
        "SELECT id FROM policy_versions WHERE policy_id=$1 AND version<$2 AND status='APPROVED' ORDER BY version DESC LIMIT 1",
        [policyId, current.version],
      );
      if (!previous[0]) throw new AppError(409, "되돌릴 이전 승인 버전이 없습니다.");
      await tx.query("UPDATE policies SET active_version_id=$1 WHERE id=$2", [
        previous[0].id,
        policyId,
      ]);
    }
    await tx.query("INSERT INTO audit_events(id,actor_id,action,entity_id) VALUES($1,$2,$3,$4)", [
      randomUUID(),
      actorId,
      `policy.${action}`,
      policyId,
    ]);
    for (const plan of await tx.query<PlanRow>(
      "SELECT * FROM change_plans WHERE status='ACTIVE' ORDER BY id FOR UPDATE",
    ))
      await evaluateIn(tx, plan);
  });
}
export async function createPolicyDraft(
  db: Database,
  actorId: string,
  input: {
    title: string;
    kind: PolicyVersion["kind"];
    definition: Definition;
    effectiveFrom: string;
    effectiveTo: string | null;
  },
) {
  const definition = definitionSchema.parse(input.definition);
  const errors = validateDefinition(definition);
  if (errors.length) throw new AppError(422, errors.join(" / "));
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom)
    throw new AppError(422, "적용 종료일을 확인하세요.");
  return db.transaction(async (tx) => {
    const policy = randomUUID(),
      version = randomUUID(),
      review = randomUUID();
    await tx.query("INSERT INTO policies(id,slug,title,kind) VALUES($1,$2,$3,$4)", [
      policy,
      `custom-${policy}`,
      input.title,
      input.kind,
    ]);
    await tx.query(
      "INSERT INTO policy_versions(id,policy_id,version,status,definition,effective_from,effective_to,is_demo) VALUES($1,$2,1,'PENDING_REVIEW',$3,$4,$5,false)",
      [version, policy, JSON.stringify(definition), input.effectiveFrom, input.effectiveTo],
    );
    await tx.query("INSERT INTO review_items(id,draft_version_id,reason) VALUES($1,$2,$3)", [
      review,
      version,
      "운영자가 등록한 신규 제도 초안. 승인 전 사용자 판정에 포함되지 않습니다.",
    ]);
    await tx.query(
      "INSERT INTO audit_events(id,actor_id,action,entity_id) VALUES($1,$2,'policy.draft',$3)",
      [randomUUID(), actorId, policy],
    );
    return review;
  });
}

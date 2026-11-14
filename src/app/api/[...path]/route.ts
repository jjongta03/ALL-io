import { z } from "zod";
import { type NextRequest } from "next/server";
import { route, readJson, rateLimit } from "@/server/http";
import { getDb } from "@/server/db";
import { requireUser, startDemoSession, setSession, clearSession } from "@/server/auth";
import { businessSchema, hireSchema, definitionSchema, dateSchema } from "@/domain/contracts";
import {
  createPlan,
  updatePlan,
  planDetail,
  listPlans,
  setAlerts,
  setTaskStatus,
  cancelPlan,
  listReviews,
  decideReview,
  changePublication,
  createPolicyDraft,
  getPolicies,
  ownPlan,
} from "@/server/service";
import { simulationSchema, simulatePlan } from "@/domain/simulation";
import { assessReview } from "@/server/review-assessment";
import { integrationStatus, trackIntegration } from "@/server/integration-status";
import { supportAnswer, supportSchema } from "@/server/support";
import { AppError, notFound } from "@/server/errors";
import { randomUUID } from "node:crypto";
import { queueDemoMail, runJob } from "@/server/jobs";
import {
  checkBusinessStatus,
  searchOfficialSources,
  isAllowedSource,
} from "@/integrations/providers";
import { getConfig } from "@/server/config";
import { LinerRuleDraftGenerator } from "@/integrations/drafting";
import { authenticateAccount, loginSchema } from "@/server/accounts";
import { workspaceApi } from "@/server/workspace-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = (id: string) => z.string().uuid().parse(id);
const handler = route(async (req: NextRequest) => {
  const path = new URL(req.url).pathname.replace(/^\/api\/?/, "").split("/");
  const key = `${req.method} ${path.join("/")}`;
  if (key === "GET health") {
    await (await getDb()).query("SELECT 1");
    return { ok: true, app: "mawd-business-change", mode: getConfig().demo ? "demo" : "live" };
  }
  if (key === "POST demo") {
    rateLimit("demo", 50);
    await startDemoSession();
    return { ok: true };
  }
  if (key === "POST session") {
    rateLimit("login:global", 120);
    const body = await readJson(req, loginSchema);
    const user = await authenticateAccount(await getDb(), body);
    await setSession(user.id);
    return { ok: true };
  }
  if (key === "DELETE session") {
    await clearSession();
    return { ok: true };
  }
  const user = await requireUser(path[0] === "admin");
  const db = await getDb();
  if (path[0] === "v2") return workspaceApi(req, db, user, path.slice(1));
  if (key === "GET me") return { user };
  if (key === "POST support") {
    rateLimit(`support:${user.id}`, 50);
    return supportAnswer(db, user.id, await readJson(req, supportSchema));
  }
  if (key === "GET admin/integrations") return integrationStatus(db);
  if (key === "GET plans") return { plans: await listPlans(db, user.id) };
  if (key === "POST plans") {
    const body = await readJson(
      req,
      z.object({ business: businessSchema, hire: hireSchema }).strict(),
    );
    return { id: await createPlan(db, user.id, body.business, body.hire) };
  }
  if (path[0] === "plans" && path[1]) {
    const id = uuid(path[1]);
    if (path.length === 2 && req.method === "GET") return planDetail(db, id, user.id);
    if (path.length === 3 && path[2] === "simulate" && req.method === "POST") {
      const plan = await ownPlan(db, id, user.id);
      return simulatePlan(
        plan.before_snapshot,
        plan.proposed_change,
        await getPolicies(db),
        getConfig().demo,
        await readJson(req, simulationSchema),
      );
    }
    if (path.length === 2 && req.method === "PATCH") {
      await updatePlan(db, id, user.id, await readJson(req, hireSchema));
      return { ok: true };
    }
    if (path.length === 3 && path[2] === "alerts" && req.method === "PUT") {
      const b = await readJson(req, z.object({ enabled: z.boolean() }).strict());
      await setAlerts(db, id, user.id, b.enabled);
      return { ok: true };
    }
    if (path.length === 3 && path[2] === "cancel" && req.method === "POST") {
      await cancelPlan(db, id, user.id);
      return { ok: true };
    }
    if (path.length === 3 && path[2] === "test-mail" && req.method === "POST")
      return queueDemoMail(db, id, user.id);
  }
  if (path[0] === "tasks" && path.length === 2 && req.method === "PATCH") {
    const b = await readJson(req, z.object({ done: z.boolean() }).strict());
    await setTaskStatus(db, uuid(path[1]), user.id, b.done);
    return { ok: true };
  }
  if (key === "POST feedback") {
    const body = await readJson(
      req,
      z
        .object({ evaluationId: z.string().uuid(), message: z.string().trim().min(5).max(2000) })
        .strict(),
    );
    const own = await db.query(
      "SELECT e.id FROM evaluations e JOIN change_plans p ON p.id=e.plan_id WHERE e.id=$1 AND p.owner_id=$2",
      [body.evaluationId, user.id],
    );
    if (!own.length) return notFound();
    await db.query("INSERT INTO feedback(id,owner_id,evaluation_id,message) VALUES($1,$2,$3,$4)", [
      randomUUID(),
      user.id,
      body.evaluationId,
      body.message,
    ]);
    return { ok: true };
  }
  if (key === "GET outbox")
    return {
      mail: await db.query(
        "SELECT o.id,o.subject,o.body,o.created_at FROM outbox o JOIN notification_jobs j ON j.id=o.notification_id JOIN change_plans p ON p.id=j.plan_id WHERE p.owner_id=$1 ORDER BY o.created_at DESC LIMIT 50",
        [user.id],
      ),
    };
  if (key === "POST integrations/nts") {
    rateLimit(`nts:${user.id}`, 20);
    const b = await readJson(req, z.object({ number: z.string().regex(/^\d{10}$/) }).strict());
    return trackIntegration(db, "NTS", "status", () => checkBusinessStatus(b.number));
  }
  if (key === "GET admin/reviews") return { reviews: await listReviews(db) };
  if (
    path[0] === "admin" &&
    path[1] === "reviews" &&
    path.length === 4 &&
    path[3] === "assess" &&
    req.method === "POST"
  ) {
    rateLimit(`assess:${user.id}`, 20);
    return { assessment: await assessReview(db, uuid(path[2]), user.id) };
  }
  if (path[0] === "admin" && path[1] === "reviews" && path.length === 3 && req.method === "POST") {
    const b = await readJson(
      req,
      z
        .object({
          decision: z.enum(["approve", "reject"]),
          definition: definitionSchema.optional(),
        })
        .strict(),
    );
    await decideReview(db, uuid(path[2]), user.id, b.decision, b.definition);
    return { ok: true };
  }
  if (path[0] === "admin" && path[1] === "policies" && path.length === 4 && req.method === "POST") {
    const action = z.enum(["suspend", "rollback"]).parse(path[3]);
    await changePublication(db, uuid(path[2]), user.id, action);
    return { ok: true };
  }
  if (key === "POST admin/policies") {
    const b = await readJson(
      req,
      z
        .object({
          title: z.string().min(1).max(150),
          kind: z.enum(["BENEFIT", "CHANGE", "TASK"]),
          definition: definitionSchema,
          effectiveFrom: dateSchema,
          effectiveTo: dateSchema.nullable(),
        })
        .strict(),
    );
    return { reviewId: await createPolicyDraft(db, user.id, b) };
  }
  if (key === "POST admin/search") {
    rateLimit(`research:${user.id}`, 20);
    const b = await readJson(req, z.object({ query: z.string().trim().min(3).max(300) }).strict());
    return {
      results: await trackIntegration(db, "Liner", "search", () => searchOfficialSources(b.query)),
    };
  }
  if (key === "POST admin/draft") {
    rateLimit(`draft:${user.id}`, 10);
    const b = await readJson(req, z.object({ snapshotId: z.string().uuid() }).strict());
    const source =
      (
        await db.query<{ snapshotId: string; title: string; url: string; text: string }>(
          'SELECT sn.id AS "snapshotId",s.title,s.url,sn.normalized_text AS text FROM source_snapshots sn JOIN sources s ON s.id=sn.source_id WHERE sn.id=$1',
          [b.snapshotId],
        )
      )[0] ?? notFound();
    const suggestion = await trackIntegration(db, "Liner", "draft", () =>
      new LinerRuleDraftGenerator().suggest(source),
    );
    await db.query(
      "INSERT INTO audit_events(id,actor_id,action,entity_id) VALUES($1,$2,'draft.suggested',$3)",
      [randomUUID(), user.id, b.snapshotId],
    );
    return { suggestion, sourceSnapshotId: b.snapshotId, published: false };
  }
  if (key === "POST admin/jobs") {
    const b = await readJson(
      req,
      z.object({ kind: z.enum(["notifications", "collect"]) }).strict(),
    );
    return runJob(db, b.kind);
  }
  if (key === "POST admin/sources") {
    const b = await readJson(
      req,
      z.object({ title: z.string().min(1).max(200), url: z.string().url() }).strict(),
    );
    if (!isAllowedSource(b.url))
      throw new AppError(422, "허용된 공식 출처 주소만 등록할 수 있습니다.");
    await db.query(
      "INSERT INTO sources(id,url,title,collection_allowed) VALUES($1,$2,$3,true) ON CONFLICT(url) DO NOTHING",
      [randomUUID(), b.url, b.title],
    );
    return { ok: true };
  }
  if (key === "GET admin/operations")
    return {
      jobs: await db.query(
        "SELECT id,type,status,summary,last_error,created_at FROM job_runs ORDER BY created_at DESC LIMIT 20",
      ),
      feedback: await db.query(
        "SELECT id,message,status,created_at FROM feedback ORDER BY created_at DESC LIMIT 30",
      ),
      changes: await db.query(
        "SELECT c.*,s.title,s.url FROM source_changes c JOIN sources s ON s.id=c.source_id ORDER BY c.created_at DESC LIMIT 20",
      ),
      sources: await db.query(
        "SELECT id,title,url,last_success_at,last_error FROM sources ORDER BY title",
      ),
      policies: await getPoliciesForAdmin(),
    };
  return notFound();
});
async function getPoliciesForAdmin() {
  return (await getDb()).query(
    "SELECT p.id,p.title,v.version,v.status,v.is_demo FROM policies p LEFT JOIN policy_versions v ON v.id=p.active_version_id ORDER BY p.title",
  );
}
export { handler as GET, handler as POST, handler as PATCH, handler as PUT, handler as DELETE };

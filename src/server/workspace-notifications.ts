import { randomUUID } from "node:crypto";
import type { Database, Sql } from "./db";
import { getConfig } from "./config";
import { AppError } from "./errors";
import { seoulDate } from "@/domain/dates";
import {
  getProfile,
  ownBusiness,
  evaluateWorkspaceIn,
  refreshBusinessSchedules,
  type BusinessRow,
} from "./workspace";
import { sendStibee } from "@/integrations/providers";
import { trackIntegration } from "./integration-status";
import { getPolicies } from "./service";
import { weeklySummary } from "./weekly-digest";
import { currentFacts, evaluateCurrent, workspaceBusinessSchema } from "@/domain/workspace";

type Notice = {
  id: string;
  business_id: string;
  kind: string;
  channel: "EMAIL";
  project_step_id: string | null;
  occurrence_id: string | null;
  policy_version_id: string | null;
  resource_revision: number | null;
  payload: { title: string; path: string; deadline?: string };
};
async function sendable(sql: Sql, j: Notice) {
  const b = (
    await sql.query<BusinessRow & { email: string; is_demo: boolean }>(
      "SELECT b.*,u.email,u.is_demo FROM businesses b JOIN users u ON u.id=b.owner_id WHERE b.id=$1",
      [j.business_id],
    )
  )[0];
  if (!b) return null;
  const p = (await getProfile(sql, b.owner_id)).profile;
  b.email = p?.email ?? b.email;
  if (!p?.emailAlerts || j.channel !== "EMAIL") return null;
  if (
    getConfig().emailTransport === "stibee" &&
    process.env.STIBEE_CONTACT_SYNC_ENABLED === "true"
  ) {
    if (
      !(
        await sql.query(
          "SELECT owner_id FROM email_contacts WHERE owner_id=$1 AND desired=true AND sync_status='APPLIED' AND remote_status='subscribed'",
          [b.owner_id],
        )
      ).length
    )
      return null;
  }
  if (j.kind === "WEEKLY_DIGEST") {
    if (!j.payload.deadline || j.payload.deadline < seoulDate()) return null;
    const summary = await weeklySummary(sql, b.id);
    if (!summary) return null;
    j.payload.title = summary.title;
  }
  if (j.project_step_id) {
    const r = (
      await sql.query<{ done: boolean; deadline: string | null; deadline_revision: number }>(
        "SELECT done,deadline::text AS deadline,deadline_revision FROM project_steps WHERE id=$1",
        [j.project_step_id],
      )
    )[0];
    if (
      !r ||
      r.done ||
      r.deadline_revision !== j.resource_revision ||
      !r.deadline ||
      r.deadline < seoulDate()
    )
      return null;
  }
  if (j.occurrence_id) {
    const r = (
      await sql.query<{ done: boolean; enabled: boolean; revision: number; due_date: string }>(
        "SELECT o.done,o.due_date::text AS due_date,d.enabled,d.revision FROM document_occurrences o JOIN recurring_documents d ON d.id=o.document_id WHERE o.id=$1",
        [j.occurrence_id],
      )
    )[0];
    if (
      !r ||
      r.done ||
      !r.enabled ||
      r.revision !== j.resource_revision ||
      r.due_date < seoulDate()
    )
      return null;
  }
  if (j.policy_version_id) {
    const policies = await getPolicies(sql),
      count = (
        await sql.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM employees WHERE business_id=$1 AND (details->>'startedOn' IS NULL OR (details->>'startedOn')::date <= $2::date)",
          [b.id, seoulDate()],
        )
      )[0].n;
    const results = evaluateCurrent(
      policies,
      currentFacts(b.facts, count, p.birthDate),
      getConfig().demo,
    );
    if (!results.some((r) => r.policyVersionId === j.policy_version_id && r.status === "MATCH"))
      return null;
  }
  return b;
}
export async function dispatchWorkspaceNotifications(db: Database, now = new Date()) {
  const config = getConfig();
  if (config.emailTransport !== "local" && config.emailTransport !== "stibee")
    throw new AppError(503, "이메일 전송 설정을 확인하세요.");
  if (
    config.emailTransport === "stibee" &&
    (!config.liveIntegrations || !process.env.STIBEE_API_KEY || !process.env.STIBEE_AUTO_EMAIL_URL)
  )
    throw new AppError(503, "스티비 전송 설정이 완료되지 않았습니다.");
  const requireContact =
    config.emailTransport === "stibee" && process.env.STIBEE_CONTACT_SYNC_ENABLED === "true";
  const jobs = await db.transaction(async (tx) => {
    await tx.query(
      "UPDATE workspace_notifications SET status='UNKNOWN' WHERE channel='EMAIL' AND status='CLAIMED' AND claimed_at < $1::timestamptz - interval '10 minutes'",
      [now],
    );
    const jobs = await tx.query<Notice>(
      "SELECT n.* FROM workspace_notifications n WHERE channel='EMAIL' AND status='PENDING' AND scheduled_at <= $1 AND ($2=false OR EXISTS(SELECT 1 FROM businesses b JOIN email_contacts c ON c.owner_id=b.owner_id WHERE b.id=n.business_id AND c.desired=true AND c.sync_status='APPLIED' AND c.remote_status='subscribed')) ORDER BY scheduled_at,id LIMIT 50 FOR UPDATE OF n SKIP LOCKED",
      [now, requireContact],
    );
    for (const j of jobs)
      await tx.query(
        "UPDATE workspace_notifications SET status='CLAIMED',claimed_at=$1 WHERE id=$2",
        [now, j.id],
      );
    return jobs;
  });
  const summary = { local: 0, accepted: 0, failed: 0, unknown: 0, cancelled: 0 };
  for (const j of jobs) {
    const b = await sendable(db, j);
    if (!b) {
      await db.query("UPDATE workspace_notifications SET status='CANCELLED' WHERE id=$1", [j.id]);
      summary.cancelled++;
      continue;
    }
    if (config.emailTransport === "local") {
      await db.transaction(async (tx) => {
        if (!(await sendable(tx, j))) {
          await tx.query("UPDATE workspace_notifications SET status='CANCELLED' WHERE id=$1", [
            j.id,
          ]);
          summary.cancelled++;
          return;
        }
        await tx.query(
          "INSERT INTO workspace_outbox(notification_id,channel,title,path) VALUES($1,$2,$3,$4) ON CONFLICT(notification_id) DO NOTHING",
          [j.id, j.channel, j.payload.title, j.payload.path],
        );
        await tx.query("UPDATE workspace_notifications SET status='LOCAL_ONLY' WHERE id=$1", [
          j.id,
        ]);
        summary.local++;
      });
    } else if (b.is_demo || b.email.endsWith(".invalid")) {
      await db.query("UPDATE workspace_notifications SET status='FAILED' WHERE id=$1", [j.id]);
      summary.failed++;
    } else {
      let result: "ACCEPTED_BY_PROVIDER" | "FAILED" | "UNKNOWN";
      try {
        result = await trackIntegration(db, "Stibee", "send", () =>
          sendStibee(b.email, j.payload.title, new URL(j.payload.path, config.appUrl).toString()),
        );
      } catch {
        result = "UNKNOWN";
      }
      await db.query("UPDATE workspace_notifications SET status=$1 WHERE id=$2", [result, j.id]);
      summary[
        result === "ACCEPTED_BY_PROVIDER" ? "accepted" : result === "UNKNOWN" ? "unknown" : "failed"
      ]++;
      // The automatic email API allows 3 requests/second. Keep this worker below that limit.
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return summary;
}
export async function reassessWorkspaces(db: Database) {
  const rows = await db.query<BusinessRow>("SELECT * FROM businesses ORDER BY id");
  let evaluated = 0;
  for (const row of rows) {
    if (!workspaceBusinessSchema.safeParse(row.facts).success) continue;
    await db.transaction(async (tx) => {
      const b = await ownBusiness(tx, row.id, row.owner_id, true);
      await evaluateWorkspaceIn(tx, b);
      await refreshBusinessSchedules(tx, b);
      evaluated++;
    });
  }
  return { evaluated };
}
export async function notificationInbox(sql: Sql, bid: string, owner: string) {
  await ownBusiness(sql, bid, owner);
  return sql.query(
    "SELECT n.id,n.kind,n.channel,n.status,n.payload,n.scheduled_at,o.created_at AS local_saved_at FROM workspace_notifications n LEFT JOIN workspace_outbox o ON o.notification_id=n.id WHERE n.business_id=$1 ORDER BY n.created_at DESC LIMIT 100",
    [bid],
  );
}

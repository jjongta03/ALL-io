import { randomUUID } from "node:crypto";
import { type Database, type Sql } from "./db";
import { getConfig } from "./config";
import { AppError } from "./errors";
import { fetchOfficialText, sendStibee } from "@/integrations/providers";
import { hash } from "./hashing";
import { trackIntegration } from "./integration-status";

type MailJob = {
  id: string;
  plan_id: string;
  task_id: string | null;
  deadline_version: number | null;
  type: string;
  payload: { title: string; path: string; deadline?: string };
  email: string;
  is_demo: boolean;
};
async function isSendable(sql: Sql, job: MailJob) {
  const rows = await sql.query<{ id: string }>(
    `SELECT j.id FROM notification_jobs j JOIN change_plans p ON p.id=j.plan_id
    LEFT JOIN plan_tasks t ON t.id=j.task_id
    WHERE j.id=$1 AND j.status='CLAIMED' AND p.status='ACTIVE' AND p.email_alerts=true
    AND NOT EXISTS(SELECT 1 FROM email_contacts c WHERE c.owner_id=p.owner_id AND c.desired=false)
    AND ($2=false OR EXISTS(SELECT 1 FROM email_contacts c WHERE c.owner_id=p.owner_id AND c.desired=true AND c.sync_status='APPLIED' AND c.remote_status='subscribed'))
    AND (j.task_id IS NULL OR (j.type IN ('D-7','D-3') AND t.status IN ('TODO','NEEDS_REVIEW') AND t.deadline_version=j.deadline_version))`,
    [
      job.id,
      getConfig().emailTransport === "stibee" && process.env.STIBEE_CONTACT_SYNC_ENABLED === "true",
    ],
  );
  return rows.length > 0;
}
export async function dispatchNotifications(db: Database, now = new Date()) {
  const config = getConfig();
  if (
    config.emailTransport === "stibee" &&
    (!config.liveIntegrations || !process.env.STIBEE_API_KEY || !process.env.STIBEE_AUTO_EMAIL_URL)
  )
    throw new AppError(503, "실제 메일 전송 설정이 완료되지 않았습니다.");
  const jobs = await db.transaction(async (tx) => {
    await tx.query(
      "UPDATE notification_jobs SET status='UNKNOWN',last_error='Worker interruption: verify before retry' WHERE status='CLAIMED' AND claimed_at<($1::timestamptz-interval '10 minutes')",
      [now],
    );
    const rows = await tx.query<MailJob>(
      `SELECT j.*,u.email,u.is_demo FROM notification_jobs j JOIN change_plans p ON p.id=j.plan_id JOIN users u ON u.id=p.owner_id
      WHERE j.status='PENDING' AND j.scheduled_at<=$1
      AND ($2=false OR EXISTS(SELECT 1 FROM email_contacts c WHERE c.owner_id=p.owner_id AND c.desired=true AND c.sync_status='APPLIED' AND c.remote_status='subscribed'))
      ORDER BY j.scheduled_at LIMIT 50 FOR UPDATE OF j SKIP LOCKED`,
      [
        now,
        config.emailTransport === "stibee" && process.env.STIBEE_CONTACT_SYNC_ENABLED === "true",
      ],
    );
    for (const job of rows)
      await tx.query(
        "UPDATE notification_jobs SET status='CLAIMED',attempts=attempts+1,claimed_at=$1 WHERE id=$2",
        [now, job.id],
      );
    return rows;
  });
  const summary = { processed: 0, local: 0, accepted: 0, failed: 0, unknown: 0, cancelled: 0 };
  for (const job of jobs) {
    if (!(await isSendable(db, job))) {
      await db.query("UPDATE notification_jobs SET status='CANCELLED' WHERE id=$1", [job.id]);
      summary.cancelled++;
      continue;
    }
    const subject =
      job.type === "POLICY_CHANGE" ? "저장한 계획의 안내 변경" : `할 일 알림: ${job.payload.title}`;
    const link = new URL(job.payload.path, config.appUrl).toString();
    if (config.emailTransport === "local") {
      await db.transaction(async (tx) => {
        if (!(await isSendable(tx, job))) {
          await tx.query("UPDATE notification_jobs SET status='CANCELLED' WHERE id=$1", [job.id]);
          return;
        }
        await tx.query(
          "INSERT INTO outbox(id,notification_id,recipient,subject,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT(notification_id) DO NOTHING",
          [
            randomUUID(),
            job.id,
            job.email,
            subject,
            `${job.payload.title}\n${job.payload.deadline ? `준비 목표일: ${job.payload.deadline}\n` : ""}${link}\n\n로컬 데모 메일입니다. 외부로 발송되지 않았습니다.`,
          ],
        );
        await tx.query("UPDATE notification_jobs SET status='LOCAL_ONLY' WHERE id=$1", [job.id]);
      });
      summary.local++;
    } else if (job.is_demo || job.email.endsWith(".invalid")) {
      await db.query(
        "UPDATE notification_jobs SET status='FAILED',last_error='Demo recipient: external delivery forbidden' WHERE id=$1",
        [job.id],
      );
      summary.failed++;
    } else {
      let status: "ACCEPTED_BY_PROVIDER" | "FAILED" | "UNKNOWN";
      try {
        status = await trackIntegration(db, "Stibee", "send", () =>
          sendStibee(job.email, job.payload.title, link),
        );
      } catch {
        status = "FAILED";
      }
      await db.query("UPDATE notification_jobs SET status=$1 WHERE id=$2", [status, job.id]);
      summary[
        status === "ACCEPTED_BY_PROVIDER" ? "accepted" : status === "FAILED" ? "failed" : "unknown"
      ]++;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    summary.processed++;
  }
  return summary;
}
export async function queueDemoMail(db: Database, planId: string, ownerId: string) {
  if (!getConfig().demo || getConfig().emailTransport !== "local")
    throw new AppError(403, "이 기능은 로컬 메일 보관함에서만 사용할 수 있습니다.");
  const plan = (
    await db.query<{ id: string; email_alerts: boolean; status: string }>(
      "SELECT id,email_alerts,status FROM change_plans WHERE id=$1 AND owner_id=$2",
      [planId, ownerId],
    )
  )[0];
  if (!plan) throw new AppError(404, "계획을 찾을 수 없습니다.");
  if (!plan.email_alerts || plan.status !== "ACTIVE")
    throw new AppError(409, "먼저 해당 계획의 알림을 켜세요.");
  await db.query(
    "INSERT INTO notification_jobs(id,plan_id,type,dedupe_key,scheduled_at,payload) VALUES($1,$2,'DEMO_TEST',$3,now(),$4)",
    [
      randomUUID(),
      plan.id,
      `demo:${randomUUID()}`,
      JSON.stringify({ title: "채용 준비 알림 테스트", path: `/plans/${plan.id}` }),
    ],
  );
  return dispatchNotifications(db);
}
export async function collectSources(db: Database) {
  if (!getConfig().sourceCollection || !getConfig().liveIntegrations)
    return { skipped: true, reason: "공식 원문 수집이 꺼져 있습니다.", changed: 0 };
  const sources = await db.query<{ id: string; url: string }>(
    "SELECT id,url FROM sources WHERE collection_allowed=true ORDER BY id LIMIT 20",
  );
  let changed = 0,
    failed = 0;
  for (const source of sources) {
    try {
      const text = await fetchOfficialText(source.url);
      const digest = hash(text);
      await db.transaction(async (tx) => {
        const previous = (
          await tx.query<{ id: string; content_hash: string }>(
            "SELECT id,content_hash FROM source_snapshots WHERE source_id=$1 ORDER BY fetched_at DESC LIMIT 1",
            [source.id],
          )
        )[0];
        if (previous?.content_hash !== digest) {
          const snapshot = randomUUID();
          const inserted = await tx.query<{ id: string }>(
            "INSERT INTO source_snapshots(id,source_id,content_hash,normalized_text) VALUES($1,$2,$3,$4) ON CONFLICT(source_id,content_hash) DO NOTHING RETURNING id",
            [snapshot, source.id, digest, text],
          );
          if (previous && inserted[0]) {
            await tx.query(
              "INSERT INTO source_changes(id,source_id,previous_snapshot_id,new_snapshot_id) VALUES($1,$2,$3,$4)",
              [randomUUID(), source.id, previous.id, snapshot],
            );
            changed++;
          }
        }
        await tx.query("UPDATE sources SET last_success_at=now(),last_error=NULL WHERE id=$1", [
          source.id,
        ]);
      });
    } catch {
      failed++;
      await db.query(
        "UPDATE sources SET last_error='Collection failed: inspect official page manually' WHERE id=$1",
        [source.id],
      );
    }
  }
  return { skipped: false, checked: sources.length, changed, failed };
}
export async function runJob(db: Database, kind: "notifications" | "collect") {
  const id = randomUUID();
  await db.query("INSERT INTO job_runs(id,type,run_key,status) VALUES($1,$2,$3,'RUNNING')", [
    id,
    kind,
    `${kind}:${id}`,
  ]);
  try {
    const result =
      kind === "notifications" ? await dispatchNotifications(db) : await collectSources(db);
    await db.query(
      "UPDATE job_runs SET status='SUCCEEDED',summary=$1,finished_at=now() WHERE id=$2",
      [JSON.stringify(result), id],
    );
    return { id, ...result };
  } catch (e) {
    await db.query(
      "UPDATE job_runs SET status='FAILED',last_error='Job failed: check provider configuration',finished_at=now() WHERE id=$1",
      [id],
    );
    throw e;
  }
}

import { randomUUID } from "node:crypto";
import type { Database, Sql } from "./db";
import { getConfig } from "./config";
import { trackIntegration } from "./integration-status";
import { AppError } from "./errors";
import { upsertSubscriber, listRemoteSubscribers } from "@/integrations/stibee-contacts";
export async function queueContactSync(tx: Sql, owner: string, desired: boolean) {
  const old = (
    await tx.query<{ desired: boolean }>("SELECT desired FROM email_contacts WHERE owner_id=$1", [
      owner,
    ])
  )[0];
  if (old?.desired === desired) return;
  const row = (
    await tx.query<{ email_sync_revision: number }>(
      "UPDATE owner_profiles SET email_sync_revision=email_sync_revision+1 WHERE owner_id=$1 RETURNING email_sync_revision",
      [owner],
    )
  )[0];
  await tx.query(
    "UPDATE email_sync_jobs SET status='CANCELLED' WHERE owner_id=$1 AND status='PENDING'",
    [owner],
  );
  await tx.query(
    "INSERT INTO email_contacts(owner_id,revision,desired,sync_status) VALUES($1,$2,$3,'PENDING') ON CONFLICT(owner_id) DO UPDATE SET revision=$2,desired=$3,sync_status='PENDING',updated_at=now()",
    [owner, row.email_sync_revision, desired],
  );
  await tx.query("INSERT INTO email_sync_jobs(id,owner_id,revision,desired) VALUES($1,$2,$3,$4)", [
    randomUUID(),
    owner,
    row.email_sync_revision,
    desired,
  ]);
}
export async function contactStatus(sql: Sql, owner: string) {
  return (
    (
      await sql.query(
        "SELECT desired,remote_status,sync_status,revision,updated_at FROM email_contacts WHERE owner_id=$1",
        [owner],
      )
    )[0] ?? null
  );
}
export async function syncEmailContacts(db: Database) {
  const local = !getConfig().liveIntegrations || process.env.STIBEE_CONTACT_SYNC_ENABLED !== "true";
  const summary = { applied: 0, local: 0, unknown: 0, cancelled: 0 };
  await db.query(
    "UPDATE email_sync_jobs SET status='UNKNOWN' WHERE status='CLAIMED' AND claimed_at<now()-interval '10 minutes'",
  );
  await db.query(
    "UPDATE email_contacts c SET sync_status='UNKNOWN',updated_at=now() FROM email_sync_jobs j WHERE j.owner_id=c.owner_id AND j.revision=c.revision AND j.status='UNKNOWN' AND c.sync_status='PENDING'",
  );
  // Commit claims before contacting Stibee. One active job per owner prevents
  // an older opt-in racing a newer opt-out across concurrent workers.
  const jobs = await db.transaction(async (tx) => {
    const rows = await tx.query<{
      id: string;
      owner_id: string;
      revision: number;
      desired: boolean;
      email: string;
      is_demo: boolean;
    }>(
      "SELECT j.*,u.email,u.is_demo FROM email_sync_jobs j JOIN users u ON u.id=j.owner_id WHERE (j.status='PENDING' OR ($1=false AND j.status='LOCAL_ONLY')) AND NOT EXISTS(SELECT 1 FROM email_sync_jobs active WHERE active.owner_id=j.owner_id AND active.status='CLAIMED') ORDER BY j.created_at,j.id LIMIT 50 FOR UPDATE OF j SKIP LOCKED",
      [local],
    );
    const claimed: typeof rows = [];
    for (const j of rows) {
      const c = (
        await tx.query<{ revision: number }>(
          "SELECT revision FROM email_contacts WHERE owner_id=$1",
          [j.owner_id],
        )
      )[0];
      if (!c || c.revision !== j.revision) {
        await tx.query("UPDATE email_sync_jobs SET status='CANCELLED' WHERE id=$1", [j.id]);
        summary.cancelled++;
        continue;
      }
      await tx.query("UPDATE email_sync_jobs SET status='CLAIMED',claimed_at=now() WHERE id=$1", [
        j.id,
      ]);
      claimed.push(j);
    }
    return claimed;
  });
  for (const j of jobs) {
    const c = (
      await db.query<{ revision: number }>(
        "SELECT revision FROM email_contacts WHERE owner_id=$1",
        [j.owner_id],
      )
    )[0];
    let status = "LOCAL_ONLY";
    if (!c || c.revision !== j.revision) {
      status = "CANCELLED";
      summary.cancelled++;
    } else if (local) {
      summary.local++;
    } else if (j.is_demo || j.email.endsWith(".invalid")) {
      status = "BLOCKED";
      summary.cancelled++;
    } else {
      try {
        await trackIntegration(db, "Stibee", "contacts", () =>
          upsertSubscriber(j.email, j.desired),
        );
        status = "APPLIED";
        summary.applied++;
      } catch {
        status = "UNKNOWN";
        summary.unknown++;
      }
    }
    await db.transaction(async (tx) => {
      await tx.query("UPDATE email_sync_jobs SET status=$1 WHERE id=$2", [status, j.id]);
      await tx.query(
        "UPDATE email_contacts SET sync_status=$1,remote_status=CASE WHEN $1='APPLIED' THEN $2 ELSE remote_status END,updated_at=now() WHERE owner_id=$3 AND revision=$4",
        [status, j.desired ? "subscribed" : "unsubscribed", j.owner_id, j.revision],
      );
    });
  }
  return summary;
}
export async function reconcileEmailContacts(db: Database) {
  const { integrationEnabled } = await import("@/integrations/transport");
  integrationEnabled("STIBEE_CONTACT_SYNC_ENABLED");
  const revisions = new Map(
    (
      await db.query<{ owner_id: string; revision: number }>(
        "SELECT owner_id,revision FROM email_contacts",
      )
    ).map((c) => [c.owner_id, c.revision]),
  );
  let scanned = 0,
    revoked = 0;
  // Fail explicitly above 100,000 entries; do not silently report partial success.
  for (let offset = 0; offset < 100000; offset += 1000) {
    const rows = await trackIntegration(db, "Stibee", "contact-reconcile", () =>
      listRemoteSubscribers(offset),
    );
    scanned += rows.length;
    for (const r of rows.filter((r) => r.status !== "subscribed"))
      await db.transaction(async (tx) => {
        const u = (
          await tx.query<{ id: string }>(
            "SELECT id FROM users WHERE lower(email)=lower($1) FOR UPDATE",
            [r.email],
          )
        )[0];
        if (!u) return;
        const c = (
          await tx.query<{ desired: boolean }>(
            "SELECT desired FROM email_contacts WHERE owner_id=$1 AND revision=$2 AND (desired=false OR sync_status IN ('APPLIED','UNKNOWN')) FOR UPDATE",
            [u.id, revisions.get(u.id) ?? -1],
          )
        )[0];
        if (!c) return;
        await tx.query("UPDATE email_contacts SET remote_status=$1 WHERE owner_id=$2", [
          r.status,
          u.id,
        ]);
        if (!c.desired) return;
        await tx.query(
          "UPDATE owner_profiles SET profile=jsonb_set(profile,'{emailAlerts}','false'),email_sync_revision=email_sync_revision+1,updated_at=now() WHERE owner_id=$1",
          [u.id],
        );
        await tx.query(
          "UPDATE email_contacts SET desired=false,sync_status='REMOTE_BLOCKED',revision=revision+1,updated_at=now() WHERE owner_id=$1",
          [u.id],
        );
        await tx.query(
          "UPDATE email_sync_jobs SET status='CANCELLED' WHERE owner_id=$1 AND status='PENDING'",
          [u.id],
        );
        await tx.query(
          "UPDATE workspace_notifications SET status='CANCELLED' WHERE status='PENDING' AND business_id IN (SELECT id FROM businesses WHERE owner_id=$1)",
          [u.id],
        );
        await tx.query(
          "UPDATE notification_jobs SET status='CANCELLED' WHERE status='PENDING' AND plan_id IN (SELECT id FROM change_plans WHERE owner_id=$1)",
          [u.id],
        );
        revoked++;
      });
    if (rows.length < 1000) return { scanned, revoked };
  }
  throw new AppError(422, "주소록이 동기화 한도를 초과했습니다.");
}

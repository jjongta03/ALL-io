import { z } from "zod";
import type { Database } from "./db";
import type { User } from "./auth";
import { readJson, rateLimit } from "./http";
import { AppError, notFound } from "./errors";
import {
  watchSchema,
  saveWatch,
  acceptDiscovery,
  runPolicyWatches,
  draftWatchEvent,
} from "./policy-watches";
import { contactStatus, syncEmailContacts, reconcileEmailContacts } from "./email-contacts";
import { queueWeeklySummaries } from "./weekly-digest";
export const connectedJobs = ["contacts", "contact-reconcile", "policy-watch", "weekly"] as const;
export async function runConnectedJob(db: Database, kind: (typeof connectedJobs)[number]) {
  switch (kind) {
    case "contacts":
      return syncEmailContacts(db);
    case "contact-reconcile":
      return reconcileEmailContacts(db);
    case "policy-watch":
      return runPolicyWatches(db);
    case "weekly":
      return queueWeeklySummaries(db);
  }
}
const uuid = (s: string) => z.uuid().parse(s);
export async function connectedApi(
  req: Request,
  db: Database,
  user: User,
  path: string[],
): Promise<unknown | undefined> {
  const key = `${req.method} ${path.join("/")}`;
  if (key === "GET email-contact") return { contact: await contactStatus(db, user.id) };
  if (path[0] === "admin") {
    if (user.role !== "ADMIN") throw new AppError(403, "운영자 권한이 필요합니다.");
    if (key === "GET admin/watches")
      return {
        watches: await db.query(
          "SELECT id,query,enabled FROM policy_watch_queries ORDER BY created_at",
        ),
      };
    if (key === "POST admin/watches")
      return saveWatch(db, user.id, await readJson(req, watchSchema));
    if (path.length === 3 && path[1] === "watches" && req.method === "PATCH") {
      const b = await readJson(req, z.object({ enabled: z.boolean() }).strict());
      return (
        (
          await db.query(
            "UPDATE policy_watch_queries SET enabled=$1 WHERE id=$2 RETURNING id,enabled",
            [b.enabled, uuid(path[2])],
          )
        )[0] ?? notFound()
      );
    }
    if (key === "GET admin/discoveries")
      return {
        discoveries: await db.query(
          "SELECT * FROM policy_discoveries ORDER BY discovered_at DESC LIMIT 100",
        ),
      };
    if (
      path.length === 4 &&
      path[1] === "discoveries" &&
      path[3] === "accept" &&
      req.method === "POST"
    )
      return acceptDiscovery(db, uuid(path[2]), user.id);
    if (key === "GET admin/watch-events")
      return {
        events: await db.query(
          "SELECT e.*,s.title,s.url FROM watched_source_events e JOIN sources s ON s.id=e.source_id ORDER BY e.created_at DESC LIMIT 100",
        ),
      };
    if (path.length === 3 && path[1] === "watch-events" && req.method === "GET")
      return (
        (
          await db.query(
            "SELECT e.*,s.url,s.title,p.normalized_text AS previous_text,n.normalized_text AS current_text FROM watched_source_events e JOIN sources s ON s.id=e.source_id LEFT JOIN source_snapshots p ON p.id=e.previous_snapshot_id JOIN source_snapshots n ON n.id=e.snapshot_id WHERE e.id=$1",
            [uuid(path[2])],
          )
        )[0] ?? notFound()
      );
    if (
      path.length === 4 &&
      path[1] === "watch-events" &&
      path[3] === "draft" &&
      req.method === "POST"
    ) {
      rateLimit(`watch-draft:${user.id}`, 10);
      const b = await readJson(req, z.object({ policyId: z.uuid().optional() }).strict());
      return draftWatchEvent(db, uuid(path[2]), user.id, b.policyId);
    }
  }
  return undefined;
}

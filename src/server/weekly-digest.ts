import type { Database, Sql } from "./db";
import { ownBusiness, getProfile, queueWorkspaceNotice, type BusinessRow } from "./workspace";
import { addDays, seoulDate } from "@/domain/dates";
export function digestWeek() {
  const today = seoulDate();
  const day = new Date(today + "T00:00:00Z").getUTCDay();
  return addDays(today, -((day + 6) % 7));
}
export async function weeklySummary(sql: Sql, bid: string) {
  const items = await sql.query<{ title: string; deadline: string | null; total: number }>(
    `WITH items AS (
    SELECT s.title,s.deadline FROM project_steps s JOIN benefit_projects p ON p.id=s.project_id
    WHERE p.business_id=$1 AND s.done=false AND (s.deadline IS NULL OR s.deadline<=$2::date)
    UNION ALL
    SELECT d.title,o.due_date FROM document_occurrences o JOIN recurring_documents d ON d.id=o.document_id
    WHERE d.business_id=$1 AND d.enabled=true AND o.done=false AND o.due_date<=$2::date
  ) SELECT title,deadline::text,count(*) OVER()::int AS total FROM items ORDER BY deadline NULLS LAST,title LIMIT 3`,
    [bid, addDays(digestWeek(), 6)],
  );
  return items.length
    ? {
        title:
          `이번 주 미완료 업무 ${items[0].total}건: ${items.map((t) => t.title).join(" · ")}`.slice(
            0,
            500,
          ),
        total: items[0].total,
        items,
      }
    : null;
}
export async function queueWeeklySummaries(db: Database) {
  const week = digestWeek();
  let queued = 0;
  for (const row of await db.query<BusinessRow>("SELECT * FROM businesses ORDER BY id"))
    await db.transaction(async (tx) => {
      const b = await ownBusiness(tx, row.id, row.owner_id, true);
      if (
        !(await getProfile(tx, b.owner_id)).profile?.emailAlerts ||
        !(await weeklySummary(tx, b.id))
      )
        return;
      const key = `${b.id}:EMAIL:weekly:${week}`;
      if (
        (await tx.query("SELECT id FROM workspace_notifications WHERE dedupe_key=$1", [key])).length
      )
        return;
      await queueWorkspaceNotice(tx, b, "WEEKLY_DIGEST", `weekly:${week}`, new Date(), {
        title: "이번 주 미완료 업무 안내",
        path: `/dashboard?business=${b.id}`,
        deadline: addDays(week, 6),
      });
      queued++;
    });
  return { queued };
}

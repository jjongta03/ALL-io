import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "./db";
import { trackIntegration } from "./integration-status";
import { hash } from "./hashing";
import { AppError, notFound } from "./errors";
import { integrationEnabled } from "@/integrations/transport";
import {
  searchOfficialSources,
  fetchOfficialText,
  isAllowedSource,
} from "@/integrations/providers";
import { LinerRuleDraftGenerator } from "@/integrations/drafting";
export const watchSchema = z
  .object({ query: z.string().trim().min(5).max(300), enabled: z.boolean().default(true) })
  .strict();
export async function saveWatch(db: Database, actor: string, input: z.infer<typeof watchSchema>) {
  const id = randomUUID();
  return (
    await db.query(
      "INSERT INTO policy_watch_queries(id,query,enabled,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(query) DO UPDATE SET enabled=$3 RETURNING id,query,enabled",
      [id, input.query, input.enabled, actor],
    )
  )[0];
}
export async function acceptDiscovery(db: Database, id: string, actor: string) {
  return db.transaction(async (tx) => {
    const d =
      (
        await tx.query<{ url: string; title: string }>(
          "SELECT * FROM policy_discoveries WHERE id=$1 FOR UPDATE",
          [id],
        )
      )[0] ?? notFound();
    if (!isAllowedSource(d.url)) throw new AppError(422, "공식 출처만 등록할 수 있습니다.");
    const s = (
      await tx.query<{ id: string }>(
        "INSERT INTO sources(id,url,title,collection_allowed) VALUES($1,$2,$3,true) ON CONFLICT(url) DO UPDATE SET collection_allowed=true RETURNING id",
        [randomUUID(), d.url, d.title],
      )
    )[0];
    await tx.query("UPDATE policy_discoveries SET status='ACCEPTED',source_id=$1 WHERE id=$2", [
      s.id,
      id,
    ]);
    await tx.query(
      "INSERT INTO audit_events(id,actor_id,action,entity_id,metadata) VALUES($1,$2,'watch.source.accept',$3,$4)",
      [randomUUID(), actor, s.id, JSON.stringify({ discoveryId: id })],
    );
    return { sourceId: s.id };
  });
}
export async function runPolicyWatches(db: Database) {
  integrationEnabled("POLICY_WATCH_ENABLED");
  const queries = await db.query<{ id: string; query: string }>(
    "SELECT id,query FROM policy_watch_queries WHERE enabled=true ORDER BY checked_at NULLS FIRST,created_at,id LIMIT 20",
  );
  const result = { searched: 0, discovered: 0, collected: 0, changed: 0, failed: 0 };
  for (const q of queries) {
    try {
      const found = await trackIntegration(db, "Liner", "watch", () =>
        searchOfficialSources(q.query),
      );
      result.searched++;
      for (const c of found.filter((r) => r.officialCandidate)) {
        const added = await db.query(
          "INSERT INTO policy_discoveries(id,url,title,snippet) VALUES($1,$2,$3,$4) ON CONFLICT(url) DO NOTHING RETURNING id",
          [randomUUID(), c.url, c.title, c.description ?? null],
        );
        result.discovered += added.length;
      }
    } catch {
      result.failed++;
    } finally {
      await db.query("UPDATE policy_watch_queries SET checked_at=now() WHERE id=$1", [q.id]);
    }
  }
  const sources = await db.query<{ id: string; url: string }>(
    "SELECT id,url FROM sources WHERE collection_allowed=true ORDER BY watch_attempted_at NULLS FIRST,id LIMIT 50",
  );
  for (const s of sources) {
    const started = new Date();
    await db.query("UPDATE sources SET watch_attempted_at=$1 WHERE id=$2", [started, s.id]);
    try {
      const content = await fetchOfficialText(s.url),
        digest = hash(content);
      await db.transaction(async (tx) => {
        const current = (
          await tx.query<{ last_success_at: string | null }>(
            "SELECT last_success_at FROM sources WHERE id=$1 FOR UPDATE",
            [s.id],
          )
        )[0];
        if (current.last_success_at && new Date(current.last_success_at) > started) return;
        await tx.query(
          "INSERT INTO source_snapshots(id,source_id,content_hash,normalized_text) VALUES($1,$2,$3,$4) ON CONFLICT(source_id,content_hash) DO NOTHING",
          [randomUUID(), s.id, digest, content],
        );
        const snapshot = (
          await tx.query<{ id: string }>(
            "SELECT id FROM source_snapshots WHERE source_id=$1 AND content_hash=$2",
            [s.id, digest],
          )
        )[0];
        const old = (
          await tx.query<{ snapshot_id: string; revision: number }>(
            "SELECT * FROM watched_source_heads WHERE source_id=$1",
            [s.id],
          )
        )[0];
        if (!old || old.snapshot_id !== snapshot.id) {
          const revision = (old?.revision ?? 0) + 1;
          await tx.query(
            "INSERT INTO watched_source_events(id,source_id,revision,previous_snapshot_id,snapshot_id) VALUES($1,$2,$3,$4,$5)",
            [randomUUID(), s.id, revision, old?.snapshot_id ?? null, snapshot.id],
          );
          await tx.query(
            "INSERT INTO watched_source_heads(source_id,snapshot_id,revision) VALUES($1,$2,$3) ON CONFLICT(source_id) DO UPDATE SET snapshot_id=$2,revision=$3",
            [s.id, snapshot.id, revision],
          );
          result.changed++;
        }
        await tx.query("UPDATE sources SET last_success_at=$1,last_error=NULL WHERE id=$2", [
          started,
          s.id,
        ]);
        result.collected++;
      });
    } catch {
      result.failed++;
      await db.query(
        "UPDATE sources SET last_error='Watch collection failed: inspect source manually' WHERE id=$1",
        [s.id],
      );
    }
  }
  return result;
}
export async function draftWatchEvent(db: Database, id: string, actor: string, policyId?: string) {
  const row =
    (
      await db.query<{
        id: string;
        source_id: string;
        snapshot_id: string;
        review_id: string | null;
        url: string;
        title: string;
        normalized_text: string;
      }>(
        "SELECT e.*,s.url,s.title,ss.normalized_text FROM watched_source_events e JOIN sources s ON s.id=e.source_id JOIN source_snapshots ss ON ss.id=e.snapshot_id WHERE e.id=$1",
        [id],
      )
    )[0] ?? notFound();
  if (row.review_id) return { reviewId: row.review_id };
  const draft = await trackIntegration(db, "Liner", "draft", () =>
    new LinerRuleDraftGenerator().suggest({
      snapshotId: row.snapshot_id,
      url: row.url,
      title: row.title,
      text: row.normalized_text,
    }),
  );
  return db.transaction(async (tx) => {
    const event = (
      await tx.query<{ review_id: string | null }>(
        "SELECT review_id FROM watched_source_events WHERE id=$1 FOR UPDATE",
        [id],
      )
    )[0];
    if (event.review_id) return { reviewId: event.review_id };
    let pid = policyId,
      base: string | null = null,
      version = 1;
    if (pid) {
      const p =
        (
          await tx.query<{ active_version_id: string | null; kind: string }>(
            "SELECT kind,active_version_id FROM policies WHERE id=$1 FOR UPDATE",
            [pid],
          )
        )[0] ?? notFound();
      if (p.kind !== draft.kind) throw new AppError(422, "기존 정책과 초안의 종류가 다릅니다.");
      base = p.active_version_id;
      version = (
        await tx.query<{ n: number }>(
          "SELECT COALESCE(max(version),0)+1 AS n FROM policy_versions WHERE policy_id=$1",
          [pid],
        )
      )[0].n;
    } else {
      pid = randomUUID();
      await tx.query("INSERT INTO policies(id,slug,title,kind) VALUES($1,$2,$3,$4)", [
        pid,
        `watch-${pid}`,
        draft.title,
        draft.kind,
      ]);
    }
    const vid = randomUUID(),
      review = randomUUID();
    await tx.query(
      "INSERT INTO policy_versions(id,policy_id,version,status,definition,effective_from,effective_to,is_demo) VALUES($1,$2,$3,'PENDING_REVIEW',$4,$5,$6,false)",
      [vid, pid, version, JSON.stringify(draft.definition), draft.effectiveFrom, draft.effectiveTo],
    );
    await tx.query(
      "INSERT INTO review_items(id,draft_version_id,base_version_id,reason) VALUES($1,$2,$3,$4)",
      [
        review,
        vid,
        base,
        "Liner가 수집 원문에서 제안한 미검수 초안입니다. 출처·모집기간·조건은 운영자가 확인해야 합니다.",
      ],
    );
    await tx.query("UPDATE watched_source_events SET review_id=$1 WHERE id=$2", [review, id]);
    await tx.query(
      "INSERT INTO audit_events(id,actor_id,action,entity_id,metadata) VALUES($1,$2,'watch.draft',$3,$4)",
      [randomUUID(), actor, review, JSON.stringify({ eventId: id, snapshotId: row.snapshot_id })],
    );
    return { reviewId: review, status: "PENDING", requiresHumanApproval: true };
  });
}

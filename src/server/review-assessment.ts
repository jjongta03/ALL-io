import { randomUUID } from "node:crypto";
import type { Database } from "./db";
import { listReviews } from "./service";
import { hash } from "./hashing";
import { AppError, notFound } from "./errors";
import { getConfig } from "./config";
import { assessWithJev, jevModel } from "@/integrations/decisions";
import { routeReview } from "@/domain/review-routing";

export async function assessReview(db: Database, reviewId: string, actorId: string) {
  const review = (await listReviews(db)).find((r) => r.id === reviewId) ?? notFound();
  if (review.status !== "PENDING") throw new AppError(409, "대기 중인 초안만 분류할 수 있습니다.");
  const inputHash = hash({ previous: review.previous_definition, next: review.definition });
  const snapshots = await db.query<{ url: string; text: string }>(
    "SELECT DISTINCT ON (s.url) s.url,sn.normalized_text AS text FROM sources s JOIN source_snapshots sn ON sn.source_id=s.id WHERE s.url=ANY($1::text[]) ORDER BY s.url,sn.fetched_at DESC",
    [review.definition.sources.map((s) => s.url)],
  );
  const evidence = snapshots.map((s) => ({ ...s, text: s.text.slice(0, 15000) }));
  const evidenceAvailable = review.definition.sources.every((s) =>
    evidence.some((e) => e.url === s.url && e.text.includes(s.section)),
  );
  const enabled =
    getConfig().liveIntegrations &&
    process.env.JEV_ENABLED === "true" &&
    Boolean(process.env.LINER_API_KEY);
  let decision = null,
    errorCode: string | null = null;
  if (enabled) {
    try {
      decision = await assessWithJev({
        previous: review.previous_definition,
        next: review.definition,
        evidence,
      });
    } catch (e) {
      errorCode = e instanceof AppError ? e.code : "UPSTREAM_ERROR";
    }
  }
  const assessment = routeReview(
    review.previous_definition,
    review.definition,
    decision,
    evidenceAvailable,
    jevModel(),
    errorCode,
  );
  await db.transaction(async (tx) => {
    const rows = await tx.query<{ status: string; definition: unknown }>(
      "SELECT r.status,v.definition FROM review_items r JOIN policy_versions v ON v.id=r.draft_version_id WHERE r.id=$1 FOR UPDATE OF r,v",
      [reviewId],
    );
    if (rows[0]?.status !== "PENDING" || hash(rows[0].definition) !== hash(review.definition))
      throw new AppError(409, "초안 상태가 바뀌었습니다. 새로고침 후 다시 분류하세요.");
    await tx.query(
      "INSERT INTO review_assessments(id,review_id,actor_id,input_hash,assessment) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), reviewId, actorId, inputHash, JSON.stringify(assessment)],
    );
    await tx.query("UPDATE review_items SET priority=$1 WHERE id=$2", [
      assessment.priority,
      reviewId,
    ]);
    await tx.query(
      "INSERT INTO integration_events(id,provider,operation,mode,status,error_code) VALUES($1,'Liner','decisions',$2,$3,$4)",
      [
        randomUUID(),
        enabled ? "LIVE" : "LOCAL",
        errorCode ? "FAILED" : enabled ? "SUCCESS" : "DISABLED",
        errorCode,
      ],
    );
  });
  return assessment;
}

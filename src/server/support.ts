import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "./db";
import { planDetail } from "./service";
export const supportSchema = z
  .object({
    planId: z.string().uuid(),
    command: z.enum(["/혜택조회", "/서류안내", "/오류신고", "/질문"]),
    message: z.string().trim().max(2000).default(""),
  })
  .strict();
export async function supportAnswer(
  db: Database,
  ownerId: string,
  input: z.infer<typeof supportSchema>,
) {
  const detail = await planDetail(db, input.planId, ownerId);
  if (input.command === "/혜택조회")
    return {
      answer:
        detail.evaluation?.result.gains
          .map(
            (r) =>
              `${r.title}: ${r.status === "MATCH" ? "입력 기준 조건 부합" : r.status === "NO_MATCH" ? "입력 기준 조건 불충족" : "추가 확인 필요"}`,
          )
          .join("\n") || "게시된 혜택 규칙이 없습니다.",
      escalated: false,
    };
  if (input.command === "/서류안내")
    return {
      answer:
        detail.tasks
          .filter((t) => t.status !== "RETIRED")
          .map(
            (t) =>
              `${t.title} · ${t.guide.destination}${t.deadline_date ? ` · 준비 목표일 ${t.deadline_date}` : " · 기한 확인 필요"}`,
          )
          .join("\n") || "등록된 준비 항목이 없습니다.",
      escalated: false,
    };
  if (input.message.length < 5)
    return { answer: "확인할 내용을 5자 이상 적어주세요.", escalated: false };
  await db.query("INSERT INTO feedback(id,owner_id,evaluation_id,message) VALUES($1,$2,$3,$4)", [
    randomUUID(),
    ownerId,
    detail.evaluation?.id ?? null,
    `[${input.command === "/오류신고" ? "오류 신고" : "미답변 질문 · 규칙 보완 후보"}] ${input.message}`,
  ]);
  return {
    answer: "운영자 검수함에 접수했습니다. 확인 전에는 새로운 조건을 추측해 안내하지 않습니다.",
    escalated: true,
  };
}

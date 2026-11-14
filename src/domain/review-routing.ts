import type { Definition } from "./contracts";

export type ChangeKind = "WORDING" | "CRITERIA" | "NEW_POLICY" | "STOPPED" | "UNKNOWN";
export type Decision = {
  kind: ChangeKind;
  confidence: number;
  sourceAgreement: number;
  urgency: number;
  abstain: boolean;
};
export type ReviewAssessment = Decision & {
  method: "JEV" | "LOCAL_RULES";
  priority: 1 | 2 | 3;
  lane: "URGENT" | "HUMAN_REVIEW" | "LOW_RISK";
  reason: string;
  model: string | null;
  errorCode: string | null;
  evidenceAvailable: boolean;
  requiresHumanApproval: true;
};
export function routeReview(
  previous: Definition | null,
  next: Definition,
  decision: Decision | null,
  evidenceAvailable: boolean,
  model: string | null = null,
  errorCode: string | null = null,
): ReviewAssessment {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const critical =
    !previous || !same(previous.conditions, next.conditions) || !same(previous.tasks, next.tasks);
  const d: Decision = decision ?? {
    kind: previous ? (critical ? "CRITERIA" : "UNKNOWN") : "NEW_POLICY",
    confidence: 0,
    sourceAgreement: 0,
    urgency: critical ? 2 : 1,
    abstain: true,
  };
  const urgent = !previous || d.kind === "NEW_POLICY" || d.kind === "STOPPED" || d.urgency >= 1.5;
  const lowRisk =
    !critical &&
    same(previous?.sources, next.sources) &&
    d.kind === "WORDING" &&
    !d.abstain &&
    d.confidence >= 0.9 &&
    d.sourceAgreement >= 0.9 &&
    evidenceAvailable;
  return {
    ...d,
    method: decision ? "JEV" : "LOCAL_RULES",
    priority: urgent ? 1 : lowRisk ? 3 : 2,
    lane: urgent ? "URGENT" : lowRisk ? "LOW_RISK" : "HUMAN_REVIEW",
    reason: urgent
      ? "신규·중단·긴급 변경을 먼저 검수합니다."
      : critical
        ? "조건·서류·기한 변경은 사람이 검수해야 합니다."
        : lowRisk
          ? "표현 변경 후보입니다. 원문 확인 후 사람이 승인합니다."
          : !evidenceAvailable
            ? "대조할 수집 원문이 부족합니다. 직접 확인해야 합니다."
            : "불확실성·출처 일치 여부를 사람이 확인해야 합니다.",
    model: decision ? model : null,
    errorCode,
    evidenceAvailable,
    requiresHumanApproval: true,
  };
}

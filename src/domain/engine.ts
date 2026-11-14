import {
  definitionSchema,
  type BusinessInput,
  type Condition,
  type Evaluation,
  type FactName,
  type Facts,
  type HireInput,
  type PolicyVersion,
  type ResultStatus,
  type RuleResult,
} from "./contracts";

export type Truth = true | false | null;
export function evaluateCondition(
  condition: Condition,
  facts: Facts,
): { value: Truth; missing: FactName[] } {
  if ("all" in condition || "any" in condition) {
    const all = "all" in condition;
    const results = (all ? condition.all : (condition as { any: Condition[] }).any).map((c) =>
      evaluateCondition(c, facts),
    );
    const values = results.map((r) => r.value);
    const value = all
      ? values.includes(false)
        ? false
        : values.includes(null)
          ? null
          : true
      : values.includes(true)
        ? true
        : values.includes(null)
          ? null
          : false;
    return {
      value,
      missing: value === null ? [...new Set(results.flatMap((r) => r.missing))] : [],
    };
  }
  const actual = facts[condition.field];
  if (actual === undefined || actual === null) return { value: null, missing: [condition.field] };
  const expected = condition.value;
  let value: boolean;
  switch (condition.op) {
    case "eq":
      value = actual === expected;
      break;
    case "ne":
      value = actual !== expected;
      break;
    case "in":
      value = Array.isArray(expected) && expected.some((v) => v === actual);
      break;
    default: {
      if (typeof actual !== "number" || typeof expected !== "number")
        throw new Error("숫자 비교 조건의 타입이 올바르지 않습니다.");
      value =
        condition.op === "lt"
          ? actual < expected
          : condition.op === "lte"
            ? actual <= expected
            : condition.op === "gt"
              ? actual > expected
              : actual >= expected;
    }
  }
  return { value, missing: [] };
}

export function evaluatePlan(
  business: BusinessInput,
  hire: HireInput,
  policies: PolicyVersion[],
  allowDemo: boolean,
): Evaluation {
  const after: Facts = {
    ...hire,
    hasHire: true,
    currentHeadcount: business.currentHeadcount,
    plannedHeadcount: business.currentHeadcount + 1,
  };
  const before: Facts = {
    ...after,
    hasHire: false,
    plannedHeadcount: business.currentHeadcount,
    monthlyAveragePay: null,
    historyRequirementMet: null,
  };
  const outOfScope =
    business.businessType !== "SOLE" ||
    business.industry === "OTHER" ||
    hire.employmentType !== "REGULAR";
  const all: RuleResult[] = policies.map((policy) => {
    let status: ResultStatus = "REVIEW_REQUIRED";
    let beforeStatus: ResultStatus = "REVIEW_REQUIRED";
    let missing: FactName[] = [];
    const valid = definitionSchema.safeParse(policy.definition);
    const sourcesReady =
      valid.success &&
      (policy.isDemo
        ? allowDemo
        : Boolean(policy.verifiedAt) && policy.definition.sources.every((s) => s.verified));
    const dateReady =
      policy.effectiveFrom <= hire.startDate &&
      (!policy.effectiveTo || policy.effectiveTo >= hire.startDate);
    if (outOfScope) status = beforeStatus = "OUT_OF_SCOPE";
    else if (
      policy.status === "APPROVED" &&
      sourcesReady &&
      dateReady &&
      (!policy.isDemo || allowDemo)
    ) {
      const result = evaluateCondition(policy.definition.conditions, after);
      const previous = evaluateCondition(policy.definition.conditions, before);
      status = result.value === null ? "NEEDS_INFO" : result.value ? "MATCH" : "NO_MATCH";
      beforeStatus = previous.value === null ? "NEEDS_INFO" : previous.value ? "MATCH" : "NO_MATCH";
      missing = result.missing;
    }
    return {
      policyId: policy.policyId,
      policyVersionId: policy.id,
      title: policy.title,
      kind: policy.kind,
      status,
      beforeStatus,
      missingFields: missing,
      explanation: valid.success ? policy.definition.explanation : "규칙 형식 검수가 필요합니다.",
      sources: valid.success ? policy.definition.sources : [],
      version: policy.version,
      isDemo: policy.isDemo,
      tasks:
        valid.success &&
        status !== "NO_MATCH" &&
        status !== "OUT_OF_SCOPE" &&
        status !== "REVIEW_REQUIRED"
          ? policy.definition.tasks
          : [],
    };
  });
  return {
    gains: all.filter((r) => r.kind === "BENEFIT"),
    changes: all.filter((r) => r.kind === "CHANGE"),
    taskRules: all.filter((r) => r.kind === "TASK"),
    all,
    missingFields: [...new Set(all.flatMap((r) => r.missingFields))],
    basisDate: hire.startDate,
    isDemo: all.some((r) => r.isDemo),
    coverage:
      "직원 1명 상용 채용 · 개인사업자 카페·음식점 · 실제 지급 승인이나 법적 적용 확정이 아닌 준비 안내",
  };
}

export function validateDefinition(definition: unknown): string[] {
  const parsed = definitionSchema.safeParse(definition);
  if (!parsed.success) return parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  const errors: string[] = [];
  let count = 0;
  const walk = (c: Condition, depth: number) => {
    count++;
    if (depth > 8 || count > 150) {
      errors.push("규칙이 너무 복잡합니다.");
      return;
    }
    if ("all" in c) c.all.forEach((v) => walk(v, depth + 1));
    else if ("any" in c) c.any.forEach((v) => walk(v, depth + 1));
    else if (["lt", "lte", "gt", "gte"].includes(c.op) && typeof c.value !== "number")
      errors.push("숫자 비교에는 숫자 기준값이 필요합니다.");
    else if (c.op === "in" && !Array.isArray(c.value))
      errors.push("in 연산에는 목록이 필요합니다.");
  };
  walk(parsed.data.conditions, 0);
  for (const s of parsed.data.sources)
    if (new URL(s.url).protocol !== "https:") errors.push("근거 링크는 HTTPS여야 합니다.");
  for (const task of parsed.data.tasks)
    if (task.deadlineKind === "PREPARATION" && task.offsetDays === null)
      errors.push("준비 목표일에는 상대 일수가 필요합니다.");
  return [...new Set(errors)];
}

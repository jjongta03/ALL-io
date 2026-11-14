import { describe, expect, test } from "vitest";
import { evaluateCondition, evaluatePlan, validateDefinition } from "../src/domain/engine";
import { hash } from "../src/server/hashing";
import { businessSchema, hireSchema, type PolicyVersion } from "../src/domain/contracts";
import { demoDefinitions } from "../src/server/seed";
import { business, hire } from "./helpers";

const policies = (): PolicyVersion[] =>
  demoDefinitions().map((d, i) => ({
    id: `version-${i}`,
    policyId: d.slug,
    title: d.title,
    kind: d.kind,
    version: 1,
    status: "APPROVED",
    isDemo: true,
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-12-31",
    verifiedAt: null,
    definition: d.definition,
  }));
describe("조건과 변경 판정", () => {
  test.each([
    [2499999, "MATCH"],
    [2500000, "NO_MATCH"],
    [2500001, "NO_MATCH"],
  ] as const)("가상 미만 기준 경계값 %i", (pay, status) => {
    expect(
      evaluatePlan(business, { ...hire, monthlyAveragePay: pay }, policies(), true).gains[0].status,
    ).toBe(status);
  });
  test("모름을 false나 0으로 대체하지 않는다", () => {
    const result = evaluatePlan(
      business,
      { ...hire, historyRequirementMet: null },
      policies(),
      true,
    ).gains[0];
    expect(result.status).toBe("NEEDS_INFO");
    expect(result.missingFields).toContain("historyRequirementMet");
  });
  test("현재 직원 수를 보험 인원에 대입하지 않는다", () => {
    expect(
      evaluatePlan(business, { ...hire, insuranceHeadcount: null }, policies(), true).gains[0]
        .status,
    ).toBe("NEEDS_INFO");
  });
  test("상시근로자 자료 미확인을 5명으로 확정하지 않는다", () => {
    expect(evaluatePlan(business, hire, policies(), true).changes[0].status).toBe("NEEDS_INFO");
  });
  test("전후 상태는 분리되고 원본을 바꾸지 않는다", () => {
    const snapshot = structuredClone(business);
    const r = evaluatePlan(snapshot, hire, policies(), true).gains[0];
    expect(r.beforeStatus).toBe("NO_MATCH");
    expect(r.status).toBe("MATCH");
    expect(snapshot).toEqual(business);
  });
  test("AND false와 unknown, OR true와 unknown의 논리", () => {
    const unknown = { field: "monthlyAveragePay", op: "lt", value: 100 } as const;
    const no = { field: "hasHire", op: "eq", value: true } as const;
    expect(evaluateCondition({ all: [unknown, no] }, { hasHire: false }).value).toBe(false);
    expect(evaluateCondition({ any: [unknown, no] }, { hasHire: true }).value).toBe(true);
  });
  test("미승인·가상 운영규칙·적용기간 밖은 판정에 사용하지 않는다", () => {
    const p = policies();
    p[0].status = "PENDING_REVIEW";
    expect(evaluatePlan(business, hire, p, true).gains[0].status).toBe("REVIEW_REQUIRED");
    expect(evaluatePlan(business, hire, policies(), false).gains[0].status).toBe("REVIEW_REQUIRED");
    expect(
      evaluatePlan(business, { ...hire, startDate: "2030-01-01" }, policies(), true).gains[0]
        .status,
    ).toBe("REVIEW_REQUIRED");
  });
  test("유효기간 양 끝은 포함된다", () => {
    for (const date of ["2026-01-01", "2027-12-31"])
      expect(
        evaluatePlan(business, { ...hire, startDate: date }, policies(), true).gains[0].status,
      ).toBe("MATCH");
  });
  test("지원 범위 밖에서는 자격을 단정하지 않는다", () => {
    expect(
      evaluatePlan({ ...business, industry: "OTHER" }, hire, policies(), true).all.every(
        (r) => r.status === "OUT_OF_SCOPE",
      ),
    ).toBe(true);
  });
  test("실제 규칙은 미검수 출처로 통과할 수 없다", () => {
    const p = policies();
    p[0].isDemo = false;
    p[0].verifiedAt = "2026-01-01";
    expect(evaluatePlan(business, hire, p, true).gains[0].status).toBe("REVIEW_REQUIRED");
  });
  test("숫자 비교 조건과 달력 날짜의 잘못된 입력을 거절한다", () => {
    expect(
      validateDefinition({
        ...demoDefinitions()[0].definition,
        conditions: { field: "monthlyAveragePay", op: "lt", value: "2500000" },
      }).length,
    ).toBeGreaterThan(0);
    expect(hireSchema.safeParse({ ...hire, startDate: "2027-02-30" }).success).toBe(false);
    expect(businessSchema.safeParse({ ...business, currentHeadcount: -1 }).success).toBe(false);
  });
  test("객체 키 순서가 달라도 같은 해시", () =>
    expect(hash({ a: 1, b: 2 })).toBe(hash({ b: 2, a: 1 })));
  test("고용보험과 국민연금 가입 이력을 각각 판정한다", () => {
    const p = [structuredClone(policies()[0]), structuredClone(policies()[0])];
    p[0].policyId = "employment";
    p[1].policyId = "pension";
    p[0].definition.conditions = {
      field: "employmentHistoryRequirementMet",
      op: "eq",
      value: true,
    };
    p[1].definition.conditions = { field: "pensionHistoryRequirementMet", op: "eq", value: true };
    const result = evaluatePlan(
      business,
      { ...hire, employmentHistoryRequirementMet: true, pensionHistoryRequirementMet: false },
      p,
      true,
    );
    expect(result.gains.map((r) => r.status)).toEqual(["MATCH", "NO_MATCH"]);
  });
});

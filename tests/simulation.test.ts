import { expect, test } from "vitest";
import { simulatePlan } from "../src/domain/simulation";
import { demoDefinitions } from "../src/server/seed";
import type { PolicyVersion } from "../src/domain/contracts";
import { business, hire } from "./helpers";
const policies: PolicyVersion[] = demoDefinitions().map((p) => ({
  id: p.slug,
  policyId: p.slug,
  title: p.title,
  kind: p.kind,
  definition: p.definition,
  version: 1,
  status: "APPROVED",
  isDemo: true,
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  verifiedAt: null,
}));
test("시뮬레이터의 급여 경계 변화는 저장 판정과 같은 엔진을 사용한다", () => {
  const input = { currentHeadcount: 4, monthlyAveragePay: 2500000, insuranceHeadcount: 5 };
  const { comparison } = simulatePlan(business, hire, policies, true, input);
  expect(comparison[0]).toMatchObject({ before: "MATCH", after: "NO_MATCH" });
});
test("직원 수를 바꿔도 보험 인원을 추론하지 않고 원본을 보존한다", () => {
  const b = structuredClone(business),
    h = { ...hire, insuranceHeadcount: null };
  const snapshot = structuredClone(h);
  const r = simulatePlan(b, h, policies, true, {
    currentHeadcount: 20,
    monthlyAveragePay: hire.monthlyAveragePay,
    insuranceHeadcount: null,
  });
  expect(r.result.gains[0].status).toBe("NEEDS_INFO");
  expect(b).toEqual(business);
  expect(h).toEqual(snapshot);
});
test("음수·소수 인원과 NaN은 시뮬레이션 입력에서 거절한다", () => {
  for (const currentHeadcount of [-1, 1.5, NaN, 1001])
    expect(() =>
      simulatePlan(business, hire, policies, true, {
        currentHeadcount,
        monthlyAveragePay: null,
        insuranceHeadcount: null,
      }),
    ).toThrow();
});
test("미검수 규칙은 시뮬레이션에서도 자격으로 표시하지 않는다", () => {
  const r = simulatePlan(business, hire, policies, false, {
    currentHeadcount: 4,
    monthlyAveragePay: hire.monthlyAveragePay,
    insuranceHeadcount: 5,
  });
  expect(r.result.gains[0].status).toBe("REVIEW_REQUIRED");
});

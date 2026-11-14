import {
  businessSchema,
  hireSchema,
  type BusinessInput,
  type HireInput,
  type PolicyVersion,
} from "./contracts";
import { evaluatePlan } from "./engine";

export const simulationSchema = businessSchema
  .pick({ currentHeadcount: true })
  .extend({
    monthlyAveragePay: hireSchema.shape.monthlyAveragePay,
    insuranceHeadcount: hireSchema.shape.insuranceHeadcount,
    employmentHeadcount: hireSchema.shape.employmentHeadcount,
    pensionHeadcount: hireSchema.shape.pensionHeadcount,
  })
  .strict();
export function simulatePlan(
  business: BusinessInput,
  hire: HireInput,
  policies: PolicyVersion[],
  allowDemo: boolean,
  input: unknown,
) {
  const patch = simulationSchema.parse(input);
  const baseline = evaluatePlan(business, hire, policies, allowDemo);
  const result = evaluatePlan(
    { ...business, currentHeadcount: patch.currentHeadcount },
    { ...hire, ...patch },
    policies,
    allowDemo,
  );
  return {
    result,
    comparison: result.all.map((r) => ({
      policyId: r.policyId,
      title: r.title,
      kind: r.kind,
      before: baseline.all.find((b) => b.policyId === r.policyId)!.status,
      after: r.status,
      missingFields: r.missingFields,
    })),
  };
}

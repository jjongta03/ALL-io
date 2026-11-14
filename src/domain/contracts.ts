import { z } from "zod";

export const factNames = [
  "hasHire",
  "currentHeadcount",
  "plannedHeadcount",
  "insuranceHeadcount",
  "monthlyAveragePay",
  "historyRequirementMet",
  "exclusionClear",
  "durationRemaining",
  "hoursRequirementMet",
  "coverageConfirmed",
  "laborCountConfirmed",
  "employmentHeadcount",
  "pensionHeadcount",
  "employmentHistoryRequirementMet",
  "pensionHistoryRequirementMet",
  "industry",
  "region",
  "businessType",
  "revenueBand",
  "businessAgeMonths",
  "ownerAgeYears",
  "hasPastBusiness",
] as const;
export type FactName = (typeof factNames)[number];
export type FactValue = string | number | boolean | null;
export type Facts = Partial<Record<FactName, FactValue>>;
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | {
      field: FactName;
      op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in";
      value: string | number | boolean | (string | number)[];
    };
const atomic = z
  .object({
    field: z.enum(factNames),
    op: z.enum(["eq", "ne", "lt", "lte", "gt", "gte", "in"]),
    value: z.union([
      z.string(),
      z.number().finite(),
      z.boolean(),
      z.array(z.union([z.string(), z.number()])).max(30),
    ]),
  })
  .strict();
export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    atomic,
    z.object({ all: z.array(conditionSchema).min(1).max(20) }).strict(),
    z.object({ any: z.array(conditionSchema).min(1).max(20) }).strict(),
  ]),
);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "올바른 날짜를 입력하세요.");
const tri = z.boolean().nullable();
export const businessSchema = z
  .object({
    nickname: z.string().trim().min(1).max(80),
    industry: z.enum(["CAFE", "RESTAURANT", "OTHER"]),
    region: z.string().trim().min(1).max(80),
    businessType: z.enum(["SOLE", "CORPORATE"]),
    currentHeadcount: z.number().int().min(0).max(1000),
    existingBenefit: z.enum(["YES", "NO", "UNKNOWN"]).default("UNKNOWN"),
  })
  .strict();
export type BusinessInput = z.infer<typeof businessSchema>;
export const hireSchema = z
  .object({
    startDate: dateSchema,
    employmentType: z.enum(["REGULAR", "DAILY", "OTHER"]),
    monthlyAveragePay: z.number().int().min(0).max(1000000000).nullable(),
    insuranceHeadcount: z.number().int().min(0).max(1000).nullable(),
    historyRequirementMet: tri,
    exclusionClear: tri,
    durationRemaining: tri,
    hoursRequirementMet: tri,
    coverageConfirmed: tri,
    laborCountConfirmed: tri,
    employmentHeadcount: z.number().int().min(0).max(1000).nullable().optional(),
    pensionHeadcount: z.number().int().min(0).max(1000).nullable().optional(),
    employmentHistoryRequirementMet: tri.optional(),
    pensionHistoryRequirementMet: tri.optional(),
  })
  .strict();
export type HireInput = z.infer<typeof hireSchema>;
export const taskTemplateSchema = z
  .object({
    key: z.string().min(1).max(80),
    title: z.string().min(1).max(150),
    description: z.string().max(2000),
    destination: z.string().max(200),
    url: z.string().url(),
    deadlineKind: z.enum(["PREPARATION", "NEEDS_CONFIRMATION"]),
    offsetDays: z.number().int().min(-60).max(365).nullable(),
  })
  .strict();
export type TaskTemplate = z.infer<typeof taskTemplateSchema>;
export const definitionSchema = z
  .object({
    applicationWindow: z
      .object({ open: z.boolean(), startsOn: dateSchema, endsOn: dateSchema.nullable() })
      .strict()
      .optional(),
    conditions: conditionSchema,
    explanation: z.string().min(1).max(3000),
    tasks: z.array(taskTemplateSchema).max(15),
    sources: z
      .array(
        z
          .object({
            title: z.string().min(1).max(200),
            url: z.string().url(),
            verified: z.boolean(),
            section: z.string().min(12).max(500),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();
export type Definition = z.infer<typeof definitionSchema>;
export type PolicyVersion = {
  id: string;
  policyId: string;
  title: string;
  kind: "BENEFIT" | "CHANGE" | "TASK";
  version: number;
  status: "APPROVED" | "PENDING_REVIEW" | "REJECTED" | "SUSPENDED";
  isDemo: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  verifiedAt: string | null;
  definition: Definition;
};
export type ResultStatus = "MATCH" | "NO_MATCH" | "NEEDS_INFO" | "REVIEW_REQUIRED" | "OUT_OF_SCOPE";
export type RuleResult = {
  policyId: string;
  policyVersionId: string;
  title: string;
  kind: PolicyVersion["kind"];
  status: ResultStatus;
  beforeStatus: ResultStatus;
  missingFields: FactName[];
  explanation: string;
  sources: Definition["sources"];
  version: number;
  isDemo: boolean;
  tasks: TaskTemplate[];
};
export type Evaluation = {
  gains: RuleResult[];
  changes: RuleResult[];
  taskRules: RuleResult[];
  all: RuleResult[];
  missingFields: FactName[];
  basisDate: string;
  isDemo: boolean;
  coverage: string;
};
export const factsLabels: Record<FactName, string> = {
  industry: "업종",
  region: "지역",
  businessType: "사업 형태",
  revenueBand: "매출 구간",
  businessAgeMonths: "사업 기간(개월)",
  ownerAgeYears: "사업주 나이",
  hasPastBusiness: "지난 사업 이력",
  hasHire: "채용 여부",
  currentHeadcount: "현재 직원 수",
  plannedHeadcount: "채용 후 직원 수",
  insuranceHeadcount: "데모 보험 기준 사업장 인원",
  monthlyAveragePay: "예상 월평균보수",
  historyRequirementMet: "데모 보험 가입 이력 요건",
  exclusionClear: "소득·재산 등 제외 요건",
  durationRemaining: "지원기간 잔여 여부",
  hoursRequirementMet: "근로시간 등 가입 요건",
  coverageConfirmed: "보험별 가입 대상 확인",
  laborCountConfirmed: "상시근로자 산정 자료 확인",
  employmentHeadcount: "고용보험 기준 산정 인원",
  pensionHeadcount: "국민연금 기준 산정 인원",
  employmentHistoryRequirementMet: "고용보험 가입 이력 요건",
  pensionHistoryRequirementMet: "국민연금 가입 이력 요건",
};

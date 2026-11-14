import { z } from "zod";
import { dateSchema, definitionSchema, type Facts, type PolicyVersion } from "./contracts";
import { evaluateCondition, validateDefinition } from "./engine";
import { addDays, seoulDate } from "./dates";

const optionalText = z.string().trim().max(200).nullable();
export const ownerProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(80).nullable(),
    birthDate: dateSchema
      .refine((s) => s <= seoulDate(), "미래 생년월일은 사용할 수 없습니다.")
      .nullable(),
    phone: z
      .string()
      .regex(/^01[016789]\d{7,8}$/)
      .nullable(),
    emailAlerts: z.boolean(),
    email: z.email().max(254).nullable().optional(),
  })
  .strict();
export type OwnerProfile = z.infer<typeof ownerProfileSchema>;
export const historySchema = z
  .object({
    name: optionalText,
    industry: optionalText,
    startedOn: dateSchema.nullable(),
    endedOn: dateSchema.nullable(),
    outcome: z.enum(["CLOSED", "TRANSFERRED", "OTHER"]).nullable(),
    memo: optionalText,
  })
  .strict()
  .refine((v) => !v.startedOn || !v.endedOn || v.startedOn <= v.endedOn, "사업 기간을 확인하세요.");
export const workspaceBusinessSchema = z
  .object({
    nickname: z.string().trim().min(1).max(80),
    industry: z.enum(["CAFE", "RESTAURANT", "OTHER"]).nullable(),
    region: optionalText,
    businessType: z.enum(["SOLE", "CORPORATE"]).nullable(),
    startedOn: dateSchema.nullable(),
    revenueBand: optionalText,
    pastBusinesses: z.array(historySchema).max(30),
    pastBusinessHistoryConfirmed: z.boolean().default(false),
    // An empty roster is not assumed to be a verified zero until the owner confirms it.
    rosterConfirmed: z.boolean(),
    confirmedFacts: z
      .object({
        insuranceHeadcount: z.number().int().min(0).max(100000).nullable().optional(),
        employmentHeadcount: z.number().int().min(0).max(100000).nullable().optional(),
        pensionHeadcount: z.number().int().min(0).max(100000).nullable().optional(),
        monthlyAveragePay: z.number().int().min(0).max(1000000000).nullable().optional(),
        historyRequirementMet: z.boolean().nullable().optional(),
        exclusionClear: z.boolean().nullable().optional(),
        durationRemaining: z.boolean().nullable().optional(),
        hoursRequirementMet: z.boolean().nullable().optional(),
        coverageConfirmed: z.boolean().nullable().optional(),
        laborCountConfirmed: z.boolean().nullable().optional(),
        employmentHistoryRequirementMet: z.boolean().nullable().optional(),
        pensionHistoryRequirementMet: z.boolean().nullable().optional(),
      })
      .strict()
      .default({}),
  })
  .strict();
export type WorkspaceBusiness = z.infer<typeof workspaceBusinessSchema>;
export const employeeSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    employmentType: z.enum(["REGULAR", "PART_TIME", "DAILY", "OTHER"]).nullable(),
    weeklyHours: z.number().finite().min(0).max(168).nullable(),
    hourlyWage: z.number().int().min(0).max(100000000).nullable(),
    startedOn: dateSchema.nullable(),
  })
  .strict();
export type EmployeeDetails = z.infer<typeof employeeSchema>;
export const scanDraftSchema = employeeSchema.extend({
  name: z.string().trim().min(1).max(80).nullable(),
});
export const emptyScanDraft = {
  name: null,
  employmentType: null,
  weeklyHours: null,
  hourlyWage: null,
  startedOn: null,
};
export const onboardingSchema = z
  .object({
    stage: z.number().int().min(1).max(4),
    completed: z.boolean().optional(),
    owner: ownerProfileSchema.optional(),
    business: workspaceBusinessSchema.optional(),
  })
  .strict();
export const documentSchema = z
  .object({
    title: z.string().trim().min(1).max(150),
    anchorDate: dateSchema,
    frequency: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]),
    leadDays: z.number().int().min(0).max(30),
    url: z
      .url()
      .refine((s) => {
        const u = new URL(s);
        return u.protocol === "https:" && !u.username && !u.password;
      })
      .nullable(),
    memo: z.string().max(2000).nullable(),
    enabled: z.boolean(),
  })
  .strict();
export type RecurringDocument = z.infer<typeof documentSchema>;

// Anchor-based calculation avoids Jan 31 -> Feb 28 -> Mar 28 drift.
export function occurrenceDate(
  anchor: string,
  frequency: RecurringDocument["frequency"],
  index: number,
) {
  if (frequency === "WEEKLY") return addDays(anchor, index * 7);
  const [y, m, d] = anchor.split("-").map(Number);
  const month = frequency === "MONTHLY" ? m - 1 + index : m - 1;
  const year = frequency === "YEARLY" ? y + index : y;
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last)))
    .toISOString()
    .slice(0, 10);
}
export function currentFacts(
  business: WorkspaceBusiness,
  employeeCount: number,
  birthDate: string | null = null,
): Facts {
  const today = seoulDate();
  const [year, month] = today.split("-").map(Number),
    started = business.startedOn?.split("-").map(Number);
  return {
    ...business.confirmedFacts,
    hasHire: false,
    currentHeadcount: business.rosterConfirmed ? employeeCount : null,
    plannedHeadcount: business.rosterConfirmed ? employeeCount : null,
    industry: business.industry,
    region: business.region,
    businessType: business.businessType,
    revenueBand: business.revenueBand,
    businessAgeMonths:
      started && business.startedOn !== null && business.startedOn <= today
        ? (year - started[0]) * 12 +
          month -
          started[1] -
          (Number(today.slice(8)) < started[2] ? 1 : 0)
        : null,
    ownerAgeYears: birthDate
      ? year - Number(birthDate.slice(0, 4)) - (today.slice(5) < birthDate.slice(5) ? 1 : 0)
      : null,
    hasPastBusiness: business.pastBusinessHistoryConfirmed
      ? business.pastBusinesses.length > 0
      : null,
  };
}
export function evaluateCurrent(
  policies: PolicyVersion[],
  facts: Facts,
  allowDemo: boolean,
  basisDate = seoulDate(),
) {
  return policies.map((p) => {
    const valid = definitionSchema.safeParse(p.definition).success;
    const window = p.definition.applicationWindow;
    const ready =
      valid &&
      p.status === "APPROVED" &&
      (!p.isDemo || allowDemo) &&
      (p.isDemo
        ? allowDemo
        : Boolean(p.verifiedAt) && p.definition.sources.every((s) => s.verified)) &&
      (p.kind !== "BENEFIT" ||
        p.isDemo ||
        Boolean(
          window?.open &&
          (!window.endsOn || window.endsOn >= window.startsOn) &&
          window.startsOn <= basisDate &&
          (!window.endsOn || window.endsOn >= basisDate),
        )) &&
      !validateDefinition(p.definition).length &&
      p.effectiveFrom <= basisDate &&
      (!p.effectiveTo || p.effectiveTo >= basisDate);
    const result = ready ? evaluateCondition(p.definition.conditions, facts) : null;
    return {
      policyId: p.policyId,
      policyVersionId: p.id,
      title: p.title,
      kind: p.kind,
      isDemo: p.isDemo,
      status: !ready
        ? "REVIEW_REQUIRED"
        : result?.value === null
          ? "NEEDS_INFO"
          : result?.value
            ? "MATCH"
            : "NO_MATCH",
      missingFields: result?.missing ?? [],
      sources: p.definition.sources,
    };
  });
}

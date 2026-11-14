import { ownerProfileSchema, type OwnerProfile, type WorkspaceBusiness } from "./workspace";

export function ownerRequiredError(owner: OwnerProfile | null | undefined) {
  const missing = [
    !owner?.name?.trim() && "이름",
    !owner?.birthDate && "생년월일",
    !owner?.phone?.trim() && "휴대전화",
    !owner?.email?.trim() && "이메일",
  ].filter(Boolean);
  if (missing.length) return `필수 항목을 입력해 주세요. (${missing.join(", ")})`;
  const parsed = ownerProfileSchema.safeParse(owner);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "birthDate")
      return "올바른 생년월일을 입력해 주세요. 미래 날짜는 입력할 수 없습니다.";
    if (field === "phone") return "올바른 휴대전화 번호를 입력해 주세요.";
    if (field === "email") return "올바른 이메일 주소를 입력해 주세요.";
    return "입력한 정보를 확인해 주세요.";
  }
  return "";
}

export function onboardingState(
  profile: OwnerProfile | null,
  business: { facts: WorkspaceBusiness } | null,
  draft: { stage?: number; completed?: boolean; owner?: OwnerProfile } | null,
) {
  const complete =
    typeof profile?.emailAlerts === "boolean" &&
    business?.facts.rosterConfirmed === true &&
    draft?.completed !== false;
  const savedStage = draft?.stage ?? (business ? 4 : 1);
  if (draft?.completed === false && ownerRequiredError(draft.owner))
    return { complete: false, stage: 1 };
  // Step four requires the business saved by step three.
  const stage = Math.max(1, Math.min(business ? 4 : 3, savedStage));
  return { complete, stage };
}

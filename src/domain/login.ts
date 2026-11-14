/** Permit only known application pages as a post-login destination. */
export function loginDestination(value?: string): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020\u007f]/.test(value)
  )
    return "/dashboard";
  const origin = "https://local.invalid";
  try {
    const url = new URL(value, origin);
    const known = [
      "/dashboard",
      "/outbox",
      "/plans",
      "/plans/new",
      "/admin",
      "/admin/integrations",
      "/benefits",
      "/projects",
      "/employees",
      "/changes",
      "/documents",
      "/schedule",
      "/reevaluate",
      "/conditions",
      "/notifications",
      "/mypage",
      "/mypage/owner",
      "/mypage/business",
      "/mypage/history",
      "/onboarding",
      "/onboarding/1",
      "/onboarding/2",
      "/onboarding/3",
      "/onboarding/4",
      "/employees/new",
      "/contracts/new",
    ];
    const parts = url.pathname.split("/").filter(Boolean);
    const resource =
      ["plans", "benefits", "projects", "contracts", "employees"].includes(parts[0]) &&
      /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(parts[1] ?? "") &&
      (parts.length === 2 ||
        (parts.length === 3 && parts[0] === "employees" && parts[2] === "edit"));
    if (url.origin !== origin || (!known.includes(url.pathname) && !resource)) return "/dashboard";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/dashboard";
  }
}

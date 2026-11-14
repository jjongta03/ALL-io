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
    const known = ["/dashboard", "/outbox", "/plans/new", "/admin", "/admin/integrations"];
    if (
      url.origin !== origin ||
      (!known.includes(url.pathname) &&
        !/^\/plans\/[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(url.pathname))
    )
      return "/dashboard";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/dashboard";
  }
}

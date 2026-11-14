import { resolve } from "node:path";

export function getConfig() {
  const production = process.env.APP_ENV === "production";
  const demo = !production && (process.env.APP_MODE ?? "demo") === "demo";
  const appUrl =
    process.env.APP_URL?.trim() ||
    (process.env.RENDER === "true" ? process.env.RENDER_EXTERNAL_URL : undefined) ||
    "http://127.0.0.1:3000";
  // Use a project-scoped name: an unrelated DATABASE_URL may already exist on the host.
  const databaseUrl = process.env.MAWD_DATABASE_URL || null;
  if (
    production &&
    (!databaseUrl || !appUrl.startsWith("https://") || process.env.APP_MODE !== "live")
  )
    throw new Error("운영 환경은 PostgreSQL, HTTPS APP_URL, APP_MODE=live 설정이 필요합니다.");
  return {
    production,
    demo,
    appUrl,
    databaseUrl,
    localDatabasePath: resolve(process.env.LOCAL_DATABASE_PATH ?? "./data/postgres"),
    liveIntegrations: process.env.LIVE_INTEGRATIONS_ENABLED === "true",
    emailTransport: process.env.EMAIL_TRANSPORT ?? "local",
    sourceCollection: process.env.SOURCE_COLLECTION_ENABLED === "true",
  };
}

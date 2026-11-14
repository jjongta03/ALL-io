import "./env";
import { getConfig } from "../src/server/config";
import { getDb, closeDb } from "../src/server/db";
async function main() {
  const config = getConfig();
  const result = {
    node: process.version,
    appEnvironment: config.production ? "production" : "local",
    mode: config.demo ? "demo" : "live",
    database: config.databaseUrl ? "PostgreSQL" : "PGlite (local-only)",
    externalCallsEnabled: config.liveIntegrations,
    emailTransport: config.emailTransport,
    apiKeyPresence: Object.fromEntries(
      ["LINER_API_KEY", "NTS_API_KEY", "STIBEE_API_KEY", "STIBEE_AUTO_EMAIL_URL"].map((k) => [
        k,
        Boolean(process.env[k]),
      ]),
    ),
    migrations: await (await getDb()).query("SELECT name FROM schema_migrations"),
    policyCounts: await (
      await getDb()
    ).query("SELECT status,count(*)::int AS count FROM policy_versions GROUP BY status"),
  };
  console.log(JSON.stringify(result, null, 2));
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "환경 점검 실패");
    process.exitCode = 1;
  })
  .finally(closeDb);

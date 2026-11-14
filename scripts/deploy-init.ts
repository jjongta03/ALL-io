import "./env";
import { getDb, migrate, closeDb } from "../src/server/db";
import { getConfig } from "../src/server/config";
import { protectDocument } from "../src/server/workspace-secrets";
async function main() {
  if (!getConfig().production) throw new Error("Production configuration required");
  // Check the persistent encryption key before accepting traffic or storing any contracts.
  protectDocument(Buffer.from("deployment-key-check"));
  const db = await getDb();
  await migrate(db);
  console.log("Visitor access ready. Existing users and permissions preserved.");
  console.log("Production database initialized. Demo rules were not seeded.");
}
main()
  .catch(() => {
    console.error("deployment_initialization_failed: check database, origin, encryption key.");
    process.exitCode = 1;
  })
  .finally(closeDb);

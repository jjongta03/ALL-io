import "./env";
import { getDb, migrate, closeDb } from "../src/server/db";
import { getConfig } from "../src/server/config";
import { bootstrapOwner } from "../src/server/deployment";
import { protectDocument } from "../src/server/workspace-secrets";
async function main() {
  if (!getConfig().production) throw new Error("Production configuration required");
  // Check the persistent encryption key before accepting traffic or storing any contracts.
  protectDocument(Buffer.from("deployment-key-check"));
  const db = await getDb();
  await migrate(db);
  const email = process.env.BOOTSTRAP_OWNER_EMAIL,
    password = process.env.BOOTSTRAP_OWNER_PASSWORD;
  if (email && password) {
    const result = await bootstrapOwner(db, { email, password });
    console.log(
      result.created ? "Initial operator account created." : "Existing accounts preserved.",
    );
  } else if (
    email ||
    password ||
    !(await db.query("SELECT id FROM users WHERE is_demo=false LIMIT 1")).length
  )
    throw new Error("Initial account configuration required");
  console.log("Production database initialized. Demo rules were not seeded.");
}
main()
  .catch(() => {
    console.error(
      "deployment_initialization_failed: check database, origin, encryption key and initial account configuration.",
    );
    process.exitCode = 1;
  })
  .finally(closeDb);

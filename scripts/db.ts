import "./env";
import { getDb, migrate, closeDb } from "../src/server/db";
import { seed } from "../src/server/seed";
async function main() {
  const db = await getDb();
  if (process.argv[2] === "seed") await seed(db);
  else await migrate(db);
  console.log("DB 작업 완료.");
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "DB 작업 실패");
    process.exitCode = 1;
  })
  .finally(closeDb);

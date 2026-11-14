import "./env";
import { z } from "zod";
import { getDb, closeDb } from "../src/server/db";
import { runJob } from "../src/server/jobs";
async function main() {
  const kind = z.enum(["notifications", "collect"]).parse(process.argv[2] ?? "notifications");
  console.log(JSON.stringify(await runJob(await getDb(), kind), null, 2));
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "작업 실패");
    process.exitCode = 1;
  })
  .finally(closeDb);

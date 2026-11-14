import "./env";
import { getDb, closeDb } from "../src/server/db";
import { connectedJobs, runConnectedJob } from "../src/server/connected-workflows";
async function main() {
  const kind = process.argv[2];
  if (!connectedJobs.includes(kind as (typeof connectedJobs)[number]))
    throw new Error("Unknown job");
  try {
    console.log(
      JSON.stringify(await runConnectedJob(await getDb(), kind as (typeof connectedJobs)[number])),
    );
  } finally {
    await closeDb();
  }
}
main().catch(() => {
  console.error("연동 작업 실패: 설정과 단일 DB 프로세스를 확인하세요.");
  process.exitCode = 1;
});

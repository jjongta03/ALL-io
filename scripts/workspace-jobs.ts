import "./env";
import { getDb, closeDb } from "../src/server/db";
import {
  dispatchWorkspaceNotifications,
  reassessWorkspaces,
} from "../src/server/workspace-notifications";
async function main() {
  const db = await getDb();
  try {
    const kind = process.argv[2];
    if (kind !== "notifications" && kind !== "reassess")
      throw new Error("notifications 또는 reassess를 지정하세요.");
    console.log(
      JSON.stringify(
        kind === "notifications"
          ? await dispatchWorkspaceNotifications(db)
          : await reassessWorkspaces(db),
      ),
    );
  } finally {
    await closeDb();
  }
}
main().catch(() => {
  console.error("작업 실패: 설정과 DB 프로세스를 확인하세요.");
  process.exitCode = 1;
});

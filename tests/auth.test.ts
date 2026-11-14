import { afterAll, beforeAll, expect, test } from "vitest";
import { createSession, digestToken, hashPassword, verifyPassword } from "../src/server/auth";
import { testDatabase } from "./helpers";
import type { Database } from "../src/server/db";

let db: Database, owner: string;
beforeAll(async () => {
  ({ db, owner } = await testDatabase());
}, 30000);
afterAll(async () => {
  if (db) await db.close();
});
test("비밀번호는 무작위 salt로 해시하고 일치 여부를 검증한다", () => {
  const a = hashPassword("local-test-password"),
    b = hashPassword("local-test-password");
  expect(a).not.toBe(b);
  expect(a).not.toContain("local-test-password");
  expect(verifyPassword("local-test-password", a)).toBe(true);
  expect(verifyPassword("different-password", a)).toBe(false);
  expect(verifyPassword("anything", "broken")).toBe(false);
});
test("원문 세션 토큰을 DB에 저장하지 않는다", async () => {
  const session = await createSession(db, owner);
  const rows = await db.query<{ token_hash: string; user_id: string }>(
    "SELECT token_hash,user_id FROM sessions WHERE token_hash=$1",
    [digestToken(session.token)],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].token_hash).not.toBe(session.token);
  expect(rows[0].user_id).toBe(owner);
  expect(session.expires.getTime()).toBeGreaterThan(Date.now());
});
test("폐기한 세션은 DB에서 다시 조회되지 않는다", async () => {
  const session = await createSession(db, owner);
  await db.query("DELETE FROM sessions WHERE token_hash=$1", [digestToken(session.token)]);
  expect(
    await db.query("SELECT token_hash FROM sessions WHERE token_hash=$1", [
      digestToken(session.token),
    ]),
  ).toHaveLength(0);
});

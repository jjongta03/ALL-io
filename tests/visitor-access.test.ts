import { beforeAll, afterAll, test, expect } from "vitest";
import { createVisitorSession, sessionUser, digestToken } from "../src/server/auth";
import { testDatabase } from "./helpers";
import type { Database } from "../src/server/db";
import * as workspace from "../src/server/workspace";
import { workspaceBusinessSchema } from "../src/domain/workspace";
let db: Database, owner: string;
beforeAll(async () => {
  ({ db, owner } = await testDatabase());
}, 30000);
afterAll(async () => {
  await db.close();
});
test("방문자는 관리자 권한이나 비밀번호 없이 별도 OWNER로 생성한다", async () => {
  const first = await createVisitorSession(db),
    second = await createVisitorSession(db);
  expect(first.userId).not.toBe(second.userId);
  expect(first.token).not.toBe(second.token);
  const a = await sessionUser(db, first.token, false);
  expect(a).toMatchObject({ id: first.userId, role: "OWNER", is_guest: true, is_demo: false });
  expect((await sessionUser(db, second.token, false))?.id).toBe(second.userId);
  const row = (await db.query("SELECT password_hash FROM users WHERE id=$1", [first.userId]))[0];
  expect(row.password_hash).toBeNull();
  expect((await db.query("SELECT role,is_demo FROM users WHERE id=$1", [owner]))[0]).toMatchObject({
    role: "ADMIN",
    is_demo: true,
  });
});
test("방문자 토큰은 해시만 저장하고 30일 만료를 사용한다", async () => {
  const session = await createVisitorSession(db);
  const row = (
    await db.query<{ token_hash: string }>("SELECT token_hash FROM sessions WHERE user_id=$1", [
      session.userId,
    ])
  )[0];
  expect(row.token_hash).toBe(digestToken(session.token));
  expect(row.token_hash).not.toBe(session.token);
  expect(session.expires.getTime() - Date.now()).toBeGreaterThan(29 * 86400000);
});
test("브라우저별 방문자 데이터와 기존 계정의 데이터는 서로 조회할 수 없다", async () => {
  const a = await createVisitorSession(db),
    b = await createVisitorSession(db);
  const facts = workspaceBusinessSchema.parse({
    nickname: "합성 방문자 사업장",
    industry: "CAFE",
    region: "서울",
    businessType: "SOLE",
    startedOn: null,
    revenueBand: null,
    pastBusinesses: [],
    rosterConfirmed: true,
  });
  const business = await workspace.createBusiness(db, a.userId, facts);
  expect((await workspace.ownBusiness(db, business.id, a.userId)).owner_id).toBe(a.userId);
  await expect(workspace.ownBusiness(db, business.id, b.userId)).rejects.toMatchObject({
    status: 404,
  });
  await expect(workspace.ownBusiness(db, business.id, owner)).rejects.toMatchObject({
    status: 404,
  });
});
test("방문자 계정의 관리자 승격과 비밀번호 설정을 DB에서도 거절한다", async () => {
  const v = await createVisitorSession(db);
  await expect(db.query("UPDATE users SET role='ADMIN' WHERE id=$1", [v.userId])).rejects.toThrow();
  await expect(
    db.query("UPDATE users SET password_hash='invalid' WHERE id=$1", [v.userId]),
  ).rejects.toThrow();
  expect((await sessionUser(db, v.token, false))?.role).toBe("OWNER");
});

import { afterAll, beforeAll, expect, test } from "vitest";
import {
  createSession,
  digestToken,
  hashPassword,
  verifyPassword,
  sessionUser,
  revokeSession,
} from "../src/server/auth";
import { authenticateAccount, loginSchema } from "../src/server/accounts";
import { loginDestination } from "../src/domain/login";
import { randomUUID } from "node:crypto";
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
async function issuedAccount() {
  const id = randomUUID(),
    email = `issued-${id}@local.invalid`,
    password = "synthetic-login-fixture-only";
  await db.query(
    "INSERT INTO users(id,email,password_hash,role,is_demo) VALUES($1,$2,$3,'OWNER',false)",
    [id, email, hashPassword(password)],
  );
  return { id, email, password };
}
test("발급 계정은 이메일 대소문자·앞뒤 공백을 정규화해 로그인하고 해시를 반환하지 않는다", async () => {
  const a = await issuedAccount();
  const result = await authenticateAccount(db, {
    email: `  ${a.email.toUpperCase()}  `,
    password: a.password,
  });
  expect(result).toEqual({ id: a.id, email: a.email, role: "OWNER", is_demo: false });
  expect(result).not.toHaveProperty("password_hash");
});
test("계정 없음·잘못된 비밀번호·데모 계정의 로그인 실패는 같은 오류를 반환한다", async () => {
  const a = await issuedAccount();
  for (const input of [
    { email: a.email, password: "wrong" },
    { email: `missing-${randomUUID()}@local.invalid`, password: a.password },
    { email: "test@local.invalid", password: a.password },
  ]) {
    await expect(authenticateAccount(db, input)).rejects.toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
      message: "이메일 또는 비밀번호를 확인해 주세요.",
    });
  }
});
test("이메일·비밀번호 길이와 불필요한 권한 입력을 거절한다", () => {
  expect(loginSchema.safeParse({ email: "invalid", password: "anything" }).success).toBe(false);
  expect(loginSchema.safeParse({ email: "issued@local.invalid", password: "" }).success).toBe(
    false,
  );
  expect(
    loginSchema.safeParse({ email: "issued@local.invalid", password: "a".repeat(257) }).success,
  ).toBe(false);
  expect(
    loginSchema.safeParse({ email: "issued@local.invalid", password: "anything", role: "ADMIN" })
      .success,
  ).toBe(false);
});
test("반복 시도 제한을 DB에 유지하고 15분 뒤 다시 로그인할 수 있다", async () => {
  const a = await issuedAccount();
  for (let i = 0; i < 8; i++)
    await expect(
      authenticateAccount(db, { email: a.email, password: "wrong" }),
    ).rejects.toMatchObject({ status: 401 });
  await expect(
    authenticateAccount(db, { email: a.email, password: a.password }),
  ).rejects.toMatchObject({ status: 429, code: "LOGIN_RATE_LIMITED" });
  const rows = await db.query<{ bucket: string }>("SELECT bucket FROM login_attempts");
  expect(JSON.stringify(rows)).not.toContain(a.email);
  expect(rows.every((r) => /^[a-f\d]{64}$/.test(r.bucket))).toBe(true);
  await db.query("UPDATE login_attempts SET started_at=now()-interval '16 minutes'");
  expect((await authenticateAccount(db, { email: a.email, password: a.password })).id).toBe(a.id);
});
test("세션 만료·폐기·잘못된 토큰·운영 모드의 데모 세션은 인증되지 않는다", async () => {
  const a = await issuedAccount(),
    session = await createSession(db, a.id);
  expect((await sessionUser(db, session.token, false))?.id).toBe(a.id);
  await db.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [
    digestToken(session.token),
  ]);
  expect(await sessionUser(db, session.token, false)).toBeNull();
  const newer = await createSession(db, a.id);
  await revokeSession(db, newer.token);
  expect(await sessionUser(db, newer.token, true)).toBeNull();
  expect(await sessionUser(db, "invalid", true)).toBeNull();
  const demo = await createSession(db, owner);
  expect(await sessionUser(db, demo.token, false)).toBeNull();
  expect((await sessionUser(db, demo.token, true))?.id).toBe(owner);
});
test("로그인 이후 목적지는 내부 화면만 허용한다", () => {
  expect(loginDestination("/outbox")).toBe("/outbox");
  expect(loginDestination("/benefits")).toBe("/benefits");
  expect(loginDestination("/mypage/owner")).toBe("/mypage/owner");
  expect(loginDestination("/onboarding/3")).toBe("/onboarding/3");
  expect(loginDestination(`/plans/${randomUUID()}`)).toMatch(/^\/plans\//);
  expect(loginDestination("/plans/new?step=1")).toBe("/plans/new?step=1");
  for (const value of [
    undefined,
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/login?next=/login",
    "/api/session",
    "javascript:alert(1)",
    "/dashboard\n//example.com",
    "/%2f%2fexample.com",
  ])
    expect(loginDestination(value)).toBe("/dashboard");
});

import { beforeAll, afterAll, afterEach, test, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { databaseFromPGlite, migrate, type Database } from "../src/server/db";
import { bootstrapOwner } from "../src/server/deployment";
import { verifyPassword } from "../src/server/auth";
import { getConfig } from "../src/server/config";
import { protectDocument, revealDocument } from "../src/server/workspace-secrets";
let db: Database;
beforeAll(async () => {
  const pg = new PGlite();
  await pg.waitReady;
  db = databaseFromPGlite(pg);
  await migrate(db);
}, 30000);
afterAll(async () => {
  await db.close();
});
afterEach(() => vi.unstubAllEnvs());
test("Render의 실제 주소를 쓰되 명시한 Origin과 프로젝트 DB 설정을 우선한다", () => {
  vi.stubEnv("APP_ENV", "production");
  vi.stubEnv("APP_MODE", "live");
  vi.stubEnv("APP_URL", "");
  vi.stubEnv("RENDER", "true");
  vi.stubEnv("RENDER_EXTERNAL_URL", "https://allio-synthetic.onrender.com");
  vi.stubEnv("MAWD_DATABASE_URL", "postgres://synthetic.invalid/test");
  vi.stubEnv("DATABASE_URL", "postgres://unrelated.invalid/other");
  expect(getConfig().appUrl).toBe("https://allio-synthetic.onrender.com");
  expect(getConfig().databaseUrl).toBe("postgres://synthetic.invalid/test");
  expect(getConfig().demo).toBe(false);
  vi.stubEnv("APP_URL", "https://allio.example.com");
  expect(getConfig().appUrl).toBe("https://allio.example.com");
  vi.stubEnv("MAWD_DATABASE_URL", "");
  expect(() => getConfig()).toThrow();
});
test("서버가 아닌 환경에서는 Render 주소를 자동으로 신뢰하지 않는다", () => {
  vi.stubEnv("APP_ENV", "local");
  vi.stubEnv("APP_URL", "");
  vi.stubEnv("RENDER", "false");
  vi.stubEnv("RENDER_EXTERNAL_URL", "https://unrelated.invalid");
  expect(getConfig().appUrl).toBe("http://127.0.0.1:3000");
});
test("영구 base64 키로 계약서를 암호화하며 키 형식 충돌과 잘못된 키를 거절한다", () => {
  vi.stubEnv("APP_ENV", "local");
  vi.stubEnv("CONTRACT_ENCRYPTION_KEY", "");
  vi.stubEnv("CONTRACT_ENCRYPTION_KEY_BASE64", Buffer.alloc(32, 11).toString("base64"));
  const bytes = Buffer.from("synthetic contract"),
    encrypted = protectDocument(bytes);
  expect(encrypted).not.toEqual(bytes);
  expect(revealDocument(encrypted)).toEqual(bytes);
  vi.stubEnv("CONTRACT_ENCRYPTION_KEY_BASE64", Buffer.alloc(32, 12).toString("base64"));
  expect(() => revealDocument(encrypted)).toThrow();
  vi.stubEnv("CONTRACT_ENCRYPTION_KEY_BASE64", "invalid");
  expect(() => protectDocument(bytes)).toThrow();
  vi.stubEnv("CONTRACT_ENCRYPTION_KEY", "11".repeat(32));
  expect(() => protectDocument(bytes)).toThrow();
});
test("운영 최초 계정만 발급하고 재시작 때 비밀번호·역할·기존 데이터를 덮어쓰지 않는다", async () => {
  const password = "synthetic-initial-password-only";
  expect(await bootstrapOwner(db, { email: "  OPERATOR@local.invalid  ", password })).toEqual({
    created: true,
  });
  const account = (
    await db.query<{ password_hash: string; role: string; is_demo: boolean; email: string }>(
      "SELECT * FROM users",
    )
  )[0];
  expect(account.email).toBe("operator@local.invalid");
  expect(account.role).toBe("ADMIN");
  expect(account.is_demo).toBe(false);
  expect(verifyPassword(password, account.password_hash)).toBe(true);
  expect(
    await bootstrapOwner(db, {
      email: "other@local.invalid",
      password: "different-synthetic-password",
    }),
  ).toEqual({ created: false });
  expect(await db.query("SELECT id FROM users")).toHaveLength(1);
  expect((await db.query("SELECT password_hash FROM users"))[0].password_hash).toBe(
    account.password_hash,
  );
  expect(await db.query("SELECT id FROM policies")).toHaveLength(0);
  expect(
    await db.query("SELECT id FROM audit_events WHERE action='account.bootstrap'"),
  ).toHaveLength(1);
  await migrate(db);
  expect(await db.query("SELECT id FROM users")).toHaveLength(1);
});

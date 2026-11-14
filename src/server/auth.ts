import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getDb, type Database } from "./db";
import { getConfig } from "./config";
import { AppError } from "./errors";

export type User = { id: string; email: string; role: "OWNER" | "ADMIN"; is_demo: boolean };
export const SESSION_COOKIE = "mawd_session";
export const digestToken = (token: string) => createHash("sha256").update(token).digest("hex");
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, raw] = stored.split(":");
  if (!salt || !raw || !/^[0-9a-f]{128}$/.test(raw)) return false;
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(raw, "hex"));
}
export async function createSession(db: Database, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + 7 * 86400000);
  await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)", [
    digestToken(token),
    userId,
    expires,
  ]);
  return { token, expires };
}
export async function setSession(userId: string) {
  const session = await createSession(await getDb(), userId);
  (await cookies()).set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getConfig().production,
    path: "/",
    expires: session.expires,
  });
}
export async function getUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await (
    await getDb()
  ).query<User>(
    "SELECT u.id,u.email,u.role,u.is_demo FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [digestToken(token)],
  );
  const user = rows[0] ?? null;
  if (user?.is_demo && !getConfig().demo) return null;
  return user;
}
export async function requireUser(admin = false) {
  const user = await getUser();
  if (!user) throw new AppError(401, "먼저 로그인하거나 데모를 시작하세요.", "UNAUTHENTICATED");
  if (admin && user.role !== "ADMIN")
    throw new AppError(403, "운영자 권한이 필요합니다.", "FORBIDDEN");
  return user;
}
export async function startDemoSession() {
  if (!getConfig().demo) throw new AppError(404, "데모를 사용할 수 없습니다.");
  const db = await getDb();
  const id = randomUUID();
  await db.query("INSERT INTO users(id,email,role,is_demo) VALUES($1,$2,'ADMIN',true)", [
    id,
    `demo-${id}@local.invalid`,
  ]);
  await setSession(id);
  return id;
}

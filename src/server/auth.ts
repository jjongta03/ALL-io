import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getDb, type Sql, type Database } from "./db";
import { getConfig } from "./config";
import { AppError } from "./errors";

export type User = {
  id: string;
  email: string;
  role: "OWNER" | "ADMIN";
  is_demo: boolean;
  is_guest?: boolean;
};
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
export async function createSession(db: Sql, userId: string, days = 7) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + days * 86400000);
  await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)", [
    digestToken(token),
    userId,
    expires,
  ]);
  return { token, expires };
}
export async function setSession(userId: string) {
  const jar = await cookies();
  const db = await getDb();
  const session = await db.transaction(async (tx) => {
    await revokeSession(tx, jar.get(SESSION_COOKIE)?.value);
    return createSession(tx, userId);
  });
  jar.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getConfig().production,
    path: "/",
    expires: session.expires,
  });
}
export async function getUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!validSessionToken(token)) return null;
  return sessionUser(await getDb(), token, getConfig().demo);
}
function validSessionToken(token: string | undefined): token is string {
  return !!token && /^[a-zA-Z0-9_-]{43}$/.test(token);
}
export async function sessionUser(
  db: Sql,
  token: string,
  demoAllowed: boolean,
): Promise<User | null> {
  if (!validSessionToken(token)) return null;
  const rows = await db.query<User>(
    "SELECT u.id,u.email,u.role,u.is_demo,u.is_guest FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [digestToken(token)],
  );
  const user = rows[0] ?? null;
  if (user?.is_demo && !demoAllowed) return null;
  return user;
}
export async function revokeSession(db: Sql, token: string | undefined) {
  if (validSessionToken(token))
    await db.query("DELETE FROM sessions WHERE token_hash=$1", [digestToken(token)]);
}
export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (validSessionToken(token)) await revokeSession(await getDb(), token);
  jar.set(SESSION_COOKIE, "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: getConfig().production,
    maxAge: 0,
  });
}
export async function requireUser(admin = false) {
  const user = await getUser();
  if (!user) throw new AppError(401, "브라우저 연결을 다시 준비해 주세요.", "UNAUTHENTICATED");
  if (admin && user.role !== "ADMIN")
    throw new AppError(403, "운영자 권한이 필요합니다.", "FORBIDDEN");
  return user;
}
export async function createVisitorSession(db: Database) {
  return db.transaction(async (tx) => {
    const id = randomUUID();
    await tx.query(
      "INSERT INTO users(id,email,role,is_demo,is_guest) VALUES($1,$2,'OWNER',false,true)",
      [id, `visitor-${id}@local.invalid`],
    );
    return { userId: id, ...(await createSession(tx, id, 30)) };
  });
}
export async function startVisitorSession() {
  if (await getUser()) return;
  const session = await createVisitorSession(await getDb());
  (await cookies()).set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getConfig().production,
    path: "/",
    expires: session.expires,
  });
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

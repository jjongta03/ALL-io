import { z } from "zod";
import type { Database } from "./db";
import { hashPassword, verifyPassword, type User } from "./auth";
import { hash } from "./hashing";
import { AppError } from "./errors";

export const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .pipe(z.email().max(254))
      .transform((s) => s.toLowerCase()),
    password: z.string().min(1).max(256),
  })
  .strict();
const dummyHash = hashPassword("unknown-account-comparison-only");

export async function authenticateAccount(
  db: Database,
  input: z.infer<typeof loginSchema>,
): Promise<User> {
  const { email, password } = loginSchema.parse(input);
  // The shared database enforces the same limit after restarts and across app instances.
  // Store only a digest of the normalized address in the rate-limit table.
  const attempts = (
    await db.query<{ attempts: number }>(
      `INSERT INTO login_attempts(bucket) VALUES($1)
    ON CONFLICT(bucket) DO UPDATE SET
      attempts=CASE WHEN login_attempts.started_at<now()-interval '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END,
      started_at=CASE WHEN login_attempts.started_at<now()-interval '15 minutes' THEN now() ELSE login_attempts.started_at END
    RETURNING attempts`,
      [hash(email)],
    )
  )[0].attempts;
  if (attempts > 8)
    throw new AppError(
      429,
      "로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.",
      "LOGIN_RATE_LIMITED",
    );
  const user = (
    await db.query<User & { password_hash: string | null }>(
      "SELECT id,email,role,is_demo,password_hash FROM users WHERE email=$1 AND is_demo=false",
      [email],
    )
  )[0];
  const correct = verifyPassword(password, user?.password_hash || dummyHash);
  if (!correct || !user || !user.password_hash)
    throw new AppError(401, "이메일 또는 비밀번호를 확인해 주세요.", "INVALID_CREDENTIALS");
  return { id: user.id, email: user.email, role: user.role, is_demo: user.is_demo };
}

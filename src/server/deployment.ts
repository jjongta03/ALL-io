import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "./db";
import { hashPassword } from "./auth";

/** First deployment only: never reset credentials or grant privileges to an existing account. */
export async function bootstrapOwner(db: Database, input: { email: string; password: string }) {
  const email = z
    .string()
    .trim()
    .pipe(z.email().max(254))
    .transform((s) => s.toLowerCase())
    .parse(input.email);
  const password = z.string().min(20).max(256).parse(input.password);
  return db.transaction(async (tx) => {
    await tx.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
    const existing = await tx.query<{ id: string }>(
      "SELECT id FROM users WHERE is_demo=false ORDER BY created_at",
    );
    if (existing.length) return { created: false };
    const id = randomUUID();
    await tx.query(
      "INSERT INTO users(id,email,password_hash,role,is_demo) VALUES($1,$2,$3,'ADMIN',false)",
      [id, email, hashPassword(password)],
    );
    await tx.query(
      "INSERT INTO audit_events(id,actor_id,action,entity_id,metadata) VALUES($1,$2,'account.bootstrap',$2,'{}')",
      [randomUUID(), id],
    );
    return { created: true };
  });
}

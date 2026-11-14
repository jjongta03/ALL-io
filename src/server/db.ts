import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { getConfig } from "./config";

export interface Sql {
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
}
export interface Database extends Sql {
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}
type Globals = typeof globalThis & { mawdDatabase?: Promise<Database> };
async function connect(): Promise<Database> {
  const config = getConfig();
  if (config.databaseUrl) {
    const pool = new Pool({
      connectionString: config.databaseUrl,
      max: 5,
      connectionTimeoutMillis: 10000,
    });
    return {
      query: async <T>(sql: string, values: unknown[] = []) =>
        (await pool.query(sql, values)).rows as T[],
      exec: async (sql) => {
        await pool.query(sql);
      },
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await fn({
            query: async <T>(sql: string, values: unknown[] = []) =>
              (await client.query(sql, values)).rows as T[],
            exec: async (sql) => {
              await client.query(sql);
            },
          });
          await client.query("COMMIT");
          return result;
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  await mkdir(config.localDatabasePath, { recursive: true });
  const pg = new PGlite(config.localDatabasePath);
  await pg.waitReady;
  return databaseFromPGlite(pg);
}
export function databaseFromPGlite(pg: PGlite): Database {
  return {
    query: async <T>(sql: string, values: unknown[] = []) =>
      (await pg.query(sql, values)).rows as T[],
    exec: async (sql) => {
      await pg.exec(sql);
    },
    transaction: async (fn) =>
      pg.transaction(async (tx) =>
        fn({
          query: async <T>(sql: string, values: unknown[] = []) =>
            (await tx.query(sql, values)).rows as T[],
          exec: async (sql) => {
            await tx.exec(sql);
          },
        }),
      ),
    close: () => pg.close(),
  };
}
export async function getDb(): Promise<Database> {
  const g = globalThis as Globals;
  return (g.mawdDatabase ??= connect());
}
export async function closeDb() {
  const g = globalThis as Globals;
  if (g.mawdDatabase) {
    await (await g.mawdDatabase).close();
    delete g.mawdDatabase;
  }
}
export async function migrate(db: Database) {
  await db.transaction(async (tx) => {
    // Hold one PostgreSQL transaction/connection across the whole startup migration.
    // PGlite already requires a single process and has no distributed lock requirement.
    if (getConfig().databaseUrl) await tx.query("SELECT pg_advisory_xact_lock(57452001)");
    await tx.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text, applied_at timestamptz NOT NULL DEFAULT now()); ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text",
    );
    const names = (await readdir(resolve("db/migrations")))
      .filter((n) => /^\d{4}_[a-z0-9_-]+\.sql$/.test(n))
      .sort();
    for (const name of names) {
      const sql = await readFile(resolve("db/migrations", name), "utf8"),
        checksum = createHash("sha256").update(sql).digest("hex");
      const applied = (
        await tx.query<{ checksum: string | null }>(
          "SELECT checksum FROM schema_migrations WHERE name=$1",
          [name],
        )
      )[0];
      if (applied) {
        if (applied.checksum && applied.checksum !== checksum)
          throw new Error(
            `이미 적용한 마이그레이션이 변경되었습니다: ${name}. 기존 파일을 되돌리고 새 마이그레이션을 추가하세요.`,
          );
        if (!applied.checksum)
          await tx.query("UPDATE schema_migrations SET checksum=$1 WHERE name=$2", [
            checksum,
            name,
          ]);
        continue;
      }
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)", [
        name,
        checksum,
      ]);
    }
  });
}

import { access, copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import { getDb, migrate, closeDb } from "../src/server/db";
import { seed } from "../src/server/seed";
import { getConfig } from "../src/server/config";

async function main() {
  try {
    await access(".env.local");
    console.log("기존 .env.local 설정을 유지합니다.");
  } catch {
    await copyFile(".env.example", ".env.local");
    console.log("로컬 설정 .env.local을 생성했습니다. 실제 API 키는 비워두었습니다.");
  }
  config({ path: ".env.local", quiet: true });
  config({ path: ".env", quiet: true });
  await mkdir("data", { recursive: true });
  const db = await getDb();
  await migrate(db);
  if (getConfig().demo) await seed(db);
  console.log("DB 마이그레이션 완료. 데모 모드라면 가상 규칙 5개와 검수 예시가 준비됩니다.");
  console.log(
    `DB: ${getConfig().databaseUrl ? "외부 PostgreSQL" : resolve(getConfig().localDatabasePath)}`,
  );
  console.log("실행: npm run dev → http://127.0.0.1:3000 → 로컬 데모 시작");
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "설정 실패");
    process.exitCode = 1;
  })
  .finally(closeDb);

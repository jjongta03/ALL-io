import "./env";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { getDb, closeDb } from "../src/server/db";
import { hashPassword } from "../src/server/auth";
async function main() {
  const email = z.email().parse(process.argv[2]).toLowerCase();
  const role = z.enum(["OWNER", "ADMIN"]).parse(process.argv[3] ?? "OWNER");
  const db = await getDb();
  if ((await db.query("SELECT id FROM users WHERE email=$1", [email])).length)
    throw new Error("이미 등록된 계정입니다. 기존 비밀번호를 덮어쓰지 않았습니다.");
  const password = randomBytes(24).toString("base64url"),
    id = randomUUID();
  await db.query(
    "INSERT INTO users(id,email,password_hash,role,is_demo) VALUES($1,$2,$3,$4,false)",
    [id, email, hashPassword(password), role],
  );
  await mkdir("data", { recursive: true });
  const filename = `data/account-${id}.txt`;
  await writeFile(
    filename,
    `Email: ${email}\nPassword: ${password}\nRole: ${role}\n\n개발용 초기 발급 정보입니다. Git에 추가하거나 공유하지 마세요.\n`,
    { encoding: "utf8", flag: "wx" },
  );
  console.log(`계정을 생성했습니다. 초기 비밀번호는 ${filename}에서만 확인할 수 있습니다.`);
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "계정 생성 실패");
    process.exitCode = 1;
  })
  .finally(closeDb);

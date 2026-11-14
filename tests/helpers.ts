import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { databaseFromPGlite, migrate } from "../src/server/db";
import { seed } from "../src/server/seed";
import type { BusinessInput, HireInput } from "../src/domain/contracts";

export const business: BusinessInput = {
  nickname: "테스트 카페",
  industry: "CAFE",
  region: "경기 안산",
  businessType: "SOLE",
  currentHeadcount: 4,
  existingBenefit: "UNKNOWN",
};
export const hire: HireInput = {
  startDate: "2027-03-20",
  employmentType: "REGULAR",
  monthlyAveragePay: 2450000,
  insuranceHeadcount: 5,
  historyRequirementMet: true,
  exclusionClear: true,
  durationRemaining: true,
  hoursRequirementMet: true,
  coverageConfirmed: true,
  laborCountConfirmed: null,
};
export async function testDatabase() {
  process.env.APP_ENV = "local";
  process.env.APP_MODE = "demo";
  process.env.EMAIL_TRANSPORT = "local";
  const pg = new PGlite();
  await pg.waitReady;
  const db = databaseFromPGlite(pg);
  await migrate(db);
  await seed(db);
  const owner = randomUUID(),
    other = randomUUID();
  await db.query(
    "INSERT INTO users(id,email,role,is_demo) VALUES($1,'test@local.invalid','ADMIN',true),($2,'other@local.invalid','OWNER',true)",
    [owner, other],
  );
  return { db, owner, other };
}

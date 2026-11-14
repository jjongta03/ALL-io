import { expect, test } from "vitest";
import { ownerRequiredError } from "../src/domain/onboarding";

const owner = {
  name: "합성 사장님",
  birthDate: "1990-01-01",
  phone: "01012345678",
  email: "owner@example.com",
  emailAlerts: false,
};
test.each(["name", "birthDate", "phone", "email"] as const)(
  "%s 누락 시 다음 단계 차단",
  (field) => {
    expect(ownerRequiredError({ ...owner, [field]: null })).toContain("필수 항목을 입력해 주세요");
  },
);
test.each([
  { name: "   " },
  { email: "   " },
  { email: "not-an-email" },
  { phone: "01012" },
  { birthDate: "2999-01-01" },
  { birthDate: "1990-02-30" },
])("공백 또는 잘못된 형식 차단: %j", (invalid) => {
  expect(ownerRequiredError({ ...owner, ...invalid })).not.toBe("");
});
test("필수 정보가 유효하면 수신 동의 없이도 진행 가능", () => {
  expect(ownerRequiredError(owner)).toBe("");
});

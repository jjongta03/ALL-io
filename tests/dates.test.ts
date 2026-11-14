import { expect, test } from "vitest";
import { addDays, seoulDate, seoulMorning, reminderSchedule } from "../src/domain/dates";
test("한국 날짜 경계와 오전 9시를 UTC로 변환한다", () => {
  expect(seoulDate(new Date("2026-11-13T15:01:00Z"))).toBe("2026-11-14");
  expect(seoulMorning("2026-11-14").toISOString()).toBe("2026-11-14T00:00:00.000Z");
});
test("월·연도 경계를 날짜형으로 계산한다", () => {
  expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
});
test("이미 지난 D-7 알림을 소급 생성하지 않는다", () => {
  const r = reminderSchedule("2026-11-20", new Date("2026-11-14T00:00:00Z"));
  expect(r.map((x) => x.type)).toEqual(["D-3"]);
});

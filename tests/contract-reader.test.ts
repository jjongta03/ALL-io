import { afterEach, expect, test, vi } from "vitest";
import {
  extractContract,
  MAX_CONTRACT_BYTES,
  readContractUpload,
} from "../src/integrations/contract-reader";
const draft = {
  name: "합성직원",
  employmentType: "PART_TIME",
  weeklyHours: null,
  hourlyWage: null,
  startedOn: null,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
test("Liner 인식은 구조를 검증하고 항상 사용자 확인을 요구한다", async () => {
  vi.stubEnv("APP_ENV", "local");
  vi.stubEnv("APP_MODE", "demo");
  vi.stubEnv("LIVE_INTEGRATIONS_ENABLED", "true");
  vi.stubEnv("CONTRACT_SCAN_ENABLED", "true");
  vi.stubEnv("LINER_API_KEY", "synthetic-key");
  vi.stubEnv("LINER_CONTRACT_MODEL", "synthetic-vision-model");
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(draft) } }],
      }),
      { status: 200 },
    ),
  );
  const result = await extractContract(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png");
  expect(result.status).toBe("NEEDS_REVIEW");
  expect(result.draft.weeklyHours).toBeNull();
  const body = JSON.parse(fetch.mock.calls[0][1]?.body as string);
  expect(body.messages[0].content).toContain("추정");
  expect(body.messages[1].content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
});
test("잘못된 모델 출력과 중단된 응답은 직원 정보로 저장하지 않는다", async () => {
  vi.stubEnv("LIVE_INTEGRATIONS_ENABLED", "true");
  vi.stubEnv("CONTRACT_SCAN_ENABLED", "true");
  vi.stubEnv("LINER_API_KEY", "synthetic-key");
  vi.stubEnv("LINER_CONTRACT_MODEL", "synthetic-vision-model");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [
          { finish_reason: "stop", message: { content: '{"name":"합성", "weeklyHours":999}' } },
        ],
      }),
    ),
  );
  await expect(extractContract(Buffer.from("data"), "image/png")).rejects.toMatchObject({
    code: "SCAN_INVALID",
  });
});
test("큰 업로드는 Content-Length를 신뢰하지 않고 읽는 도중 중단한다", async () => {
  const req = new Request("http://local.invalid/", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=test" },
    body: Buffer.alloc(MAX_CONTRACT_BYTES + 65537),
  });
  await expect(readContractUpload(req)).rejects.toMatchObject({ status: 413 });
});

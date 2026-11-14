import { afterEach, expect, test, vi } from "vitest";
import { isAllowedSource, searchOfficialSources, sendStibee } from "../src/integrations/providers";
import { validateDraftEvidence, LinerRuleDraftGenerator } from "../src/integrations/drafting";
import { demoDefinitions } from "../src/server/seed";
import { getConfig } from "../src/server/config";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
test("공식 수집 URL은 정확한 허용 호스트만 받는다", () => {
  expect(isAllowedSource("https://insurancesupport.or.kr/durunuri/intro.php")).toBe(true);
  for (const url of [
    "http://insurancesupport.or.kr/",
    "https://insurancesupport.or.kr.attacker.invalid/",
    "https://127.0.0.1/",
    "https://law.go.kr:8443/",
    "https://user@law.go.kr/",
  ])
    expect(isAllowedSource(url)).toBe(false);
});
test("키가 없거나 연동이 꺼진 경우 외부 호출하지 않는다", async () => {
  vi.stubEnv("LIVE_INTEGRATIONS_ENABLED", "false");
  const spy = vi.fn();
  vi.stubGlobal("fetch", spy);
  await expect(searchOfficialSources("공식 기준")).rejects.toMatchObject({ status: 503 });
  expect(spy).not.toHaveBeenCalled();
});
test("스티비 200은 제공자 접수이며 수신 완료가 아니다", async () => {
  vi.stubEnv("LIVE_INTEGRATIONS_ENABLED", "true");
  vi.stubEnv("STIBEE_API_KEY", "test-key");
  vi.stubEnv("STIBEE_AUTO_EMAIL_URL", "https://stibee.com/api/v1.0/auto/test");
  const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await sendStibee("test@example.invalid", "<script>", "https://app.example.invalid/")).toBe(
    "ACCEPTED_BY_PROVIDER",
  );
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).task_title).toBe("&lt;script&gt;");
});
test("외부 전송 타임아웃은 자동 재발송 대상이 아니다", async () => {
  vi.stubEnv("LIVE_INTEGRATIONS_ENABLED", "true");
  vi.stubEnv("STIBEE_API_KEY", "test-key");
  vi.stubEnv("STIBEE_AUTO_EMAIL_URL", "https://stibee.com/api/v1.0/auto/test");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
  expect(await sendStibee("test@example.invalid", "test", "https://app.example.invalid/")).toBe(
    "UNKNOWN",
  );
});
test("AI가 근거 검수 완료라고 해도 미검수로 되돌린다", () => {
  const definition = structuredClone(demoDefinitions()[0].definition);
  const quote = "공식 원문에 포함된 조건 설명을 그대로 확인합니다.";
  definition.sources = [
    {
      title: "모델 제목",
      url: "https://insurancesupport.or.kr/durunuri/intro.php",
      verified: true,
      section: quote,
    },
  ];
  const d = {
    title: "초안",
    kind: "BENEFIT",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    definition,
  };
  const source = {
    snapshotId: "test",
    title: "수집 원문",
    url: definition.sources[0].url,
    text: `앞부분 ${quote} 뒷부분`,
  };
  expect(validateDraftEvidence(d, source).definition.sources[0].verified).toBe(false);
  expect(() => validateDraftEvidence(d, { ...source, text: "일치하는 내용이 없음" })).toThrow(
    "근거 구간",
  );
});
test("AI 초안 생성은 명시적 활성화 전 실행하지 않는다", async () => {
  vi.stubEnv("DRAFT_GENERATION_ENABLED", "false");
  await expect(
    new LinerRuleDraftGenerator().suggest({
      snapshotId: "a",
      title: "a",
      url: "https://law.go.kr/",
      text: "text",
    }),
  ).rejects.toMatchObject({ status: 503 });
});
test("운영 설정은 데모·로컬 DB·HTTP 주소를 거절한다", () => {
  vi.stubEnv("APP_ENV", "production");
  vi.stubEnv("APP_MODE", "demo");
  vi.stubEnv("MAWD_DATABASE_URL", "");
  expect(() => getConfig()).toThrow("운영 환경");
});
test("다른 프로젝트 DATABASE_URL은 사용하지 않는다", () => {
  vi.stubEnv("APP_ENV", "local");
  vi.stubEnv("MAWD_DATABASE_URL", "");
  vi.stubEnv("DATABASE_URL", "postgres://unrelated.invalid/db");
  expect(getConfig().databaseUrl).toBeNull();
});

import { afterEach, expect, test, vi } from "vitest";
import { routeReview, type Decision } from "../src/domain/review-routing";
import { demoDefinitions } from "../src/server/seed";
import { assessWithJev } from "../src/integrations/decisions";
const definition = demoDefinitions()[0].definition;
const wording = { ...definition, explanation: "수정된 설명" };
const decision: Decision = {
  kind: "WORDING",
  confidence: 0.95,
  sourceAgreement: 0.95,
  urgency: 0,
  abstain: false,
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
test("높은 신뢰도 표현 변경도 사람 승인만 허용한다", () => {
  expect(routeReview(definition, wording, decision, true)).toMatchObject({
    lane: "LOW_RISK",
    priority: 3,
    requiresHumanApproval: true,
  });
});
test.each([{ confidence: 0.49 }, { sourceAgreement: 0.49 }, { abstain: true }])(
  "불확실·출처 충돌·보류는 직접 검수로 보낸다: %j",
  (patch) => {
    expect(routeReview(definition, wording, { ...decision, ...patch }, true).lane).toBe(
      "HUMAN_REVIEW",
    );
  },
);
test("AI가 표현 변경이라 해도 조건·기한 변경은 직접 검수한다", () => {
  const next = structuredClone(wording);
  next.conditions = { field: "monthlyAveragePay", op: "lt", value: 3000000 };
  expect(routeReview(definition, next, decision, true).lane).toBe("HUMAN_REVIEW");
  expect(routeReview(null, next, decision, true)).toMatchObject({ lane: "URGENT", priority: 1 });
});
test("원문 없는 고신뢰 분류와 API 비활성은 낮은 위험으로 간주하지 않는다", () => {
  expect(routeReview(definition, wording, decision, false).lane).toBe("HUMAN_REVIEW");
  expect(routeReview(definition, wording, null, true).method).toBe("LOCAL_RULES");
});
function enable() {
  vi.stubEnv("LIVE_INTEGRATIONS_ENABLED", "true");
  vi.stubEnv("JEV_ENABLED", "true");
  vi.stubEnv("LINER_API_KEY", "test-key");
}
test("Jev 공식 typed answers를 검증해 읽고 choice/noul/score 질문을 보낸다", async () => {
  enable();
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      answers: {
        change: { type: "choice", choice: "WORDING", confidence: 0.95 },
        agreement: { type: "noul", noul: 0.91 },
        urgency: { type: "score", score: 0.3, confidence: 0.8 },
      },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  expect(await assessWithJev({ previous: definition, next: wording, evidence: [] })).toMatchObject({
    kind: "WORDING",
    confidence: 0.8,
    sourceAgreement: 0.91,
  });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).questions.agreement.type).toBe("noul");
});
test.each([
  [402, "UPSTREAM_CREDIT"],
  [429, "UPSTREAM_RATE_LIMIT"],
  [503, "UPSTREAM_ERROR"],
])("Jev HTTP %i는 자동 재시도하지 않고 오류로 구별한다", async (status, code) => {
  enable();
  const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: Number(status) }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    assessWithJev({ previous: definition, next: wording, evidence: [] }),
  ).rejects.toMatchObject({ code });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
test("잘못된 확률·응답은 유효한 판단으로 쓰지 않는다", async () => {
  enable();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ answers: { change: { confidence: 2 } } })),
  );
  await expect(
    assessWithJev({ previous: definition, next: wording, evidence: [] }),
  ).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
});
test("비활성 Jev는 외부에 요청하지 않는다", async () => {
  vi.stubEnv("JEV_ENABLED", "false");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    assessWithJev({ previous: definition, next: wording, evidence: [] }),
  ).rejects.toMatchObject({ status: 503 });
  expect(fetchMock).not.toHaveBeenCalled();
});

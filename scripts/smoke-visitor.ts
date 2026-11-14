import "./env";
import assert from "node:assert/strict";
import { getConfig } from "../src/server/config";
async function main() {
  const config = getConfig();
  if (
    config.production ||
    !config.demo ||
    config.liveIntegrations ||
    config.emailTransport !== "local"
  )
    throw new Error("Local checks only");
  const origin = new URL(config.appUrl).origin;
  async function request(
    path: string,
    {
      method = "GET",
      body,
      cookie,
      status = 200,
      allowedOrigin = origin,
    }: {
      method?: string;
      body?: unknown;
      cookie?: string;
      status?: number;
      allowedOrigin?: string | null;
    } = {},
  ) {
    const r = await fetch(origin + path, {
      method,
      redirect: "manual",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(allowedOrigin === null ? {} : { Origin: allowedOrigin }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(r.status, status, `${method} ${path} unexpected status`);
    return r;
  }
  const home = await request("/");
  const html = await home.text();
  assert.match(html, /내 사업장 화면을 준비/);
  assert.doesNotMatch(html, /계정으로 로그인/);
  await request("/api/visitor", { method: "POST", allowedOrigin: null, status: 403 });
  await request("/api/visitor", {
    method: "POST",
    allowedOrigin: "https://example.invalid",
    status: 403,
  });
  await request("/api/visitor", { method: "POST", body: { role: "ADMIN" }, status: 422 });
  await request("/api/v2/businesses", { status: 401 });
  const a = await request("/api/visitor", { method: "POST" }),
    cookie = a.headers.get("set-cookie")!.split(";")[0];
  assert.match(a.headers.get("set-cookie")!, /HttpOnly/i);
  assert.match(a.headers.get("set-cookie")!, /SameSite=lax/i);
  const first = (await (await request("/api/me", { cookie })).json()).user;
  assert.equal(first.role, "OWNER");
  assert.equal(first.is_guest, true);
  assert.equal(first.is_demo, false);
  const reuse = await request("/api/visitor", { method: "POST", cookie });
  assert.equal(reuse.headers.get("set-cookie"), null);
  assert.equal((await (await request("/api/me", { cookie })).json()).user.id, first.id);
  const b = await request("/api/visitor", { method: "POST" }),
    other = b.headers.get("set-cookie")!.split(";")[0];
  assert.notEqual((await (await request("/api/me", { cookie: other })).json()).user.id, first.id);
  const redirect = await request("/dashboard", { cookie, status: 307 });
  assert.equal(redirect.headers.get("location"), "/onboarding/1");
  const form = await (await request("/onboarding/1", { cookie })).text();
  assert.match(form, /사장님 정보를 입력해 주세요/);
  assert.doesNotMatch(form, /visitor-[a-f0-9-]+@local.invalid/);
  const bid = (
    await (
      await request("/api/v2/businesses", {
        method: "POST",
        cookie,
        body: {
          nickname: "합성 방문자",
          industry: "CAFE",
          region: "서울",
          businessType: "SOLE",
          startedOn: null,
          revenueBand: null,
          pastBusinesses: [],
          rosterConfirmed: true,
        },
      })
    ).json()
  ).id;
  await request(`/api/v2/businesses/${bid}`, { cookie: other, status: 404 });
  await request("/api/admin/reviews", { cookie, status: 403 });
  await request("/api/v2/admin/watches", { cookie, status: 403 });
  await request("/api/session", {
    method: "POST",
    body: { email: "synthetic@local.invalid", password: "unused" },
    status: 404,
  });
  const old = await request("/login", { status: 307 });
  assert.equal(old.headers.get("location"), "/start?next=%2Fdashboard");
  const start = await request("/start?next=/mypage", { cookie, status: 307 });
  assert.equal(start.headers.get("location"), "/mypage");
  await request("/api/session", { method: "DELETE", cookie });
  await request("/api/me", { cookie, status: 401 });
  console.log(
    "방문자 HTTP 스모크 통과: 로그인 화면 제거·자동 접속·세션 재사용·브라우저별 격리·Origin·OWNER 권한·관리자 차단·최초 입력·이전 링크 이동",
  );
}
main().catch(() => {
  console.error(
    "방문자 HTTP 검증 실패: 로컬 설정과 서버 상태를 확인하세요. 세션 토큰은 출력하지 않았습니다.",
  );
  process.exitCode = 1;
});

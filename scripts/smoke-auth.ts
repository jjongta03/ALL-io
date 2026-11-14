import "./env";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import { getConfig } from "../src/server/config";
import { getDb, closeDb } from "../src/server/db";
import { hashPassword, createSession, digestToken } from "../src/server/auth";

type Fixture = {
  origin: string;
  databasePath: string;
  accounts: { id: string; email: string; password: string }[];
  expiredToken: string;
};
const filename = "data/auth-smoke-fixture.json";
async function main() {
  const config = getConfig();
  if (
    config.production ||
    !config.demo ||
    config.databaseUrl ||
    config.liveIntegrations ||
    config.emailTransport !== "local"
  )
    throw new Error("외부 연동이 꺼진 로컬 PGlite 데모에서만 검증합니다.");
  const origin = new URL(config.appUrl).origin;
  if (process.argv[2] === "prepare") {
    // Run with the app stopped: PGlite must have only one process accessing its data.
    const db = await getDb();
    try {
      const accounts = [];
      for (let i = 0; i < 2; i++) {
        const id = randomUUID(),
          email = `auth-smoke-${id}@local.invalid`,
          password = randomBytes(24).toString("base64url");
        await db.query(
          "INSERT INTO users(id,email,password_hash,role,is_demo) VALUES($1,$2,$3,'OWNER',false)",
          [id, email, hashPassword(password)],
        );
        accounts.push({ id, email, password });
      }
      const expired = await createSession(db, accounts[0].id);
      await db.query(
        "UPDATE sessions SET expires_at=now()-interval '1 minute' WHERE token_hash=$1",
        [digestToken(expired.token)],
      );
      await mkdir("data", { recursive: true });
      await writeFile(
        filename,
        JSON.stringify({
          origin,
          databasePath: config.localDatabasePath,
          accounts,
          expiredToken: expired.token,
        }),
        { mode: 0o600 },
      );
      console.log(
        "합성 로그인 검증 계정을 ignored data/에 준비했습니다. 서버를 시작한 뒤 npm run smoke:auth를 실행하세요.",
      );
    } finally {
      await closeDb();
    }
    return;
  }
  const fixture = JSON.parse(await readFile(filename, "utf8")) as Fixture;
  assert.equal(fixture.origin, origin);
  assert.equal(fixture.databasePath, config.localDatabasePath);
  const [a, b] = fixture.accounts;
  async function request(
    path: string,
    {
      method = "GET",
      body,
      cookie,
      allowedOrigin = origin,
      status = 200,
      api = true,
    }: {
      method?: string;
      body?: unknown;
      cookie?: string;
      allowedOrigin?: string | null;
      status?: number;
      api?: boolean;
    } = {},
  ) {
    const response = await fetch(`${origin}${api ? "/api/" : ""}${path}`, {
      method,
      redirect: "manual",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(allowedOrigin === null ? {} : { Origin: allowedOrigin }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(
      response.status,
      status,
      `${method} ${api ? "/api/" : ""}${path}: unexpected status`,
    );
    return response;
  }
  const page = await request("/login", { api: false });
  assert.match(await page.text(), /계정으로 로그인/);
  const protectedPage = await request("/plans/new", { api: false, status: 307 });
  assert.equal(protectedPage.headers.get("location"), "/login?next=%2Fplans%2Fnew");
  await request("session", { method: "POST", body: a, allowedOrigin: null, status: 403 });
  await request("session", {
    method: "POST",
    body: a,
    allowedOrigin: "https://example.invalid",
    status: 403,
  });
  await request("session", { method: "POST", body: { email: a.email, password: "" }, status: 422 });
  const wrong = await request("session", {
    method: "POST",
    body: { email: a.email, password: "synthetic-wrong-password" },
    status: 401,
  });
  assert.equal(wrong.headers.get("set-cookie"), null);
  const absent = await request("session", {
    method: "POST",
    body: { email: `missing-${randomUUID()}@local.invalid`, password: "synthetic-wrong-password" },
    status: 401,
  });
  assert.deepEqual(await wrong.json(), await absent.json());
  await request("me", { cookie: `mawd_session=${fixture.expiredToken}`, status: 401 });
  await request("session", { method: "DELETE", cookie: `mawd_session=${fixture.expiredToken}` });
  const login = await request("session", {
    method: "POST",
    body: { email: `  ${a.email.toUpperCase()}  `, password: a.password },
  });
  const header = login.headers.get("set-cookie")!;
  assert.match(header, /HttpOnly/i);
  assert.match(header, /SameSite=lax/i);
  assert.match(header, /Path=\//i);
  const cookie = header.split(";")[0],
    me = await (await request("me", { cookie })).json();
  assert.equal(me.user.id, a.id);
  assert.equal(me.user.role, "OWNER");
  assert.equal(Object.hasOwn(me.user, "password_hash"), false);
  await request("admin/reviews", { cookie, status: 403 });
  await request("v2/admin/watches", { cookie, status: 403 });
  const signedInPage = await request("/login?next=/outbox", { api: false, cookie, status: 307 });
  assert.equal(signedInPage.headers.get("location"), "/outbox");
  await request("/dashboard", { api: false, cookie });
  await request("/plans/new", { api: false, cookie });
  await request("register", {
    method: "POST",
    cookie,
    body: { email: a.email, password: a.password },
    status: 404,
  });
  const bid = (
    await (
      await request("v2/businesses", {
        method: "POST",
        cookie,
        body: {
          nickname: "로그인 합성 사업장",
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
  const again = await request("session", {
      method: "POST",
      cookie,
      body: { email: a.email, password: a.password },
    }),
    newCookie = again.headers.get("set-cookie")!.split(";")[0];
  assert.notEqual(newCookie, cookie);
  await request("me", { cookie, status: 401 });
  const second = await request("session", {
      method: "POST",
      cookie: newCookie,
      body: { email: b.email, password: b.password },
    }),
    otherCookie = second.headers.get("set-cookie")!.split(";")[0];
  await request("me", { cookie: newCookie, status: 401 });
  await request(`v2/businesses/${bid}`, { cookie: otherCookie, status: 404 });
  const logout = await request("session", { method: "DELETE", cookie: otherCookie });
  assert.match(logout.headers.get("set-cookie")!, /Max-Age=0/i);
  await request("me", { cookie: otherCookie, status: 401 });
  await request("session", { method: "DELETE" });
  for (let i = 0; i < 7; i++)
    await request("session", {
      method: "POST",
      body: { email: b.email, password: "synthetic-wrong-password" },
      status: 401,
    });
  await request("session", {
    method: "POST",
    body: { email: b.email, password: b.password },
    status: 429,
  });
  const safeRedirect = await request("/login?next=https://example.invalid", { api: false });
  assert.match(await safeRedirect.text(), /계정으로 로그인/);
  console.log(
    "로그인 HTTP 스모크 통과: 발급 계정·이메일 정규화·오류·Origin·반복 제한·쿠키·세션 교체/만료/로그아웃·복귀 경로·소유권·운영자 권한·회원가입 차단",
  );
}
main().catch(() => {
  console.error(
    "로그인 HTTP 검증 실패: 외부 연동 설정, 새 합성 fixture, 서버 상태를 확인하세요. 자격 증명은 출력하지 않았습니다.",
  );
  process.exitCode = 1;
});

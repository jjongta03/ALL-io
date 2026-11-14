import "./env";
import assert from "node:assert/strict";
import { getConfig } from "../src/server/config";
import { addDays, seoulDate } from "../src/domain/dates";

async function main() {
  const config = getConfig();
  if (
    !config.demo ||
    config.production ||
    config.liveIntegrations ||
    process.env.CONTRACT_SCAN_ENABLED === "true" ||
    config.emailTransport !== "local"
  )
    throw new Error("외부 연동이 꺼진 로컬 데모에서만 검증합니다.");
  const origin = new URL(config.appUrl).origin;
  async function request(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      cookie?: string;
      origin?: string | null;
      status?: number;
      form?: FormData;
    } = {},
  ) {
    const response = await fetch(`${origin}/api/${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.origin === null ? {} : { Origin: options.origin ?? origin }),
        ...(options.cookie ? { Cookie: options.cookie } : {}),
      },
      body: options.form ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
    });
    const body = await response.json();
    assert.equal(
      response.status,
      options.status ?? 200,
      `${options.method ?? "GET"} ${path}: ${JSON.stringify(body)}`,
    );
    return { body, response };
  }
  await request("v2/businesses", { status: 401 });
  await request("demo", { method: "POST", origin: null, status: 403 });
  const login = await request("demo", { method: "POST" }),
    cookie = login.response.headers.get("set-cookie")!.split(";")[0];
  const second = await request("demo", { method: "POST" }),
    other = second.response.headers.get("set-cookie")!.split(";")[0];
  const landing = await fetch(`${origin}/`);
  assert.ok((await landing.text()).includes("사장님 정보를 입력해 주세요"));
  async function expectOnboarding(path: string, stage: number) {
    const page = await fetch(`${origin}/${path}`, {
      headers: { Cookie: other },
      redirect: "manual",
    });
    const html = await page.text();
    const target = `/onboarding/${stage}`;
    assert.ok(
      page.headers.get("location") === target ||
        (html.includes("NEXT_REDIRECT") && html.includes(target)),
      `${path} must redirect to ${target}`,
    );
  }
  await expectOnboarding("dashboard", 1);
  await expectOnboarding("benefits", 1);
  await expectOnboarding("onboarding/4", 1);
  const setupOwner = {
    name: "최초 입력 사장님",
    birthDate: "1990-01-01",
    phone: "01012345678",
    email: "onboarding@example.com",
    emailAlerts: false,
  };
  for (const field of ["name", "birthDate", "phone", "email"])
    await request("v2/onboarding", {
      method: "PUT",
      cookie: other,
      body: { stage: 2, completed: false, owner: { ...setupOwner, [field]: null } },
      status: 422,
    });
  await request("v2/onboarding", {
    method: "PUT",
    cookie: other,
    body: { stage: 2, completed: false, owner: setupOwner },
  });
  await expectOnboarding("dashboard", 2);
  await request("v2/onboarding", { method: "PUT", cookie: other, body: { stage: 4 } });
  await expectOnboarding("dashboard", 3);
  const setupFacts = {
    nickname: "최초 입력 확인 사업장",
    industry: "RESTAURANT",
    region: "부산",
    businessType: "SOLE",
    startedOn: null,
    revenueBand: null,
    pastBusinesses: [],
    pastBusinessHistoryConfirmed: true,
    rosterConfirmed: false,
  };
  const setupBusiness = (
    await request("v2/businesses", {
      method: "POST",
      cookie: other,
      body: setupFacts,
    })
  ).body;
  await expectOnboarding("dashboard", 4);
  await request("v2/profile", {
    method: "PUT",
    cookie: other,
    body: setupOwner,
  });
  await expectOnboarding("dashboard", 4);
  await request(`v2/businesses/${setupBusiness.id}`, {
    method: "PUT",
    cookie: other,
    body: { revision: 1, facts: { ...setupFacts, rosterConfirmed: true } },
  });
  await expectOnboarding("dashboard", 4);
  await request("v2/onboarding", {
    method: "PUT",
    cookie: other,
    body: { stage: 4, completed: true, owner: setupOwner },
  });
  const readyDashboard = await fetch(`${origin}/dashboard`, { headers: { Cookie: other } });
  assert.equal(readyDashboard.status, 200);
  const readyHtml = await readyDashboard.text();
  assert.ok(readyHtml.includes("내 사업장") && readyHtml.includes("음식점"));
  assert.ok(!readyHtml.includes("NEXT_REDIRECT"));
  const profile = {
    name: "합성 사장",
    birthDate: "1990-01-01",
    phone: null,
    emailAlerts: true,
  };
  await request("v2/profile", { method: "PUT", cookie, body: profile });
  await request("v2/profile", {
    method: "PUT",
    cookie,
    body: { ...profile, alimtalkAlerts: true },
    status: 422,
  });
  assert.equal(Object.hasOwn((await request("me", { cookie })).body, "channel"), false);
  await request("v2/onboarding", { method: "PUT", cookie, body: { stage: 1, owner: profile } });
  const facts = {
    nickname: "HTTP 합성 사업장",
    industry: "CAFE",
    region: "서울",
    businessType: "SOLE",
    startedOn: null,
    revenueBand: null,
    pastBusinesses: [],
    pastBusinessHistoryConfirmed: true,
    rosterConfirmed: true,
  };
  await request("v2/onboarding", { method: "PUT", cookie, body: { stage: 2, business: facts } });
  assert.equal((await request("v2/profile", { cookie })).body.onboarding.owner.name, profile.name);
  await request("v2/businesses", {
    method: "POST",
    cookie,
    body: { ...facts, currentHeadcount: 10 },
    status: 422,
  });
  const bid = (await request("v2/businesses", { method: "POST", cookie, body: facts })).body.id;
  await request(`v2/businesses/${bid}/dashboard`, { cookie: other, status: 404 });
  const form = new FormData();
  form.set(
    "file",
    new File(["%PDF-1.4 synthetic HTTP test only"], "contract.pdf", { type: "application/pdf" }),
  );
  const scan = (await request(`v2/businesses/${bid}/scans`, { method: "POST", cookie, form })).body;
  assert.equal(scan.status, "MANUAL_REQUIRED");
  assert.equal(scan.draft.name, null);
  const doc = await fetch(`${origin}/api/v2/scans/${scan.id}/document`, {
    headers: { Cookie: cookie },
  });
  assert.equal(doc.status, 200);
  assert.ok((await doc.text()).includes("synthetic HTTP"));
  await request(`v2/scans/${scan.id}`, { cookie: other, status: 404 });
  const details = {
    name: "합성 직원",
    employmentType: "PART_TIME",
    weeklyHours: 20,
    hourlyWage: 12000,
    startedOn: null,
  };
  const eid = (
    await request(`v2/scans/${scan.id}/confirm`, { method: "POST", cookie, body: details })
  ).body.id;
  assert.equal(
    (await request(`v2/scans/${scan.id}/confirm`, { method: "POST", cookie, body: details })).body
      .id,
    eid,
  );
  await request(`v2/employees/${eid}`, {
    method: "PUT",
    cookie,
    body: { revision: 1, details: { ...details, name: "수정 직원" } },
  });
  await request(`v2/employees/${eid}`, {
    method: "PUT",
    cookie,
    body: { revision: 1, details },
    status: 409,
  });
  const roster = (await request(`v2/businesses/${bid}/employees?limit=8`, { cookie })).body;
  assert.equal(roster.total, 1);
  assert.equal(roster.employees[0].details.name, "수정 직원");
  const benefits = (await request(`v2/businesses/${bid}/benefits`, { cookie })).body;
  assert.equal(benefits.needsReevaluation, false);
  const policy = benefits.benefits.find(
    (p: { title: string; isDemo: boolean }) => p.isDemo && p.title.includes("현재 정보"),
  );
  assert.ok(policy, "현재 상태용 가상 데모 규칙이 필요합니다. 서버를 끄고 setup을 실행하세요.");
  await request(`v2/businesses/${bid}/benefits/${policy.policyId}`, { cookie });
  const project = (
    await request(`v2/businesses/${bid}/projects`, {
      method: "POST",
      cookie,
      body: { policyId: policy.policyId },
    })
  ).body;
  assert.equal(
    (
      await request(`v2/businesses/${bid}/projects`, {
        method: "POST",
        cookie,
        body: { policyId: policy.policyId },
      })
    ).body.id,
    project.id,
  );
  const progress = (await request(`v2/projects/${project.id}`, { cookie })).body;
  assert.ok(progress.steps.length > 0);
  assert.ok(progress.steps[0].guide.url);
  await request(`v2/projects/${project.id}`, { cookie: other, status: 404 });
  const pages: [string, string][] = [
    ["dashboard", "내 사업장"],
    ["onboarding/1", "사장님 정보를 입력해 주세요"],
    ["onboarding/2", "현재 사업장을 알려 주세요"],
    ["onboarding/3", "지난 사업기록을 입력해 주세요"],
    ["onboarding/4", "근로계약서로 직원을 등록해 주세요"],
    ["mypage", "마이페이지"],
    ["mypage/owner", "사장님 정보 수정"],
    ["mypage/business", "사업장 정보 수정"],
    ["mypage/history", "지난 사업기록 수정"],
    ["employees", "직원 관리"],
    [`employees/${eid}`, "수정 직원"],
    [`employees/${eid}/edit`, "직원 정보 편집"],
    ["contracts/new", "근로계약서 스캔"],
    [`contracts/${scan.id}`, "직원 정보 확인"],
    ["benefits", "현재 신청 가능한 지원사업"],
    [`benefits/${policy.policyId}`, policy.title],
    ["projects", "내 프로젝트"],
    [`projects/${project.id}`, "프로젝트 체크리스트"],
    ["documents", "신고 및 서류"],
    ["schedule", "신청 및 제출 일정"],
    ["notifications", "이메일 알림 내역"],
    ["conditions", "준비 중"],
    ["reevaluate", "재진단"],
    ["plans", "내 채용 계획"],
  ];
  for (const [path, title] of pages) {
    const page = await fetch(`${origin}/${path}`, { headers: { Cookie: cookie } });
    assert.equal(page.status, 200, `page ${path}`);
    assert.ok((await page.text()).includes(title), `page content ${path}`);
  }
  for (const path of ["benefits/new", "projects/new", "employees/invalid", "unknown-screen"]) {
    const page = await fetch(`${origin}/${path}`, { headers: { Cookie: cookie } });
    assert.equal(page.status, 404, `unknown page ${path}`);
  }
  for (const step of progress.steps)
    await request(`v2/project-steps/${step.id}`, { method: "PATCH", cookie, body: { done: true } });
  assert.equal(
    (await request(`v2/businesses/${bid}/dashboard`, { cookie })).body.projects.length,
    0,
  );
  const completed = (await request(`v2/businesses/${bid}/benefits`, { cookie })).body;
  assert.ok(
    completed.completed.some((p: { project: { id: string } }) => p.project.id === project.id),
  );
  assert.equal(
    completed.benefits.find((p: { policyId: string }) => p.policyId === policy.policyId)
      .workflowStatus,
    "COMPLETED",
  );
  await request(`v2/project-steps/${progress.steps[0].id}`, {
    method: "PATCH",
    cookie,
    body: { done: false, deadline: addDays(seoulDate(), 2) },
  });
  const document = (
    await request(`v2/businesses/${bid}/documents`, {
      method: "POST",
      cookie,
      body: {
        title: "합성 반복 서류",
        anchorDate: addDays(seoulDate(), 2),
        frequency: "MONTHLY",
        leadDays: 3,
        url: null,
        memo: null,
        enabled: true,
      },
    })
  ).body;
  let list = (await request(`v2/businesses/${bid}/documents`, { cookie })).body.documents;
  const occurrence = list.find((d: { id: string }) => d.id === document.id).occurrences[0];
  await request(`v2/occurrences/${occurrence.id}/complete`, {
    method: "POST",
    cookie: other,
    status: 404,
  });
  await request(`v2/occurrences/${occurrence.id}/complete`, { method: "POST", cookie });
  list = (await request(`v2/businesses/${bid}/documents`, { cookie })).body.documents;
  assert.equal(list.find((d: { id: string }) => d.id === document.id).occurrences.length, 2);
  await request("v2/admin/jobs", { method: "POST", cookie, body: { kind: "notifications" } });
  const inbox = (await request(`v2/businesses/${bid}/notifications`, { cookie })).body
    .notifications;
  assert.ok(inbox.every((n: { channel: string }) => n.channel === "EMAIL"));
  assert.ok(inbox.some((n: { status: string }) => n.status === "LOCAL_ONLY"));
  assert.equal((await request("v2/email-contact", { cookie })).body.contact.desired, true);
  assert.equal((await request("v2/email-contact", { cookie: other })).body.contact.desired, false);
  await request("v2/admin/jobs", {
    method: "POST",
    cookie,
    origin: null,
    body: { kind: "contacts" },
    status: 403,
  });
  await request("v2/admin/jobs", { method: "POST", cookie, body: { kind: "contacts" } });
  assert.equal(
    (await request("v2/email-contact", { cookie })).body.contact.sync_status,
    "LOCAL_ONLY",
  );
  await request("v2/admin/jobs", { method: "POST", cookie, body: { kind: "weekly" } });
  await request("v2/admin/jobs", {
    method: "POST",
    cookie,
    body: { kind: "contact-reconcile" },
    status: 503,
  });
  await request("v2/admin/jobs", {
    method: "POST",
    cookie,
    body: { kind: "policy-watch" },
    status: 503,
  });
  const watch = (
    await request("v2/admin/watches", {
      method: "POST",
      cookie,
      body: { query: "HTTP 합성 테스트 공고 검색", enabled: false },
    })
  ).body;
  await request(`v2/admin/watches/${watch.id}`, {
    method: "PATCH",
    cookie,
    body: { enabled: false },
  });
  await request("v2/admin/discoveries", { cookie });
  await request("v2/admin/watch-events", { cookie });
  await request("v2/integrations/alt", { cookie, status: 404 });
  await request("v2/admin/jobs", {
    method: "POST",
    cookie,
    body: { kind: "alt-sync" },
    status: 422,
  });
  await request("v2/profile", {
    method: "PUT",
    cookie,
    body: { ...profile, emailAlerts: false },
  });
  assert.ok(
    !(await request(`v2/businesses/${bid}/notifications`, { cookie })).body.notifications.some(
      (n: { status: string }) => n.status === "PENDING",
    ),
  );
  await request(`v2/employees/${eid}`, {
    method: "DELETE",
    cookie,
    body: { revision: 2, confirm: false },
    status: 422,
  });
  await request(`v2/employees/${eid}`, {
    method: "DELETE",
    cookie: other,
    body: { revision: 2, confirm: true },
    status: 404,
  });
  await request(`v2/employees/${eid}`, {
    method: "DELETE",
    cookie,
    body: { revision: 2, confirm: true },
  });
  await request(`v2/scans/${scan.id}`, { cookie, status: 404 });
  assert.equal(
    (await request(`v2/businesses/${bid}/dashboard`, { cookie })).body.projects[0].eligibility,
    "RECHECK_REQUIRED",
  );
  await request(`v2/projects/${project.id}`, {
    method: "DELETE",
    cookie,
    origin: null,
    body: { confirm: true },
    status: 403,
  });
  await request(`v2/projects/${project.id}`, {
    method: "DELETE",
    cookie,
    body: { confirm: false },
    status: 422,
  });
  await request(`v2/projects/${project.id}`, {
    method: "DELETE",
    cookie: other,
    body: { confirm: true },
    status: 404,
  });
  await request(`v2/projects/${project.id}`, { method: "DELETE", cookie, body: { confirm: true } });
  await request(`v2/projects/${project.id}`, { cookie, status: 404 });
  await request(`v2/businesses/${bid}/channel-link`, { method: "POST", cookie, status: 404 });
  await request("v2/integrations/channel/bridge", {
    method: "POST",
    cookie,
    body: {},
    status: 404,
  });
  console.log(
    "v2 HTTP 스모크 통과: 최초 입력·단계 복귀·완료 후 대시보드·화면 24개·잘못된 경로 404·소유권·직원 스캔 확인/수정/삭제·현재 혜택·상세·프로젝트 완료/해제/삭제·반복 일정·이메일 동의/로컬 보관·주소록 동기화·주간 요약·공고 감시 API·제외한 외부 API 차단",
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "v2 HTTP 검증 실패");
  process.exitCode = 1;
});

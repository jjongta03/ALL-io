"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function AllioShell({
  children,
  signedIn,
  demo,
}: {
  children: React.ReactNode;
  signedIn: boolean;
  demo: boolean;
}) {
  const path = usePathname();
  const legacy = /^\/(admin|plans|outbox)(\/|$)/.test(path);
  const segments = path.split("/").filter(Boolean);
  const frames: Record<string, string> = {
    dashboard: "116-361",
    benefits: "116-432",
    mypage: "116-128",
    employees: "89-353",
    changes: "89-353",
    projects: "89-260",
    documents: "89-190",
    schedule: "89-227",
    reevaluate: "89-372",
    conditions: "89-403",
    notifications: "100-450",
  };
  let frame = frames[segments[0]] ?? "116-361";
  if (segments[0] === "onboarding")
    frame =
      ({ "1": "89-31", "2": "111-92", "3": "111-96", "4": "111-100" } as Record<string, string>)[
        segments[1] ?? "1"
      ] ?? "89-31";
  if (segments[0] === "mypage" && segments[1])
    frame =
      ({ owner: "120-194", business: "120-247", history: "120-306" } as Record<string, string>)[
        segments[1]
      ] ?? frame;
  if (segments[0] === "employees" && segments[1])
    frame = segments[1] === "new" || segments[2] === "edit" ? "100-330" : "100-306";
  if (segments[0] === "contracts") frame = segments[1] === "new" ? "100-254" : "100-218";
  if (segments[0] === "benefits" && segments[1]) frame = "89-159";
  if (segments[0] === "projects" && segments[1]) frame = "89-302";
  const links = [
    ["/dashboard", "대시보드"],
    ["/benefits", "지원 가능한 지원사업"],
    ["/mypage", "마이페이지"],
  ];
  return (
    <div className="allio-shell">
      <div className="aio-ambience" aria-hidden="true">
        <img className="aio-sky" src={`/figma/${frame}-sky.svg`} alt="" />
        <img className="aio-forest" src={`/figma/${frame}-forest.svg`} alt="" />
      </div>
      <header className="aio-header">
        <div className="aio-header-inner">
          <Link href={signedIn ? "/dashboard" : "/"} className="aio-brand">
            ALL-IO
          </Link>
          <span className="aio-tagline">내 사업장 혜택·행정 관리</span>
          {!signedIn && (
            <Link className="aio-signin" href="/login">
              로그인
            </Link>
          )}
          <nav aria-label="주요 메뉴">
            {links.map(([href, label]) => (
              <Link
                key={href}
                href={signedIn ? href : `/login?next=${encodeURIComponent(href)}`}
                className={path === href || path.startsWith(href + "/") ? "active" : ""}
                aria-current={path === href ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className={legacy ? "aio-main aio-legacy" : "aio-main"}>
        {children}
      </main>
      {demo && (
        <div className="aio-demo-note">
          DEMO · 가상 규칙으로 동작하는 개발용 데모 · 실제 지원 자격·금액·법정 기한이 아닙니다.
        </div>
      )}
    </div>
  );
}

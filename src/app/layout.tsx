import type { Metadata } from "next";
import Link from "next/link";
import { Sprout, LayoutDashboard, ListChecks, ShieldCheck, Mail } from "lucide-react";
import { getUser } from "@/server/auth";
import { getConfig } from "@/server/config";
import { ActionButton } from "@/components/actions";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "가게의 다음 · 채용 준비 도우미", template: "%s · 가게의 다음" },
  description: "직원 채용 전 확인할 혜택과 의무, 서류·할 일, 마감까지 연결합니다.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  const config = getConfig();
  return (
    <html lang="ko">
      <body>
        <a className="skip-link" href="#main">
          본문으로 이동
        </a>
        <div className="app-shell">
          <aside className="sidebar">
            <Link className="brand" href={user ? "/dashboard" : "/"}>
              <span className="brand-icon">
                <Sprout size={25} />
              </span>
              <span>
                가게의 다음<small>작은 가게의 다음 걸음</small>
              </span>
            </Link>
            {user && (
              <nav aria-label="주요 메뉴">
                <Link href="/dashboard">
                  <LayoutDashboard size={18} />내 채용 계획
                </Link>
                <Link href="/plans/new">
                  <ListChecks size={18} />새 계획 만들기
                </Link>
                <Link href="/outbox">
                  <Mail size={18} />
                  알림 보관함
                </Link>
                {user.role === "ADMIN" && (
                  <Link href="/admin/integrations">
                    <ListChecks size={18} />
                    API 사용 현황
                  </Link>
                )}
                {user.role === "ADMIN" && (
                  <Link href="/admin">
                    <ShieldCheck size={18} />
                    운영자 검수
                  </Link>
                )}
              </nav>
            )}
            <div className="sidebar-bottom">
              <span className="environment-dot" />
              {config.demo ? "로컬 데모 환경" : "검수된 제도 안내"}
              <p>
                {config.demo
                  ? "합성 데이터로 준비 흐름을 확인합니다."
                  : "마지막 확인 기준과 적용 범위를 함께 확인하세요."}
              </p>
              {user && (
                <ActionButton
                  path="session"
                  method="DELETE"
                  href="/login"
                  replace
                  className="button text-button"
                >
                  로그아웃
                </ActionButton>
              )}
            </div>
          </aside>
          <div className="workspace">
            <header className="topbar">
              <span>사업 변화 준비 도우미</span>
              {user ? (
                <span className="account-email" title={user.email}>
                  {user.is_demo ? "로컬 데모 계정" : user.email}
                </span>
              ) : (
                <Link href="/login" className="topbar-login">
                  로그인
                </Link>
              )}
              <span className="topbar-note">
                {config.demo ? "DEMO · 외부 메일 발송 없음" : "직원 채용 준비"}
              </span>
            </header>
            {config.demo && (
              <div className="demo-banner">
                <strong>가상 규칙으로 동작하는 개발용 데모입니다.</strong>
                <span>실제 혜택 자격·금액·법정 기한을 안내하는 결과가 아닙니다.</span>
              </div>
            )}
            <main id="main">{children}</main>
            <footer>
              가게의 다음 · 직원 한 명 채용 시나리오 · 공식 확인과 실제 신청은 담당 기관에서
              진행합니다.
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}

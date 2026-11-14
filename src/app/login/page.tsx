import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardCheck, CalendarDays, ArrowUpRight } from "lucide-react";
import { getUser } from "@/server/auth";
import { LoginForm } from "@/components/login-form";
import { loginDestination } from "@/domain/login";
export const metadata: Metadata = { title: "로그인" };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = loginDestination(typeof params.next === "string" ? params.next : undefined);
  if (await getUser()) redirect(next);
  return (
    <div className="aio login-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} />
        처음으로
      </Link>
      <div className="login-layout">
        <section className="login-intro" aria-labelledby="login-intro-title">
          <div className="aio-eyebrow">ALL-IO</div>
          <h1 id="login-intro-title">
            가게의 다음 걸음,
            <br />
            이어서 준비하세요.
          </h1>
          <p>
            저장한 계획부터 진행 중인 체크리스트까지.
            <br />내 가게의 준비 현황을 한곳에서 확인하세요.
          </p>
          <div className="login-benefits">
            <div>
              <ClipboardCheck size={21} />
              <span>
                <strong>하던 일 그대로 이어서</strong>
                <small>진행 중인 체크리스트와 완료 기록</small>
              </span>
              <ArrowUpRight size={17} />
            </div>
            <div>
              <CalendarDays size={21} />
              <span>
                <strong>다가오는 일정도 함께</strong>
                <small>프로젝트와 주기적으로 챙길 서류</small>
              </span>
              <ArrowUpRight size={17} />
            </div>
          </div>
        </section>
        <section className="aio-card login-card" aria-labelledby="login-title">
          <div className="aio-eyebrow">WELCOME BACK</div>
          <h2 id="login-title">계정으로 로그인</h2>
          <p>발급받은 이메일과 비밀번호를 입력해 주세요.</p>
          <LoginForm next={next} />
        </section>
      </div>
    </div>
  );
}

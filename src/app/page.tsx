import { redirect } from "next/navigation";
import { getUser } from "@/server/auth";
import { getConfig } from "@/server/config";
import { DemoStart, LoginForm } from "@/components/actions";
export default async function Home() {
  if (await getUser()) redirect("/dashboard");
  return (
    <div className="aio aio-welcome">
      <div>
        <span className="aio-eyebrow">ALL-IO · 내 사업장의 다음 단계</span>
        <h1>
          가게를 돌보는 일에,
          <br />
          조금 더 여유를.
        </h1>
        <p>
          내 사업장에 맞는 혜택부터 놓치기 쉬운 행정업무까지.
          <br />
          사업장과 직원 정보를 입력하고 한곳에서 관리하세요.
        </p>
        {getConfig().demo && <DemoStart />}
        <div className="aio-welcome-points">
          <span>01 &nbsp; 내 사업장 정보</span>
          <span>02 &nbsp; 혜택 확인</span>
          <span>03 &nbsp; 일정 관리</span>
        </div>
      </div>
      <section className="aio-card">
        <h2>ALL-IO 시작하기</h2>
        <p>발급받은 계정으로 로그인하세요.</p>
        <LoginForm />
        {getConfig().demo && <small>로컬 데모는 가입 없이 시작할 수 있어요.</small>}
      </section>
    </div>
  );
}

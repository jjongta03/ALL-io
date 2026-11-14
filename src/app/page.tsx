import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Check, Bell, Files, Sparkles } from "lucide-react";
import { getUser } from "@/server/auth";
import { getConfig } from "@/server/config";
import { DemoStart } from "@/components/actions";
export default async function Home() {
  if (await getUser()) redirect("/dashboard");
  return (
    <div className="landing">
      <div className="eyebrow">
        <span />
        직원 채용, 다음 걸음을 준비하세요
      </div>
      <h1>
        가게의 변화 앞에서,
        <br />
        챙겨야 할 일을 한눈에.
      </h1>
      <p className="lead">
        직원 한 명을 더 채용할 때 확인할 혜택과 의무.
        <br />
        필요한 서류부터 준비 일정까지 차근차근 연결해 드립니다.
      </p>
      <div className="landing-actions">
        {getConfig().demo && <DemoStart />}
        <Link className="button text-button" href="/login">
          계정으로 로그인 <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="journey-preview">
        <div>
          <Sparkles size={22} />
          <strong>무엇이 달라질까?</strong>
          <p>혜택과 의무의 변화를 확인해요.</p>
        </div>
        <div>
          <Files size={22} />
          <strong>무엇을 준비할까?</strong>
          <p>필요한 서류와 확인할 일을 모아요.</p>
        </div>
        <div>
          <Bell size={22} />
          <strong>언제까지 해야 할까?</strong>
          <p>저장한 준비 일정의 알림을 받아요.</p>
        </div>
      </div>
      <div className="landing-bottom">
        <div>
          <h2>처음에는 아는 만큼만.</h2>
          <p>모르는 정보는 나중에 보완할 수 있습니다.</p>
          <ul className="check-list">
            <li>
              <Check size={16} />
              입력 조건에 따른 이유와 출처
            </li>
            <li>
              <Check size={16} />
              현재 상태와 채용 계획 분리
            </li>
            <li>
              <Check size={16} />
              계획별 체크리스트와 완료 기록
            </li>
          </ul>
        </div>
        <section className="panel login-panel">
          <h2>저장한 준비를 이어가세요</h2>
          <p className="small-note">
            발급받은 이메일과 비밀번호로 내 계획과 체크리스트를 확인하세요.
          </p>
          <Link href="/login" className="button primary">
            로그인하기 <ArrowUpRight size={16} />
          </Link>
        </section>
      </div>
      <Link href="/dashboard" className="sr-only">
        내 채용 계획으로 이동
      </Link>
    </div>
  );
}

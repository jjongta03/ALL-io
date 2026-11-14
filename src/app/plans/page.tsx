import Link from "next/link";
import { Plus, ArrowUpRight, CalendarDays, Users, MoveRight } from "lucide-react";
import { pageUser } from "@/server/page-auth";
import { getDb } from "@/server/db";
import { listPlans } from "@/server/service";
export default async function Dashboard() {
  const user = await pageUser(false, "/plans");
  const plans = await listPlans(await getDb(), user.id);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MY PLANS</div>
          <h1>가게의 다음 계획</h1>
          <p>채용 전에 확인하고, 준비한 내용을 이어가세요.</p>
        </div>
        <Link className="button primary" href="/plans/new">
          <Plus size={18} />새 채용 계획
        </Link>
      </div>
      <section className="overview-strip">
        <div>
          <span>저장한 계획</span>
          <strong>
            {plans.length}
            <small>개</small>
          </strong>
        </div>
        <div>
          <span>진행 중인 계획</span>
          <strong>
            {plans.filter((p) => p.status === "ACTIVE").length}
            <small>개</small>
          </strong>
        </div>
        <p>
          계획을 저장해도 현재 직원 수는 변경되지 않습니다.
          <br />
          실제 채용 여부와 기관 신청은 별도로 확인하세요.
        </p>
      </section>
      <div className="section-title">
        <h2>내 채용 계획</h2>
        <span>{plans.length}개의 기록</span>
      </div>
      {plans.length ? (
        <div className="plans-grid">
          {plans.map((p) => (
            <Link href={`/plans/${p.id}`} className="plan-card" key={p.id}>
              <div className="plan-card-top">
                <span className={`badge ${p.status === "CANCELLED" ? "muted" : "green"}`}>
                  {p.status === "CANCELLED" ? "취소한 계획" : "준비 중"}
                </span>
                <ArrowUpRight size={19} />
              </div>
              <h3>{p.before_snapshot.nickname}</h3>
              <p>직원 1명 채용</p>
              <div className="plan-facts">
                <span>
                  <Users size={16} />
                  {p.before_snapshot.currentHeadcount}명 <MoveRight size={14} />{" "}
                  {p.before_snapshot.currentHeadcount + 1}명
                </span>
                <span>
                  <CalendarDays size={16} />
                  {p.proposed_change.startDate}
                </span>
              </div>
              <div className="plan-card-bottom">
                {p.result?.missingFields.length
                  ? `추가 확인할 정보 ${p.result.missingFields.length}개`
                  : "혜택 변화와 준비 목록 확인"}
                <span>계획 열기 →</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <section className="empty-state">
          <div className="empty-icon">
            <Users size={28} />
          </div>
          <h2>다음 직원을 맞이할 준비, 여기서 시작하세요.</h2>
          <p>가게 정보와 채용 계획을 입력하면 확인할 조건과 할 일을 정리합니다.</p>
          <Link className="button primary" href="/plans/new">
            첫 채용 계획 만들기 <ArrowUpRight size={17} />
          </Link>
        </section>
      )}
    </>
  );
}

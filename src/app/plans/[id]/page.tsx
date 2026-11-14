import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, ExternalLink, CalendarDays, CheckCircle2, Pencil } from "lucide-react";
import { pageUser } from "@/server/page-auth";
import { getDb } from "@/server/db";
import { getConfig } from "@/server/config";
import { planDetail, getPolicies } from "@/server/service";
import { Simulator } from "@/components/simulator";
import { SupportPanel } from "@/components/support-panel";
import { ResultCard } from "@/components/result-card";
import { ActionButton, FeedbackForm } from "@/components/actions";
import { PlanForm } from "@/components/plan-form";
export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await pageUser(false, `/plans/${id}`);
  let detail;
  try {
    detail = await planDetail(await getDb(), id, user.id);
  } catch {
    notFound();
  }
  const { plan, evaluation, tasks } = detail;
  const result = evaluation?.result;
  const active = plan.status === "ACTIVE";
  const policies = await getPolicies(await getDb());
  return (
    <>
      <Link href="/dashboard" className="back-link">
        <ArrowLeft size={15} />내 계획으로
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">HIRING PLAN · {active ? "진행 중" : "취소됨"}</div>
          <h1>{plan.before_snapshot.nickname}</h1>
          <p>
            직원 {plan.before_snapshot.currentHeadcount}명 →{" "}
            {plan.before_snapshot.currentHeadcount + 1}명 · 입사 예정{" "}
            {plan.proposed_change.startDate}
          </p>
        </div>
        <span className="badge">입력 버전 {plan.input_revision}</span>
      </div>
      <Simulator
        business={plan.before_snapshot}
        hire={plan.proposed_change}
        policies={JSON.parse(JSON.stringify(policies))}
        allowDemo={getConfig().demo}
      />
      {result?.missingFields.length ? (
        <div className="notice">
          <strong>아직 확인하지 않은 정보 {result.missingFields.length}개가 있습니다.</strong>
          <p>아래 ‘입력 조건 보완’에서 아는 정보만 추가하면 결과를 다시 확인할 수 있습니다.</p>
        </div>
      ) : null}
      {!result?.all.length && (
        <div className="notice">
          아직 게시된 판정 규칙이 없습니다. 운영자가 공식 근거를 검수하고 승인하면 결과가
          제공됩니다.
        </div>
      )}
      <div className="result-columns">
        <section>
          <div className="column-title">
            <span>01</span>
            <h2>받을 수 있는 혜택</h2>
          </div>
          {result?.gains.map((r) => (
            <ResultCard key={r.policyId} result={r} />
          ))}
        </section>
        <section>
          <div className="column-title">
            <span>02</span>
            <h2>달라지는 점</h2>
          </div>
          {result?.changes.map((r) => (
            <ResultCard key={r.policyId} result={r} />
          ))}
          <p className="small-note">
            현재 수혜 여부와 제도별 조건이 확인되지 않으면 ‘받던 혜택 상실’로 판단하지 않습니다.
          </p>
        </section>
        <section>
          <div className="column-title">
            <span>03</span>
            <h2>서류·할 일</h2>
          </div>
          {result?.taskRules.map((r) => (
            <ResultCard key={r.policyId} result={r} />
          ))}
        </section>
      </div>
      <div className="section-title">
        <h2>나의 준비 체크리스트</h2>
        <span>
          {tasks.filter((t) => t.status === "DONE").length}/{tasks.length} 완료
        </span>
      </div>
      <section className="panel task-list">
        {tasks.length ? (
          tasks.map((t) => (
            <article className={`task-row ${t.status === "DONE" ? "task-done" : ""}`} key={t.id}>
              <div className="task-content">
                <div className="task-title">
                  <CheckCircle2 size={18} />
                  <h3>{t.title}</h3>
                  {t.status === "DONE" && <span className="badge green">완료</span>}
                  {t.status === "NEEDS_REVIEW" && (
                    <span className="badge amber">변경 내용 재확인</span>
                  )}
                </div>
                <p>{t.guide.description}</p>
                <div className="task-meta">
                  <span>
                    <CalendarDays size={14} />
                    {t.deadline_date ? `준비 목표일 ${t.deadline_date}` : "기한 확인 필요"}
                  </span>
                  <a href={t.guide.url} target="_blank" rel="noopener noreferrer">
                    {t.guide.destination}
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>
              {active && (
                <ActionButton
                  path={`tasks/${t.id}`}
                  method="PATCH"
                  body={{ done: t.status !== "DONE" }}
                  className={`button ${t.status === "DONE" ? "text-button" : "secondary"}`}
                >
                  {t.status === "DONE" ? "완료 취소" : "완료로 표시"}
                </ActionButton>
              )}
            </article>
          ))
        ) : (
          <div className="empty-small">
            현재 조건에서 생성된 할 일이 없습니다. 지원 범위와 입력 정보를 확인하세요.
          </div>
        )}
      </section>
      <section className="panel alert-panel">
        <div>
          <h2>준비 일정을 놓치지 않도록</h2>
          <p>
            {getConfig().emailTransport === "local"
              ? "현재는 외부로 발송하지 않고 알림 보관함에만 저장합니다."
              : "선택한 계획의 준비 목표일과 승인된 변경을 이메일로 알려드립니다."}
          </p>
          <small>완료·취소한 항목의 미발송 알림은 중지됩니다.</small>
        </div>
        {active && (
          <div className="inline-actions">
            <ActionButton
              path={`plans/${id}/alerts`}
              method="PUT"
              body={{ enabled: !plan.email_alerts }}
              className={`button ${plan.email_alerts ? "secondary" : "primary"}`}
            >
              {plan.email_alerts ? "알림 끄기" : "이 계획의 알림 켜기"}
            </ActionButton>
            {getConfig().demo && plan.email_alerts && (
              <ActionButton path={`plans/${id}/test-mail`}>로컬 테스트 알림 생성</ActionButton>
            )}
          </div>
        )}
      </section>
      {active && (
        <details className="panel edit-panel">
          <summary>
            <Pencil size={17} />
            입력 조건 보완
          </summary>
          <PlanForm
            initialBusiness={plan.before_snapshot}
            initialHire={plan.proposed_change}
            planId={id}
            demo={false}
          />
        </details>
      )}
      <SupportPanel planId={id} />
      {evaluation && <FeedbackForm evaluationId={evaluation.id} />}
      <div className="plan-footnote">
        <p>
          적용 기준일 {result?.basisDate ?? plan.proposed_change.startDate} · 판정 기록{" "}
          {evaluation?.id.slice(0, 8) ?? "없음"}
        </p>
        {active && (
          <ActionButton
            path={`plans/${id}/cancel`}
            className="button text-button danger"
            confirmText="계획을 취소하고 예약 알림을 중지할까요? 기록은 보존됩니다."
          >
            계획 취소
          </ActionButton>
        )}
      </div>
    </>
  );
}

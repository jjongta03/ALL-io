"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/actions";
import {
  industries,
  employmentTypes,
  type WorkspaceData,
  type Project,
  type Document,
} from "./types";
import {
  Card,
  Heading,
  ButtonLink,
  Empty,
  Progress,
  MutationButton,
  ExternalLink,
  ErrorText,
  Dialog,
} from "./ui";
import {
  ProfileEditor,
  Roster,
  EmployeeForm,
  ContractUpload,
  DeleteEmployee,
  DocumentEditor,
} from "./forms";

function description(data: WorkspaceData) {
  return data.business
    ? `${data.business.facts.industry ? industries[data.business.facts.industry] : "업종 미입력"} · 등록된 직원 ${data.roster.total}명 · ${data.business.facts.rosterConfirmed ? "사업장 정보 등록 완료" : "직원 명단 확인 필요"}`
    : "사업장과 직원 정보를 등록하고 맞춤 혜택을 확인하세요.";
}
function EmailNote({ children }: { children?: React.ReactNode }) {
  return (
    <Card>
      <h2>이메일 알림</h2>
      <p>
        {children ?? "새 혜택·신청 및 제출 기한·프로젝트 일정을 동의한 계정 이메일로 안내합니다."}
      </p>
      <Link className="aio-text-link" href="/mypage/owner">
        이메일 수신 설정 →
      </Link>
    </Card>
  );
}
function Reevaluate({ data }: { data: WorkspaceData }) {
  return data.business && data.benefits.needsReevaluation ? (
    <Card>
      <h2>최신 정보로 다시 확인해 주세요.</h2>
      <p>날짜 또는 제도 정보가 달라졌어요. 재진단 후 신청 가능한 혜택을 보여드려요.</p>
      <MutationButton path={`v2/businesses/${data.business.id}/evaluate`} primary>
        내 사업장 다시 진단하기
      </MutationButton>
    </Card>
  ) : null;
}
function Changes() {
  return (
    <Card>
      <h2>사업장 변경사항 입력</h2>
      <p className="aio-small">변화가 생겼을 때 해당 항목을 선택해 정보를 업데이트합니다.</p>
      <div className="aio-change-grid">
        {[
          ["직원 채용·퇴사", "/changes"],
          ["급여·근무조건 변경", "/conditions"],
          ["매출·매출 규모 변화", "/mypage/business"],
          ["사업장 이전", "/mypage/business"],
          ["업종 변경", "/mypage/business"],
          ["기타 변경", "/mypage"],
        ].map(([label, href]) => (
          <ButtonLink key={label} href={href}>
            {label}
          </ButtonLink>
        ))}
      </div>
    </Card>
  );
}
function Dashboard({ data }: { data: WorkspaceData }) {
  const active = data.projects.filter((p) => !p.complete),
    completed = data.projects.filter((p) => p.complete);
  const pending = data.documents.flatMap((d) => d.occurrences).filter((o) => !o.done).length;
  return (
    <>
      <Heading
        title={
          <>
            내 사업장 <span>대시보드</span>
          </>
        }
        description={description(data)}
      />
      {!data.business && (
        <div className="aio-actions">
          <ButtonLink href="/onboarding" primary>
            내 사업장 등록
          </ButtonLink>
        </div>
      )}
      <Reevaluate data={data} />
      <div className="aio-asymmetric aio-dashboard-grid">
        <Card>
          <div className="aio-stats">
            <div className="aio-stat is-dark">
              <strong>{data.benefits.benefits.length}건</strong>
              <h3>지금 신청 가능한 혜택</h3>
              <p>현재 사업장·직원 정보 기준</p>
            </div>
            <div className="aio-stat">
              <strong>{pending}건</strong>
              <h3>처리할 행정업무</h3>
              <p>신고·서류 확인 필요</p>
            </div>
          </div>
          <h3>지금 확인해 볼 항목</h3>
          {[
            ["현재 신청 가능한 지원사업", "사업장 조건에 맞는 지원사업 자격 확인", "/benefits"],
            ["확인해야 할 신고 및 서류", "사업장 현황에 따른 행정업무 확인", "/documents"],
            ["신청 및 제출 일정", "마감일과 진행 상태 관리", "/schedule"],
          ].map(([title, body, href], i) => (
            <Link className={`aio-row tone-${i}`} href={href} key={href}>
              <h3>{title} &nbsp;›</h3>
              <p>{body}</p>
            </Link>
          ))}
        </Card>
        <div className="aio-stack">
          <Card className="is-dark aio-project-summary">
            <h2>내 프로젝트 현황</h2>
            <p>
              진행 중인 프로젝트 &nbsp; {active.length}개<br />
              완료된 프로젝트 &nbsp; {completed.length}개
            </p>
            {active[0] ? (
              <>
                <h3>{active[0].project.title}</h3>
                <Progress project={active[0]} />
              </>
            ) : (
              <p className="aio-small">혜택 상세에서 프로젝트를 시작해 보세요.</p>
            )}
            <Link href="/projects">전체 프로젝트 보기 →</Link>
          </Card>
          <Changes />
        </div>
      </div>
    </>
  );
}
function Benefits({ data }: { data: WorkspaceData }) {
  return (
    <>
      <Heading
        title="현재 신청 가능한 지원사업"
        description={`${description(data)} · 직원 수는 사장님 제외`}
      />
      <Card>
        <p>현재 사업장·직원 정보로 조건을 충족하고 지금 신청할 수 있는 혜택만 보여드려요.</p>
      </Card>
      <Reevaluate data={data} />
      <h2>지금 신청 가능한 혜택 {data.benefits.benefits.length}건</h2>
      <div className="aio-two">
        {data.benefits.benefits.map((b) => (
          <Link
            key={b.policyId}
            className={`aio-card aio-benefit ${b.workflowStatus === "COMPLETED" ? "is-complete" : ""}`}
            href={`/benefits/${b.policyId}`}
          >
            <span className="aio-eyebrow">
              {b.isDemo ? "가상 데모 · " : ""}
              {b.workflowStatus === "COMPLETED"
                ? "완료"
                : b.workflowStatus === "IN_PROGRESS"
                  ? "진행 중"
                  : "신청 가능"}
            </span>
            <h3>{b.title} ›</h3>
            <p>{b.sources[0]?.title ?? "현재 사업장 조건을 기준으로 확인한 혜택"}</p>
            <small>
              {b.progress !== null
                ? `프로젝트 진행률 ${b.progress}%`
                : "상세 조건과 신청 절차 확인"}
            </small>
          </Link>
        ))}
      </div>
      {!data.benefits.benefits.length && !data.benefits.needsReevaluation && (
        <Empty
          title="현재 확인된 신청 가능 혜택이 없어요."
          href="/mypage"
          action="사업장 정보 확인"
        >
          정보가 부족하거나 검수된 모집 중 혜택이 없는 경우 목록에 표시되지 않습니다.
        </Empty>
      )}
      <p className="aio-small">최종 선정과 지급 여부는 신청 기관의 심사에 따라 결정됩니다.</p>
      <p className="aio-small">새로 신청 가능한 혜택은 이메일 수신에 동의한 경우 안내해 드려요.</p>
    </>
  );
}
function StartProject({ data }: { data: WorkspaceData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const b = data.benefit!;
  return b.project ? (
    <ButtonLink href={`/projects/${b.project.project.id}`} primary>
      내 프로젝트 이어가기 →
    </ButtonLink>
  ) : (
    <>
      <button
        className="aio-button is-primary"
        disabled={
          busy ||
          b.eligibility !== "MATCH" ||
          b.needsReevaluation ||
          !b.policy.definition.tasks.length
        }
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const p = await api<{ id: string }>(
              `v2/businesses/${data.business!.id}/projects`,
              "POST",
              { policyId: b.policy.policyId },
            );
            router.push(`/projects/${p.id}`);
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "프로젝트 준비 중…" : "프로젝트 진행하기 →"}
      </button>
      {!b.policy.definition.tasks.length && (
        <p className="aio-small">검수된 신청 절차가 준비되면 프로젝트를 시작할 수 있어요.</p>
      )}
      <ErrorText error={error} />
    </>
  );
}
function BenefitDetail({ data }: { data: WorkspaceData }) {
  const b = data.benefit!;
  const p = b.policy;
  const d = p.definition;
  return (
    <>
      <Heading
        back={{ href: "/benefits", label: "지원사업 목록" }}
        title={p.title}
        description={`${p.isDemo ? "가상 데모 · " : ""}${b.eligibility === "MATCH" ? "입력 조건에 부합" : "현재 조건 재확인 필요"}`}
      />
      <Reevaluate data={data} />
      <div className="aio-asymmetric">
        <Card>
          <h3>지원 내용</h3>
          <p className="aio-preline">{d.explanation}</p>
          <h3>신청 기간</h3>
          <p>
            {d.applicationWindow
              ? `${d.applicationWindow.startsOn} ~ ${d.applicationWindow.endsOn ?? "종료일 미정"}`
              : "모집 기간 확인 필요"}
          </p>
          <h3>출처·확인일</h3>
          {d.sources.map((s) => (
            <div className="aio-source" key={s.url}>
              <strong>{s.title}</strong>
              <p>
                {s.verified ? "출처 검수 완료" : "출처 확인 필요"} ·{" "}
                {p.verifiedAt ? String(p.verifiedAt).slice(0, 10) : "확인일 미등록"}
              </p>
              <details>
                <summary>판정 근거 원문</summary>
                <p>{s.section}</p>
                <ExternalLink href={s.url}>공식 원문 확인</ExternalLink>
              </details>
            </div>
          ))}
        </Card>
        <Card>
          <h2>신청 전 확인해 주세요</h2>
          <p>입력한 정보와 실제 공고의 대상·기간·제외 요건을 함께 확인해 주세요.</p>
          <h3>예상 진행 단계</h3>
          <ol className="aio-list">
            {d.tasks.map((t) => (
              <li key={t.key}>{t.title}</li>
            ))}
          </ol>
          <ExternalLink href={d.sources[0]?.url}>공식 공고 확인하기</ExternalLink>
          <StartProject data={data} />
          <p className="aio-small">체크리스트와 일정이 있는 프로젝트로 신청 과정을 관리해요.</p>
        </Card>
      </div>
    </>
  );
}
function MyPage({ data }: { data: WorkspaceData }) {
  const b = data.business?.facts;
  const p = data.profile;
  return (
    <>
      <Heading
        title="마이페이지"
        description="등록한 사장님·사업장·직원 정보를 확인하고 수정하세요."
      />
      <div className="aio-two">
        <div className="aio-stack">
          <Card>
            <h2>사장님 정보</h2>
            <p>
              {p?.name ?? "이름 미입력"} · 생년월일 {p?.birthDate ?? "미입력"}
              <br />
              연락처 {p?.phone ?? "미입력"}
              <br />
              이메일 {p?.email ?? data.email}
            </p>
            <ButtonLink href="/mypage/owner">사장님 정보 수정</ButtonLink>
          </Card>
          <Card>
            <h2>사업장·지난 사업기록</h2>
            <p>
              {b?.nickname ?? "등록된 사업장 없음"}
              <br />
              {b?.industry ? industries[b.industry] : "업종 미입력"} · {b?.region ?? "지역 미입력"}
              <br />
              사업 시작일 {b?.startedOn ?? "미입력"} · 연 매출 {b?.revenueBand ?? "미입력"}
              <br />
              지난 사업기록{" "}
              {b?.pastBusinessHistoryConfirmed ? `${b.pastBusinesses.length}건` : "미확인"}
            </p>
            <ButtonLink href="/mypage/business">사업장 정보 수정</ButtonLink>
            <ButtonLink href="/mypage/history">지난 사업기록 수정</ButtonLink>
          </Card>
        </div>
        <div className="aio-stack">
          <Roster data={data} compact />
          <Card>
            <h2>이메일 알림 설정</h2>
            <p>
              새 혜택 · 신청 및 제출 기한 · 프로젝트 일정
              <br />
              현재 수신 {p?.emailAlerts ? "동의" : "미동의"} · 수신 여부는 사장님 정보에서
              변경합니다.
            </p>
            <ButtonLink href="/notifications">알림 내역 보기</ButtonLink>
          </Card>
        </div>
      </div>
    </>
  );
}
function EmployeeDetail({ data }: { data: WorkspaceData }) {
  const e = data.employee!,
    v = e.details;
  const back = data.business?.facts.rosterConfirmed ? "/employees" : "/onboarding/4";
  return (
    <>
      <Heading
        back={{ href: back, label: "직원 목록" }}
        title={v.name}
        description="직원 정보를 확인하고 수정할 수 있어요."
      />
      <div className="aio-asymmetric">
        <Card>
          <h2>근로 정보</h2>
          <dl className="aio-details">
            {[
              ["이름", v.name],
              ["근로 형태", v.employmentType ? employmentTypes[v.employmentType] : "미입력"],
              ["주당 근로시간", v.weeklyHours === null ? "미입력" : `주 ${v.weeklyHours}시간`],
              ["시급", v.hourlyWage === null ? "미입력" : `${v.hourlyWage.toLocaleString()}원`],
              ["입사일", v.startedOn ?? "미입력"],
            ].map(([k, val]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{val}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <h2>직원 정보 관리</h2>
          <ButtonLink href={`/employees/${e.id}/edit`}>편집하기</ButtonLink>
          {e.scan_id && (
            <a
              className="aio-button"
              href={`/api/v2/scans/${e.scan_id}/document`}
              target="_blank"
              rel="noopener noreferrer"
            >
              계약서 원문 보기
            </a>
          )}
          <DeleteEmployee
            employee={e}
            back={data.business?.facts.rosterConfirmed ? "/reevaluate" : "/onboarding/4"}
          />
        </Card>
      </div>
    </>
  );
}
function Projects({ data }: { data: WorkspaceData }) {
  const [filter, setFilter] = useState("all");
  const complete = data.projects.filter((p) => p.complete).length;
  const visible = data.projects.filter(
    (p) => filter === "all" || (filter === "complete") === p.complete,
  );
  return (
    <>
      <Heading
        title="내 프로젝트"
        description={`진행 중 ${data.projects.length - complete}개 · 완료 ${complete}개`}
      />
      {data.projects.length ? (
        <>
          <div className="aio-tabs" role="group" aria-label="프로젝트 상태 필터">
            {[
              ["all", "전체"],
              ["active", "진행 중"],
              ["complete", "완료"],
            ].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={key === filter}
                className={`aio-button ${key === filter ? "is-primary" : ""}`}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="aio-three">
            {visible.map((p) => (
              <Link
                className={`aio-card ${p.complete ? "is-complete" : ""}`}
                href={`/projects/${p.project.id}`}
                key={p.project.id}
              >
                <span className="aio-eyebrow">지원금 신청</span>
                <h2>{p.project.title}</h2>
                <Progress project={p} />
                <p>{p.complete ? "완료됨" : "프로젝트 상세 보기 →"}</p>
                {!data.benefits.benefits.some((b) => b.policyId === p.project.policy_id) && (
                  <small>현재 조건 재확인 필요</small>
                )}
              </Link>
            ))}
          </div>
          {!visible.length && <Empty title="이 상태의 프로젝트가 없어요." />}
        </>
      ) : (
        <Empty title="아직 프로젝트가 없어요." href="/benefits" action="지원사업 확인하기">
          지원사업 상세에서 ‘프로젝트 진행하기’를 눌러 신청 과정을 관리해 보세요.
        </Empty>
      )}
    </>
  );
}
function ProjectStep({ step, refresh }: { step: Project["steps"][number]; refresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deadline, setDeadline] = useState(step.deadline ?? "");
  async function update(body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(`v2/project-steps/${step.id}`, "PATCH", body);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`aio-row aio-step ${step.done ? "is-complete" : ""}`}>
      <label className="aio-check">
        <input
          type="checkbox"
          checked={step.done}
          disabled={busy}
          onChange={(e) => void update({ done: e.target.checked })}
        />
        <strong>{step.title}</strong>
      </label>
      <div className="aio-step-meta">
        <input
          type="date"
          aria-label={`${step.title} 준비 목표일`}
          disabled={busy}
          value={deadline}
          onInput={(e) => setDeadline(e.currentTarget.value)}
        />
        {deadline !== (step.deadline ?? "") && (
          <button
            className="aio-button"
            disabled={busy}
            onClick={() => void update({ deadline: deadline || null })}
          >
            일정 저장
          </button>
        )}
        <ExternalLink href={step.guide.url}>{step.guide.destination || "신청 사이트"}</ExternalLink>
      </div>
      <ErrorText error={error} />
    </div>
  );
}
function ProjectDetail({ data }: { data: WorkspaceData }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const p = data.project!;
  return (
    <>
      <Heading
        title={p.project.title}
        description="내 프로젝트 / 지원금 신청"
        back={{ href: "/projects", label: "내 프로젝트" }}
      />
      <Progress project={p} />
      {!data.benefits.benefits.some((b) => b.policyId === p.project.policy_id) && (
        <Card>
          <p>사업장 조건 또는 모집 기간을 다시 확인해 주세요. 기존 진행 기록은 보존됩니다.</p>
        </Card>
      )}
      <div className="aio-asymmetric">
        <Card>
          <h2>① 프로젝트 체크리스트</h2>
          {p.steps.map((step) => (
            <ProjectStep key={step.id} step={step} refresh={() => router.refresh()} />
          ))}
          <h2>③ 필요 서류 안내</h2>
          <p>각 단계의 안내와 신청 기관의 공고에서 필요한 서류를 확인해 주세요.</p>
          <ButtonLink href="/documents">신고 및 서류 관리</ButtonLink>
        </Card>
        <div className="aio-stack">
          <Card>
            <h2>② 프로젝트 일정</h2>
            {p.steps.map((s) => (
              <p className={s.done ? "is-complete" : ""} key={s.id}>
                {s.deadline ?? "기한 미정"} · {s.title}
              </p>
            ))}
            <small>준비 목표일입니다. 공고별 실제 기한을 함께 확인해 주세요.</small>
          </Card>
          <Card>
            <h2>④ 사후관리</h2>
            <h3>신청 이후에도 확인해 주세요</h3>
            <ul className="aio-list">
              <li>심사 결과 확인</li>
              <li>추가 서류 요청 대응</li>
              <li>지원금 지급 여부 확인</li>
              <li>다음 연도 공고·갱신 일정 확인</li>
            </ul>
          </Card>
        </div>
      </div>
      <div className="aio-actions">
        <ButtonLink href={`/benefits/${p.project.policy_id}`}>지원사업 상세</ButtonLink>
        <ExternalLink href={p.steps[0]?.guide.url}>공식 신청 사이트</ExternalLink>
        <button className="aio-button" onClick={() => setDeleting(true)}>
          프로젝트 삭제
        </button>
      </div>
      {deleting && (
        <Dialog title="프로젝트를 삭제할까요?" onClose={() => setDeleting(false)}>
          <p>
            체크리스트와 예약 알림이 함께 삭제됩니다. 실제 기관에 제출한 신청은 취소되지 않습니다.
          </p>
          <button className="aio-button" autoFocus onClick={() => setDeleting(false)}>
            취소 · 돌아가기
          </button>
          <MutationButton
            path={`v2/projects/${p.project.id}`}
            method="DELETE"
            body={{ confirm: true }}
            href="/projects"
          >
            확인 · 프로젝트 삭제
          </MutationButton>
        </Dialog>
      )}
      <EmailNote>
        프로젝트 일정이 임박하면 이메일로 알려드려요. 남은 단계와 기한을 확인할 수 있어요.
      </EmailNote>
    </>
  );
}
function Documents({ data }: { data: WorkspaceData }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Document | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Document | null>(null);
  const total = data.documents.flatMap((d) => d.occurrences);
  const pending = total.filter((o) => !o.done);
  return (
    <>
      <Heading
        back={{ href: "/dashboard", label: "대시보드" }}
        title="확인해야 할 신고 및 서류"
        description="등록한 반복 업무와 제출 일정을 확인하고, 완료한 회차를 체크해 두세요."
      />
      <div className="aio-between">
        <p>
          처리할 업무 {pending.length}건 / 전체 {total.length}건
        </p>
        <button className="aio-button is-primary" onClick={() => setEditing(null)}>
          + 반복 서류 등록
        </button>
      </div>
      <div className="aio-two">
        {data.documents.map((d) => (
          <Card key={d.id}>
            <h3>{d.title}</h3>
            <p>{d.memo ?? "등록한 일정에 맞춰 서류를 확인하세요."}</p>
            <small>
              {{ WEEKLY: "매주", MONTHLY: "매월", YEARLY: "매년" }[d.frequency]} ·{" "}
              {d.enabled ? "사용 중" : "중지됨"}
            </small>
            {d.occurrences.map((o) => (
              <div key={o.id} className={`aio-occurrence ${o.done ? "is-complete" : ""}`}>
                <span>{o.dueDate}</span>
                {o.done ? (
                  <span>✓ 완료</span>
                ) : (
                  <MutationButton path={`v2/occurrences/${o.id}/complete`}>
                    완료 처리
                  </MutationButton>
                )}
              </div>
            ))}
            <ExternalLink href={d.url}>제출 사이트</ExternalLink>
            <div className="aio-actions">
              <button className="aio-text-button" onClick={() => setEditing(d)}>
                수정
              </button>
              <button className="aio-text-button aio-danger-text" onClick={() => setDeleting(d)}>
                삭제
              </button>
            </div>
          </Card>
        ))}
      </div>
      {!data.documents.length && (
        <Empty title="아직 등록된 반복 서류가 없어요.">
          확인한 업무와 제출 기한을 등록하면 매주·매월·매년 회차별로 관리할 수 있어요.
        </Empty>
      )}
      <p className="aio-small">
        업무 기한은 실제 기관 안내를 확인해 입력하세요. 완료 상태는 계정에 저장됩니다.
      </p>
      {editing !== undefined && (
        <DocumentEditor
          business={data.business!}
          document={editing ?? undefined}
          today={data.today}
          onClose={() => setEditing(undefined)}
        />
      )}{" "}
      {deleting && (
        <Dialog title="이 반복 서류를 삭제할까요?" onClose={() => setDeleting(null)}>
          <p>{deleting.title}의 회차와 예약 알림도 함께 삭제됩니다.</p>
          <button className="aio-button" autoFocus onClick={() => setDeleting(null)}>
            취소
          </button>
          <MutationButton
            path={`v2/documents/${deleting.id}`}
            method="DELETE"
            onDone={() => {
              setDeleting(null);
              router.refresh();
            }}
          >
            삭제하기
          </MutationButton>
        </Dialog>
      )}
    </>
  );
}
function Schedule({ data }: { data: WorkspaceData }) {
  const items = [
    ...data.documents.flatMap((d) =>
      d.occurrences
        .filter((o) => !o.done)
        .map((o) => ({
          id: o.id,
          title: d.title,
          date: o.dueDate,
          kind: "행정업무",
          path: `v2/occurrences/${o.id}/complete`,
          body: undefined as unknown,
          href: "/documents",
        })),
    ),
    ...data.projects.flatMap((p) =>
      p.steps
        .filter((s) => !s.done && s.deadline)
        .map((s) => ({
          id: s.id,
          title: s.title,
          date: s.deadline!,
          kind: "프로젝트",
          path: `v2/project-steps/${s.id}`,
          body: { done: true } as unknown,
          href: `/projects/${p.project.id}`,
        })),
    ),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <>
      <Heading
        back={{ href: "/dashboard", label: "대시보드" }}
        title="신청 및 제출 일정"
        description="등록한 서류 제출일과 프로젝트의 준비 목표일이에요."
      />
      <div className="aio-asymmetric">
        <div className="aio-stack">
          {items.map((item) => {
            const days = Math.round((Date.parse(item.date) - Date.parse(data.today)) / 86400000);
            return (
              <Card key={item.id}>
                <small>
                  {item.kind} · {item.date}
                </small>
                <div className="aio-between">
                  <strong className="aio-dday">
                    {days === 0 ? "D-DAY" : days > 0 ? `D-${days}` : `${-days}일 지남`}
                  </strong>
                  <Link href={item.href}>{item.title}</Link>
                  <MutationButton
                    path={item.path}
                    method={item.body ? "PATCH" : "POST"}
                    body={item.body}
                  >
                    완료
                  </MutationButton>
                </div>
              </Card>
            );
          })}
          {!items.length && (
            <Empty title="다가오는 일정이 없어요." href="/documents" action="서류 일정 등록하기" />
          )}
        </div>
        <EmailNote>
          신청 마감이나 서류 제출 일정이 다가오면 수신 동의한 계정 이메일로 알려드려요.
        </EmailNote>
      </div>
    </>
  );
}
function Notices({ data }: { data: WorkspaceData }) {
  const names: Record<string, string> = {
    PENDING: "예약됨",
    SENT: "제공자 접수",
    LOCAL: "로컬 보관",
    UNKNOWN: "발송 상태 확인 필요",
    FAILED: "처리 실패",
    CANCELLED: "취소됨",
    CLAIMED: "처리 중",
    LOCAL_ONLY: "로컬 보관",
    ACCEPTED_BY_PROVIDER: "제공자 접수",
    SKIPPED: "발송 제외",
  };
  return (
    <>
      <Heading
        title="이메일 알림 내역"
        description="새 혜택·프로젝트·반복 서류의 예약과 발송 상태를 확인하세요."
      />
      <EmailNote />
      <div className="aio-two">
        {data.notices?.map((n) => (
          <Card key={n.id}>
            <span className="aio-eyebrow">{names[n.status] ?? n.status}</span>
            <h2>{n.payload.title ?? "일정 안내"}</h2>
            <p>
              {n.payload.deadline
                ? `기한 ${n.payload.deadline}`
                : "새로운 혜택과 일정을 확인해 주세요."}
            </p>
            {n.payload.path?.startsWith("/") && !n.payload.path.startsWith("//") && (
              <ButtonLink href={n.payload.path}>내용 확인</ButtonLink>
            )}
          </Card>
        ))}
      </div>
      {!data.notices?.length && <Empty title="아직 알림 내역이 없어요." />}
      <p className="aio-small">제공자 접수는 실제 이메일 수신 완료를 뜻하지 않습니다.</p>
    </>
  );
}
export function WorkspaceView({ screen, data }: { screen: string[]; data: WorkspaceData }) {
  const [area, id, action] = screen;
  if (area === "onboarding")
    return (
      <div className="aio">
        <ProfileEditor data={data} onboarding requestedStage={id ? Number(id) : undefined} />
      </div>
    );
  if (!data.business && area !== "dashboard" && !(area === "mypage" && id === "owner"))
    return (
      <div className="aio">
        <Heading
          title="내 사업장부터 등록해 볼까요?"
          description="간단한 4단계 입력으로 사업장 관리를 시작하세요."
        />
        <Empty title="아는 정보부터 입력해 주세요." href="/onboarding" action="내 사업장 등록하기">
          모르는 항목은 비워 두고 나중에 보완할 수 있어요.
        </Empty>
      </div>
    );
  let view: React.ReactNode;
  if (area === "dashboard") view = <Dashboard data={data} />;
  else if (area === "benefits")
    view = id ? <BenefitDetail data={data} /> : <Benefits data={data} />;
  else if (area === "mypage")
    view = id ? <ProfileEditor data={data} kind={id} /> : <MyPage data={data} />;
  else if (area === "projects")
    view = id ? <ProjectDetail data={data} /> : <Projects data={data} />;
  else if (area === "employees" && id)
    view =
      id === "new" || action === "edit" ? (
        <EmployeeForm data={data} />
      ) : (
        <EmployeeDetail data={data} />
      );
  else if (area === "contracts")
    view = id === "new" ? <ContractUpload data={data} /> : <EmployeeForm data={data} />;
  else if (area === "employees" || area === "changes")
    view = (
      <>
        <Heading
          title={area === "changes" ? "사업장 변경사항 입력" : "직원 관리"}
          description={description(data)}
        />
        <div className="aio-actions">
          <ButtonLink href="/contracts/new" primary>
            근로계약서로 직원 등록하기
          </ButtonLink>
          <ButtonLink href="/employees/new">직접 입력하기</ButtonLink>
          {!data.business?.facts.rosterConfirmed && (
            <ButtonLink href="/onboarding/4">직원 명단 확인하기</ButtonLink>
          )}
        </div>
        <Roster data={data} />
        <ButtonLink href="/reevaluate">변경된 정보로 다시 진단하기 →</ButtonLink>
      </>
    );
  else if (area === "documents") view = <Documents data={data} />;
  else if (area === "schedule") view = <Schedule data={data} />;
  else if (area === "notifications") view = <Notices data={data} />;
  else if (area === "conditions")
    view = (
      <>
        <Heading
          title="급여·근무조건 변경"
          description={description(data)}
          back={{ href: "/dashboard", label: "대시보드" }}
        />
        <Empty
          title="급여·근무조건 변화 비교는 준비 중이에요."
          href="/employees"
          action="직원 정보 확인하기"
        >
          직원별 근로시간과 시급은 직원 정보에서 수정할 수 있어요.
        </Empty>
      </>
    );
  else if (area === "reevaluate")
    view = (
      <>
        <Heading
          title="변경사항에 따른 재진단"
          description={description(data)}
          back={{ href: "/dashboard", label: "대시보드" }}
        />
        <div className="aio-asymmetric">
          <Card>
            <h2>현재 정보로 다시 확인해요</h2>
            <p>
              사업장·직원 정보의 변경은 저장 시 진단에 반영됩니다. 최신 날짜와 제도 기준으로 다시
              확인할 수도 있어요.
            </p>
            <p>
              현재 직원 {data.roster.currentCount}명 · 신청 가능 혜택{" "}
              {data.benefits.benefits.length}건
            </p>
            <p>진행 중인 프로젝트는 유지됩니다. 조건이 바뀐 프로젝트는 다시 확인해 주세요.</p>
          </Card>
          <Card>
            <MutationButton
              primary
              path={`v2/businesses/${data.business!.id}/evaluate`}
              href="/benefits"
            >
              최신 조건으로 재진단하기 →
            </MutationButton>
            <ButtonLink href="/dashboard">대시보드 보기</ButtonLink>
          </Card>
        </div>
      </>
    );
  return <div className="aio">{view}</div>;
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, ExternalLink, RefreshCw, Search } from "lucide-react";
import type { Definition } from "@/domain/contracts";
import type { ReviewAssessment } from "@/domain/review-routing";
import { api, ActionButton } from "./actions";

type Review = {
  id: string;
  title: string;
  reason: string;
  status: string;
  priority: number;
  version: number;
  is_demo: boolean;
  definition: Definition;
  previous_definition: Definition | null;
  assessment: ReviewAssessment | null;
};
type Operations = {
  policies: {
    id: string;
    title: string;
    version: number | null;
    status: string | null;
    is_demo: boolean | null;
  }[];
  jobs: { id: string; type: string; status: string; summary: unknown }[];
  feedback: { id: string; message: string; status: string }[];
  sources: { id: string; title: string; url: string; last_error: string | null }[];
  changes: { id: string; title: string; url: string; status: string; new_snapshot_id: string }[];
};
function ReviewCard({ review }: { review: Review }) {
  const [definition, setDefinition] = useState(JSON.stringify(review.definition, null, 2));
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  const classify = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`admin/reviews/${review.id}/assess`, "POST");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    setError("");
    try {
      await api(`admin/reviews/${review.id}`, "POST", {
        decision,
        ...(decision === "approve" ? { definition: JSON.parse(definition) } : {}),
      });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="panel review-card">
      <div className="review-heading">
        <div>
          <div className="inline-actions">
            <span className={`badge ${review.status === "PENDING" ? "amber" : "muted"}`}>
              {review.status === "PENDING"
                ? "검수 대기"
                : review.status === "APPROVED"
                  ? "승인됨"
                  : "반려됨"}
            </span>
            {review.is_demo && <span className="badge">가상 변경</span>}
          </div>
          <h2>{review.title}</h2>
          <p>{review.reason}</p>
        </div>
        <span className="version-mark">v{review.version}</span>
      </div>
      <div className="diff-grid">
        <section>
          <h3>기존 조건</h3>
          <pre>
            {JSON.stringify(review.previous_definition?.conditions ?? "이전 버전 없음", null, 2)}
          </pre>
        </section>
        <section>
          <h3>새 조건</h3>
          <pre>{JSON.stringify(review.definition.conditions, null, 2)}</pre>
        </section>
      </div>
      <div className="assessment-box">
        <div className="inline-actions">
          <strong>검수 우선순위 {review.priority}</strong>
          {review.status === "PENDING" && (
            <button className="button secondary" disabled={busy} onClick={classify}>
              변경 분류·우선순위 계산
            </button>
          )}
        </div>
        {review.assessment ? (
          <>
            <p>
              {review.assessment.method === "JEV"
                ? `Jev · ${review.assessment.model}`
                : "로컬 비교 · 외부 API 호출 없음"}{" "}
              ·{" "}
              {review.assessment.lane === "URGENT"
                ? "우선 검수"
                : review.assessment.lane === "LOW_RISK"
                  ? "표현 변경 후보"
                  : "직접 검수 필요"}
            </p>
            <p>{review.assessment.reason}</p>
            {review.assessment.method === "JEV" && (
              <p>
                모델 신뢰도 {Math.round(review.assessment.confidence * 100)}% · 출처 일치 추정{" "}
                {Math.round(review.assessment.sourceAgreement * 100)}% (법적 정확도 아님)
              </p>
            )}
            {review.assessment.errorCode && (
              <p role="status">
                외부 분류 실패: {review.assessment.errorCode} · 수동 검수를 유지합니다.
              </p>
            )}
          </>
        ) : (
          <p>아직 분류하지 않았습니다. 저장된 초안을 기준으로 계산합니다.</p>
        )}
        <small>분류는 자동 승인이 아닙니다. 아래에서 수정한 JSON은 승인할 때 반영됩니다.</small>
      </div>
      <div className="review-sources">
        <strong>공식 근거·검수 상태</strong>
        {review.definition.sources.map((s) => (
          <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
            {s.verified ? "검수 표시됨" : "원문 검수 필요"} · {s.title}
            <ExternalLink size={13} />
          </a>
        ))}
      </div>
      <details>
        <summary>초안 전체 보기·수정</summary>
        <label>
          조건·서류·출처 JSON
          <textarea
            className="code-input"
            rows={15}
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            disabled={review.status !== "PENDING"}
          />
        </label>
      </details>
      {review.status === "PENDING" && (
        <div className="review-actions">
          <p>승인 시 저장된 계획을 재평가하고 의미 있는 변화만 알림으로 예약합니다.</p>
          <div className="inline-actions">
            <button className="button secondary" disabled={busy} onClick={() => decide("reject")}>
              <X size={16} />
              반려
            </button>
            <button className="button primary" disabled={busy} onClick={() => decide("approve")}>
              <Check size={16} />
              검수 후 승인
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </article>
  );
}
export function AdminConsole({
  reviews,
  operations,
}: {
  reviews: Review[];
  operations: Operations;
}) {
  const [tab, setTab] = useState("reviews"),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState("두루누리 근로자 지원 공식 기준"),
    [search, setSearch] = useState<{ title: string; url: string; officialCandidate: boolean }[]>(
      [],
    );
  const router = useRouter();
  const [draftJson, setDraftJson] = useState("");
  return (
    <>
      <div className="admin-tabs" role="tablist" aria-label="운영자 기능">
        {[
          ["reviews", "규칙 검수"],
          ["policies", "게시된 규칙"],
          ["operations", "수집·작업·신고"],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            id={`tab-${key}`}
            className={tab === key ? "selected" : ""}
            onClick={() => setTab(key)}
          >
            {label}
            {key === "reviews" && (
              <span>{reviews.filter((r) => r.status === "PENDING").length}</span>
            )}
          </button>
        ))}
      </div>
      <section
        id="panel-reviews"
        role="tabpanel"
        aria-labelledby="tab-reviews"
        hidden={tab !== "reviews"}
      >
        {reviews.length ? (
          reviews.map((r) => <ReviewCard review={r} key={`${r.id}-${r.status}`} />)
        ) : (
          <div className="empty-state">
            <h2>대기 중인 규칙이 없습니다.</h2>
            <p>아래에서 근거를 갖춘 제도 초안을 등록할 수 있습니다.</p>
          </div>
        )}
        <details className="panel import-panel" open={draftJson ? true : undefined}>
          <summary>검수할 새 제도 초안 등록</summary>
          <p>
            실제 제도는 공식 원문 검수 후 승인해야 합니다. 등록만으로 사용자 결과에 반영되지
            않습니다.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("admin/policies", "POST", JSON.parse(draftJson));
                setNotice("초안을 검수 대기함에 등록했습니다.");
                setDraftJson("");
                router.refresh();
              } catch (e) {
                setNotice((e as Error).message);
              }
            }}
          >
            <label>
              초안 JSON
              <textarea
                className="code-input"
                name="json"
                rows={12}
                required
                value={draftJson}
                onChange={(e) => setDraftJson(e.target.value)}
                placeholder={
                  '{"title":"제도명","kind":"BENEFIT","effectiveFrom":"2026-01-01","effectiveTo":null,"definition":{...}}'
                }
              />
            </label>
            <button className="button secondary">초안 등록</button>
          </form>
        </details>
      </section>
      <section
        id="panel-policies"
        role="tabpanel"
        aria-labelledby="tab-policies"
        hidden={tab !== "policies"}
      >
        <div className="panel policy-list">
          {operations.policies.map((p) => (
            <article key={p.id}>
              <div>
                <h3>{p.title}</h3>
                <p>
                  v{p.version ?? "없음"} · {p.status ?? "미게시"} ·{" "}
                  {p.is_demo ? "가상 규칙" : "실제 규칙"}
                </p>
              </div>
              <div className="inline-actions">
                <ActionButton
                  path={`admin/policies/${p.id}/suspend`}
                  confirmText="이 규칙을 게시 중지하고 영향 계획을 재평가할까요?"
                >
                  게시 중지
                </ActionButton>
                <ActionButton
                  path={`admin/policies/${p.id}/rollback`}
                  confirmText="이전 승인 버전으로 되돌리고 영향 계획을 재평가할까요?"
                >
                  이전 버전으로
                </ActionButton>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section
        id="panel-operations"
        role="tabpanel"
        aria-labelledby="tab-operations"
        hidden={tab !== "operations"}
      >
        <section className="panel operation-panel">
          <h2>공식 자료 리서치</h2>
          <p>검색 결과는 근거 후보입니다. 원문과 적용 시점을 확인해야 합니다.</p>
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const r = await api<{ results: typeof search }>("admin/search", "POST", { query });
                setSearch(r.results);
                setNotice("");
              } catch (e) {
                setNotice((e as Error).message);
              }
            }}
          >
            <label className="sr-only" htmlFor="research-query">
              리서치 검색어
            </label>
            <input
              id="research-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={300}
              required
            />
            <button className="button secondary">
              <Search size={16} />
              자료 검색
            </button>
          </form>
          {search.map((r) => (
            <a
              className="search-result"
              key={r.url}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {r.title}
              <span>{r.officialCandidate ? "수집 허용 도메인" : "원문·공식성 확인 필요"}</span>
              <ExternalLink size={14} />
            </a>
          ))}
        </section>
        <section className="panel operation-panel">
          <h2>공식 출처 수집</h2>
          <p>
            수집은 기본적으로 꺼져 있습니다. 활성화 후에도 출처 본문 변경만 기록하고 규칙은 자동
            승인하지 않습니다.
          </p>
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await api("admin/sources", "POST", { title: f.get("title"), url: f.get("url") });
                setNotice("공식 출처를 등록했습니다.");
                router.refresh();
              } catch (e) {
                setNotice((e as Error).message);
              }
            }}
          >
            <label>
              출처 제목
              <input name="title" required maxLength={200} />
            </label>
            <label>
              공식 HTTPS 주소
              <input name="url" required type="url" />
            </label>
            <button className="button secondary">출처 등록</button>
          </form>
          {operations.sources.map((s) => (
            <p key={s.id}>
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.title}
              </a>
              {s.last_error && <span className="error-inline"> · 수집 상태 확인 필요</span>}
            </p>
          ))}
          <div className="inline-actions">
            <ActionButton path="admin/jobs" body={{ kind: "collect" }}>
              <RefreshCw size={16} />
              등록 출처 수집
            </ActionButton>
            <ActionButton path="admin/jobs" body={{ kind: "notifications" }}>
              예약 알림 처리
            </ActionButton>
          </div>
        </section>
        <section className="panel operation-panel">
          <h2>감지한 원문 변경</h2>
          {operations.changes.length ? (
            operations.changes.map((c) => (
              <div className="source-change" key={c.id}>
                <p>
                  <a href={c.url} target="_blank" rel="noopener noreferrer">
                    {c.title}
                  </a>{" "}
                  · {c.status}
                </p>
                <button
                  className="button secondary"
                  onClick={async () => {
                    try {
                      const r = await api<{ suggestion: unknown }>("admin/draft", "POST", {
                        snapshotId: c.new_snapshot_id,
                      });
                      setDraftJson(JSON.stringify(r.suggestion, null, 2));
                      setTab("reviews");
                      setNotice(
                        "AI 제안을 불러왔습니다. 근거를 검토한 후 초안으로 등록하세요. 자동 게시되지 않습니다.",
                      );
                    } catch (e) {
                      setNotice((e as Error).message);
                    }
                  }}
                >
                  원문으로 AI 초안 제안
                </button>
              </div>
            ))
          ) : (
            <p>감지한 원문 변경이 없습니다.</p>
          )}
        </section>
        <section className="panel operation-panel">
          <h2>사용자 오류·의견</h2>
          {operations.feedback.length ? (
            operations.feedback.map((f) => (
              <div className="feedback-item" key={f.id}>
                <span className="badge">{f.status}</span>
                <p>{f.message}</p>
              </div>
            ))
          ) : (
            <p>접수된 의견이 없습니다.</p>
          )}
        </section>
        <section className="panel operation-panel">
          <h2>최근 작업 기록</h2>
          {operations.jobs.length ? (
            operations.jobs.map((j) => (
              <div className="job-row" key={j.id}>
                <strong>{j.type}</strong>
                <span>{j.status}</span>
                <code>{JSON.stringify(j.summary)}</code>
              </div>
            ))
          ) : (
            <p>실행된 정기 작업이 없습니다.</p>
          )}
        </section>
      </section>
      <p className="notice-line" aria-live="polite">
        {notice}
      </p>
    </>
  );
}

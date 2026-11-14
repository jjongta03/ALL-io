"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/components/actions";
import type {
  OwnerProfile,
  WorkspaceBusiness,
  EmployeeDetails,
  RecurringDocument,
} from "@/domain/workspace";
import type { WorkspaceData, Business, Employee, Document } from "./types";
import { employmentTypes } from "./types";
import { Card, Field, ErrorText, ButtonLink, Heading, Dialog } from "./ui";

const blankOwner: OwnerProfile = { name: null, birthDate: null, phone: null, emailAlerts: false };
const blankBusiness: WorkspaceBusiness = {
  nickname: "내 사업장",
  industry: null,
  region: null,
  businessType: null,
  startedOn: null,
  revenueBand: null,
  pastBusinesses: [],
  pastBusinessHistoryConfirmed: false,
  rosterConfirmed: false,
  confirmedFacts: {},
};
const blankEmployee: EmployeeDetails = {
  name: "",
  employmentType: null,
  weeklyHours: null,
  hourlyWage: null,
  startedOn: null,
};
const text = (v: string) => v.trim() || null;
const number = (v: string) => (v === "" ? null : Number(v));
function cleanOwner(p: OwnerProfile | null | undefined): OwnerProfile {
  return p
    ? { name: p.name, birthDate: p.birthDate, phone: p.phone, emailAlerts: p.emailAlerts }
    : { ...blankOwner };
}

function OwnerFields({
  value,
  change,
  email,
  today,
}: {
  value: OwnerProfile;
  change: (v: OwnerProfile) => void;
  email: string;
  today: string;
}) {
  return (
    <>
      <h2>사장님 정보</h2>
      <div className="aio-fields">
        <Field label="이름">
          <input
            autoComplete="name"
            maxLength={80}
            placeholder="이름을 입력해 주세요"
            value={value.name ?? ""}
            onChange={(e) => change({ ...value, name: text(e.currentTarget.value) })}
          />
        </Field>
        <Field label="생년월일">
          <input
            type="date"
            max={today}
            value={value.birthDate ?? ""}
            onInput={(e) => change({ ...value, birthDate: text(e.currentTarget.value) })}
          />
        </Field>
        <Field label="휴대전화 (선택)">
          <input
            type="tel"
            autoComplete="tel"
            placeholder="010-0000-0000"
            value={value.phone ?? ""}
            onChange={(e) =>
              change({ ...value, phone: text(e.currentTarget.value.replace(/[^\d]/g, "")) })
            }
          />
        </Field>
        <Field label="알림 받을 이메일">
          <input type="email" value={email} readOnly />
        </Field>
      </div>
      <label className="aio-check">
        <input
          type="checkbox"
          checked={value.emailAlerts}
          onChange={(e) => change({ ...value, emailAlerts: e.target.checked })}
        />
        <span>새 혜택·신청 및 제출·프로젝트 기한 이메일 수신에 동의합니다.</span>
      </label>
    </>
  );
}
function BusinessFields({
  value,
  change,
}: {
  value: WorkspaceBusiness;
  change: (v: WorkspaceBusiness) => void;
}) {
  return (
    <>
      <h2>사업장 정보</h2>
      <div className="aio-fields">
        <Field label="사업장 이름">
          <input
            required
            maxLength={80}
            value={value.nickname}
            onChange={(e) => change({ ...value, nickname: e.currentTarget.value })}
          />
        </Field>
        <Field label="업종">
          <select
            value={value.industry ?? ""}
            onChange={(e) =>
              change({
                ...value,
                industry: (e.currentTarget.value as WorkspaceBusiness["industry"]) || null,
              })
            }
          >
            <option value="">아직 모름</option>
            <option value="RESTAURANT">음식점업</option>
            <option value="CAFE">카페</option>
            <option value="OTHER">기타</option>
          </select>
        </Field>
        <Field label="사업장 지역">
          <input
            placeholder="예: 서울특별시 강남구"
            value={value.region ?? ""}
            maxLength={200}
            onChange={(e) => change({ ...value, region: text(e.currentTarget.value) })}
          />
        </Field>
        <Field label="사업 형태">
          <select
            value={value.businessType ?? ""}
            onChange={(e) =>
              change({
                ...value,
                businessType: (e.currentTarget.value as WorkspaceBusiness["businessType"]) || null,
              })
            }
          >
            <option value="">아직 모름</option>
            <option value="SOLE">개인사업자</option>
            <option value="CORPORATE">법인사업자</option>
          </select>
        </Field>
        <Field label="사업 시작일">
          <input
            type="date"
            value={value.startedOn ?? ""}
            onInput={(e) => change({ ...value, startedOn: text(e.currentTarget.value) })}
          />
        </Field>
        <Field label="연 매출 규모">
          <select
            value={value.revenueBand ?? ""}
            onChange={(e) => change({ ...value, revenueBand: text(e.currentTarget.value) })}
          >
            <option value="">아직 모름</option>
            {["1억 미만", "1억~5억", "5억~10억", "10억~15억", "15억 이상"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
      </div>
    </>
  );
}
function HistoryFields({
  value,
  change,
}: {
  value: WorkspaceBusiness;
  change: (v: WorkspaceBusiness) => void;
}) {
  const emptyHistory: WorkspaceBusiness["pastBusinesses"][number] = {
    name: null,
    industry: null,
    startedOn: null,
    endedOn: null,
    outcome: null,
    memo: null,
  };
  const histories = value.pastBusinesses.length
    ? value.pastBusinesses
    : value.pastBusinessHistoryConfirmed
      ? []
      : [emptyHistory];
  const update = (index: number, key: string, v: string | null) =>
    change({
      ...value,
      pastBusinessHistoryConfirmed: false,
      pastBusinesses: histories.map((h, i) => (i === index ? { ...h, [key]: v } : h)),
    });
  return (
    <>
      <h2>지난 사업기록</h2>
      {histories.map((h, i) => (
        <div className="aio-history" key={i}>
          <div className="aio-fields">
            <Field label="이전 사업장">
              <input
                maxLength={200}
                value={h.name ?? ""}
                placeholder="예: 이전 카페"
                onChange={(e) => update(i, "name", text(e.currentTarget.value))}
              />
            </Field>
            <Field label="이전 업종">
              <input
                maxLength={200}
                value={h.industry ?? ""}
                onChange={(e) => update(i, "industry", text(e.currentTarget.value))}
              />
            </Field>
            <Field label="시작일">
              <input
                type="date"
                value={h.startedOn ?? ""}
                onInput={(e) => update(i, "startedOn", text(e.currentTarget.value))}
              />
            </Field>
            <Field label="종료일">
              <input
                type="date"
                min={h.startedOn ?? undefined}
                value={h.endedOn ?? ""}
                onInput={(e) => update(i, "endedOn", text(e.currentTarget.value))}
              />
            </Field>
            <Field label="종료 상태">
              <select
                value={h.outcome ?? ""}
                onChange={(e) => update(i, "outcome", text(e.currentTarget.value))}
              >
                <option value="">아직 모름</option>
                <option value="CLOSED">폐업</option>
                <option value="TRANSFERRED">양도</option>
                <option value="OTHER">기타</option>
              </select>
            </Field>
            <Field label="비고">
              <input
                value={h.memo ?? ""}
                maxLength={200}
                onChange={(e) => update(i, "memo", text(e.currentTarget.value))}
              />
            </Field>
          </div>
          <button
            className="aio-text-button"
            type="button"
            onClick={() =>
              change({
                ...value,
                pastBusinesses: value.pastBusinesses.filter((_, j) => j !== i),
                pastBusinessHistoryConfirmed: false,
              })
            }
          >
            이 기록 삭제
          </button>
        </div>
      ))}
      <button
        className="aio-button"
        type="button"
        disabled={value.pastBusinesses.length >= 30}
        onClick={() =>
          change({
            ...value,
            pastBusinessHistoryConfirmed: false,
            pastBusinesses: [
              ...value.pastBusinesses,
              {
                name: null,
                industry: null,
                startedOn: null,
                endedOn: null,
                outcome: null,
                memo: null,
              },
            ],
          })
        }
      >
        + 지난 사업기록 추가
      </button>
      <label className="aio-check">
        <input
          type="checkbox"
          checked={value.pastBusinessHistoryConfirmed}
          onChange={(e) => change({ ...value, pastBusinessHistoryConfirmed: e.target.checked })}
        />
        {value.pastBusinesses.length
          ? "입력한 지난 사업기록을 확인했습니다."
          : "지난 사업기록이 없습니다."}
      </label>
    </>
  );
}
export function Roster({ data, compact = false }: { data: WorkspaceData; compact?: boolean }) {
  const [extra, setExtra] = useState<Employee[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = [...data.roster.employees, ...extra];
  const remaining = data.roster.total - list.length;
  return (
    <Card>
      <h2>등록된 직원{compact ? ` · 총 ${data.roster.total}명` : ""}</h2>
      {!compact && <p className="aio-small">직원 이름을 눌러 저장된 정보를 확인해 주세요.</p>}
      {list.length ? (
        <div className="aio-roster">
          {list.map((e) => (
            <ButtonLink key={e.id} href={`/employees/${e.id}`}>
              {e.details.name} <span aria-hidden>›</span>
            </ButtonLink>
          ))}
        </div>
      ) : (
        <p>아직 등록된 직원이 없어요.</p>
      )}
      {remaining > 0 && (
        <button
          className="aio-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const r = await api<{ employees: Employee[] }>(
                `v2/businesses/${data.business!.id}/employees?offset=${list.length}&limit=8`,
                "GET",
              );
              setExtra([...extra, ...r.employees]);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "불러오는 중…" : `다른 직원 ${remaining}명 더 보기 ▾`}
        </button>
      )}
      {extra.length > 0 && (
        <button className="aio-text-button" onClick={() => setExtra([])}>
          접기 ▴
        </button>
      )}
      <ErrorText error={error} />
      {compact && <ButtonLink href="/employees">직원 전체 목록·등록</ButtonLink>}
    </Card>
  );
}
export function ProfileEditor({
  data,
  kind,
  onboarding = false,
  requestedStage,
}: {
  data: WorkspaceData;
  kind?: string;
  onboarding?: boolean;
  requestedStage?: number;
}) {
  const router = useRouter();
  const stage = requestedStage ?? data.draft?.stage ?? 1;
  const [owner, setOwner] = useState(
    cleanOwner(onboarding ? (data.draft?.owner ?? data.profile) : data.profile),
  );
  const [business, setBusiness] = useState<WorkspaceBusiness>(
    onboarding
      ? (data.draft?.business ?? data.business?.facts ?? { ...blankBusiness })
      : (data.business?.facts ?? { ...blankBusiness }),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = onboarding ? stage : kind === "owner" ? 1 : kind === "business" ? 2 : 3;
  const titles = [
    "사장님 정보를 입력해 주세요",
    "현재 사업장을 알려 주세요",
    "지난 사업기록을 입력해 주세요",
    "근로계약서로 직원을 등록해 주세요",
  ];
  const descriptions = [
    "기본 정보와 이메일 수신 정보를 먼저 입력합니다.",
    "현재 운영 중인 사업장의 업종·지역·사업 기간·매출을 입력합니다.",
    "이전 사업 경험이 없다면 ‘지난 사업기록이 없습니다’를 선택해 주세요.",
    "직원 정보를 확인·수정한 뒤 진단을 시작합니다. 직원 수는 명단에서 계산합니다.",
  ];
  async function save(direction: number) {
    setBusy(true);
    setError("");
    try {
      if (onboarding) {
        const next = Math.max(1, Math.min(4, stage + direction));
        await api("v2/onboarding", "PUT", { stage: next, owner, business });
        if (stage === 3 && direction === 1) {
          if (data.business) {
            await api(`v2/businesses/${data.business.id}`, "PUT", {
              facts: business,
              revision: data.business.revision,
            });
          } else await api("v2/businesses", "POST", business);
        }
        if (stage === 4 && direction === 1) {
          if (!data.business) throw new Error("먼저 사업장 정보를 저장해 주세요.");
          await api("v2/profile", "PUT", owner);
          const fresh = await api<Business>(`v2/businesses/${data.business.id}`, "GET");
          await api(`v2/businesses/${fresh.id}`, "PUT", {
            facts: { ...fresh.facts, rosterConfirmed: true },
            revision: fresh.revision,
          });
          router.push("/dashboard");
          router.refresh();
          return;
        }
        router.push(`/onboarding/${next}`);
        router.refresh();
      } else {
        if (current === 1) await api("v2/profile", "PUT", owner);
        else if (data.business)
          await api(`v2/businesses/${data.business.id}`, "PUT", {
            facts: business,
            revision: data.business.revision,
          });
        router.push("/mypage");
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="aio-editor">
      {onboarding && (
        <ol className="aio-steps" aria-label="최초 진단 단계">
          {["사장님 정보", "사업장 정보", "지난 사업기록", "직원 정보"].map((label, i) => (
            <li
              className={i + 1 <= stage ? "current" : ""}
              aria-current={i + 1 === stage ? "step" : undefined}
              key={label}
            >
              {i + 1} &nbsp;{label}
            </li>
          ))}
        </ol>
      )}
      <Heading
        title={
          onboarding
            ? titles[current - 1]
            : `${current === 1 ? "사장님 정보" : current === 2 ? "사업장 정보" : "지난 사업기록"} 수정`
        }
        description={onboarding ? descriptions[current - 1] : undefined}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(1);
        }}
      >
        <fieldset disabled={busy} className="aio-fieldset">
          {current < 4 ? (
            <Card className="aio-form-card">
              {current === 1 ? (
                <OwnerFields
                  value={owner}
                  change={setOwner}
                  email={data.email}
                  today={data.today}
                />
              ) : current === 2 ? (
                <BusinessFields value={business} change={setBusiness} />
              ) : (
                <HistoryFields value={business} change={setBusiness} />
              )}
            </Card>
          ) : data.business ? (
            <>
              <div className="aio-two">
                <Card>
                  <h2>근로계약서로 직원 등록</h2>
                  <p>근로계약서에서 이름·근로 형태·주당 근로시간·시급을 확인해요.</p>
                  <ButtonLink href="/contracts/new">근로계약서 스캔하기</ButtonLink>
                  <p className="aio-small">
                    스캔 결과는 틀릴 수 있어요. 내용을 확인·수정한 뒤 저장해 주세요.
                  </p>
                  <ButtonLink href="/employees/new">직접 입력하기</ButtonLink>
                </Card>
                <Roster data={data} />
              </div>
              <p className="aio-small">
                ‘내 사업장 진단하기’를 누르면 현재 직원 명단을 확정합니다. 직원이 없다면 0명으로
                확인됩니다.
              </p>
            </>
          ) : (
            <Card>
              <h2>사업장 정보를 먼저 저장해 주세요.</h2>
              <ButtonLink href="/onboarding/2">사업장 정보 입력</ButtonLink>
            </Card>
          )}
          <ErrorText error={error} />
          <div className="aio-step-footer">
            <div>
              {onboarding && stage > 1 ? (
                <button type="button" className="aio-button" onClick={() => void save(-1)}>
                  이전
                </button>
              ) : !onboarding ? (
                <ButtonLink href="/mypage">취소</ButtonLink>
              ) : null}
              <span>
                {onboarding
                  ? `${stage} / 4 단계 · 입력 내용은 이전·다음 이동 시 유지됩니다.`
                  : "저장하면 현재 정보를 기준으로 다시 진단합니다."}
              </span>
              <button
                className="aio-button is-primary"
                type="submit"
                disabled={busy || (current === 4 && !data.business)}
              >
                {busy
                  ? "저장 중…"
                  : onboarding
                    ? stage === 4
                      ? "내 사업장 진단하기"
                      : "다음"
                    : "저장하고 마이페이지로"}
              </button>
            </div>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
export function EmployeeForm({ data }: { data: WorkspaceData }) {
  const router = useRouter();
  const employee = data.employee;
  const scan = data.scan;
  const [value, setValue] = useState<EmployeeDetails>({
    ...blankEmployee,
    ...employee?.details,
    ...scan?.draft,
    name: employee?.details.name ?? scan?.draft.name ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const back = data.business?.facts.rosterConfirmed ? "/employees" : "/onboarding/4";
  return (
    <>
      <Heading
        title={scan ? "직원 정보 확인·수정" : employee ? "직원 정보 편집" : "직원 직접 등록"}
        description={
          scan
            ? "인식 결과를 확인해 주세요. 모르는 항목은 비워 두고 확인한 정보만 저장합니다."
            : "직원의 현재 근로 정보를 입력해 주세요."
        }
        back={{ href: back, label: "직원 목록" }}
      />
      <div className={scan ? "aio-asymmetric" : "aio-centered"}>
        <form
          className="aio-card"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              if (scan) await api(`v2/scans/${scan.id}/confirm`, "POST", value);
              else if (employee)
                await api(`v2/employees/${employee.id}`, "PUT", {
                  revision: employee.revision,
                  details: value,
                });
              else await api(`v2/businesses/${data.business!.id}/employees`, "POST", value);
              router.push(back);
              router.refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>{employee?.details.name ?? "직원 정보"}</h2>
          <Field label="직원 이름">
            <input
              required
              maxLength={80}
              value={value.name}
              onChange={(e) => setValue({ ...value, name: e.currentTarget.value })}
            />
          </Field>
          <Field label="근로 형태">
            <select
              value={value.employmentType ?? ""}
              onChange={(e) =>
                setValue({
                  ...value,
                  employmentType:
                    (e.currentTarget.value as EmployeeDetails["employmentType"]) || null,
                })
              }
            >
              <option value="">아직 모름</option>
              {Object.entries(employmentTypes).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="주당 근로시간">
            <input
              type="number"
              min={0}
              max={168}
              step="0.5"
              placeholder="예: 20"
              value={value.weeklyHours ?? ""}
              onChange={(e) => setValue({ ...value, weeklyHours: number(e.currentTarget.value) })}
            />
          </Field>
          <Field label="시급 (원)">
            <input
              type="number"
              min={0}
              max={100000000}
              step={1}
              placeholder="예: 12000"
              value={value.hourlyWage ?? ""}
              onChange={(e) => setValue({ ...value, hourlyWage: number(e.currentTarget.value) })}
            />
          </Field>
          <Field label="입사일">
            <input
              type="date"
              value={value.startedOn ?? ""}
              onInput={(e) => setValue({ ...value, startedOn: text(e.currentTarget.value) })}
            />
          </Field>
          <p className="aio-small">모르는 항목은 비워 두세요. 월급을 시급으로 추정하지 않습니다.</p>
          <ErrorText error={error} />
          <button className="aio-button is-primary" disabled={busy}>
            {busy ? "저장 중…" : scan ? "확인하고 직원 등록" : "수정 내용 저장"}
          </button>
        </form>
        {scan && (
          <Card>
            <h2>스캔한 근로계약서</h2>
            {scan.status === "MANUAL_REQUIRED" && (
              <p role="status">
                자동 인식을 사용할 수 없어 직접 입력이 필요해요. 원문을 보며 내용을 확인해 주세요.
              </p>
            )}
            <a
              className="aio-button"
              href={`/api/v2/scans/${scan.id}/document`}
              target="_blank"
              rel="noopener noreferrer"
            >
              계약서 원문 보기
            </a>
            <p className="aio-small">저장한 이름이 직원 목록에 반영됩니다.</p>
          </Card>
        )}
      </div>
    </>
  );
}
export function ContractUpload({ data }: { data: WorkspaceData }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <Heading
        title="근로계약서 스캔"
        description="파일을 추가하거나 촬영한 근로계약서를 선택해 주세요."
        back={{
          href: data.business?.facts.rosterConfirmed ? "/employees" : "/onboarding/4",
          label: "직원 등록",
        }}
      />
      <div className="aio-centered">
        <form
          className="aio-card"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              if (file.size > 8 * 1024 * 1024) throw new Error("8MB 이하의 파일을 선택해 주세요.");
              const form = new FormData();
              form.append("file", file);
              const response = await fetch(`/api/v2/businesses/${data.business!.id}/scans`, {
                method: "POST",
                body: form,
              });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error || "계약서를 읽지 못했습니다.");
              router.push(`/contracts/${result.id}`);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>스캔할 근로계약서</h2>
          <Field label="계약서 파일 선택">
            <input
              type="file"
              required
              accept="application/pdf,image/png,image/jpeg"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError("");
              }}
            />
          </Field>
          <p className="aio-small">PDF·PNG·JPEG · 최대 8MB</p>
          <p>
            스캔 중에는 직원 정보가 저장되지 않습니다.
            <br />
            인식 완료 후 결과를 확인·수정할 수 있어요.
          </p>
          <ErrorText error={error} />
          <button className="aio-button is-primary" disabled={!file || busy}>
            {busy ? "계약서 확인 중…" : "스캔 결과 확인"}
          </button>
        </form>
        <Card>
          <h2>직접 입력</h2>
          <p>파일이 없거나 인식이 어려워도 직원을 등록할 수 있어요.</p>
          <ButtonLink href="/employees/new">직접 입력하기</ButtonLink>
        </Card>
      </div>
    </>
  );
}
export function DeleteEmployee({ employee, back }: { employee: Employee; back: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <>
      <button className="aio-button is-danger-soft" onClick={() => setOpen(true)}>
        퇴사하기
      </button>
      {open && (
        <Dialog
          title={`${employee.details.name} 님을 퇴사 처리할까요?`}
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <p>
            확인하면 직원 목록에서 사라집니다.
            <br />
            해당 직원의 모든 정보와 연결된 근로계약서가 삭제됩니다.
          </p>
          <p className="aio-danger-text">
            삭제한 정보는 복구할 수 없습니다. 실제 퇴사가 맞는지 확인해 주세요.
          </p>
          <ErrorText error={error} />
          <button className="aio-button" disabled={busy} onClick={() => setOpen(false)} autoFocus>
            취소 · 돌아가기
          </button>
          <button
            className="aio-button is-danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api(`v2/employees/${employee.id}`, "DELETE", {
                  revision: employee.revision,
                  confirm: true,
                });
                setOpen(false);
                router.push(back);
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "처리 중…" : "확인 · 퇴사 처리 및 정보 삭제"}
          </button>
        </Dialog>
      )}
    </>
  );
}
export function DocumentEditor({
  business,
  document,
  today,
  onClose,
}: {
  business: Business;
  document?: Document;
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [value, setValue] = useState<RecurringDocument>(
    document
      ? {
          title: document.title,
          anchorDate: document.anchor_date,
          frequency: document.frequency,
          leadDays: document.lead_days,
          url: document.url,
          memo: document.memo,
          enabled: document.enabled,
        }
      : {
          title: "",
          anchorDate: today,
          frequency: "MONTHLY",
          leadDays: 3,
          url: null,
          memo: null,
          enabled: true,
        },
  );
  return (
    <Dialog title={document ? "반복 서류 수정" : "반복 서류 등록"} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api(
              document ? `v2/documents/${document.id}` : `v2/businesses/${business.id}/documents`,
              document ? "PUT" : "POST",
              value,
            );
            router.refresh();
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="서류·업무 이름">
          <input
            required
            maxLength={150}
            value={value.title}
            onChange={(e) => setValue({ ...value, title: e.currentTarget.value })}
          />
        </Field>
        <div className="aio-fields">
          <Field label="기준일">
            <input
              type="date"
              required
              value={value.anchorDate}
              onInput={(e) => setValue({ ...value, anchorDate: e.currentTarget.value })}
            />
          </Field>
          <Field label="반복 주기">
            <select
              value={value.frequency}
              onChange={(e) =>
                setValue({
                  ...value,
                  frequency: e.currentTarget.value as RecurringDocument["frequency"],
                })
              }
            >
              <option value="WEEKLY">매주</option>
              <option value="MONTHLY">매월</option>
              <option value="YEARLY">매년</option>
            </select>
          </Field>
          <Field label="사전 알림 (일)">
            <input
              type="number"
              min={0}
              max={30}
              required
              value={value.leadDays}
              onChange={(e) => setValue({ ...value, leadDays: Number(e.currentTarget.value) })}
            />
          </Field>
          <Field label="제출 사이트 (선택)">
            <input
              type="url"
              placeholder="https://"
              value={value.url ?? ""}
              onChange={(e) => setValue({ ...value, url: text(e.currentTarget.value) })}
            />
          </Field>
        </div>
        <Field label="준비 서류·메모">
          <textarea
            maxLength={2000}
            value={value.memo ?? ""}
            onChange={(e) => setValue({ ...value, memo: text(e.currentTarget.value) })}
          />
        </Field>
        <label className="aio-check">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => setValue({ ...value, enabled: e.target.checked })}
          />
          반복 일정 사용
        </label>
        <ErrorText error={error} />
        <div className="aio-actions">
          <button type="button" className="aio-button" onClick={onClose}>
            취소
          </button>
          <button className="aio-button is-primary" disabled={busy}>
            {busy ? "저장 중…" : "저장하기"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

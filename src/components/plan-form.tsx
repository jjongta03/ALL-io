"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, WandSparkles } from "lucide-react";
import { type BusinessInput, type HireInput } from "@/domain/contracts";
import { addDays, seoulDate } from "@/domain/dates";
import { api } from "./actions";
import { BusinessLookup } from "./business-lookup";

const emptyBusiness: BusinessInput = {
  nickname: "",
  industry: "CAFE",
  region: "경기 안산시",
  businessType: "SOLE",
  currentHeadcount: 4,
  existingBenefit: "UNKNOWN",
};
export function sampleHire(): HireInput {
  return {
    startDate: addDays(seoulDate(), 14),
    employmentType: "REGULAR",
    monthlyAveragePay: 2450000,
    insuranceHeadcount: null,
    historyRequirementMet: null,
    exclusionClear: null,
    durationRemaining: null,
    hoursRequirementMet: null,
    coverageConfirmed: null,
    laborCountConfirmed: null,
  };
}
function TriSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <label>
      {label}
      <select
        value={value === null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value === "true")}
      >
        <option value="">모름 · 아직 확인하지 않음</option>
        <option value="true">요건 충족 확인</option>
        <option value="false">요건 미충족 확인</option>
      </select>
    </label>
  );
}
export function PlanForm({
  initialBusiness,
  initialHire,
  planId,
  demo,
  ntsEnabled = false,
}: {
  initialBusiness?: BusinessInput;
  initialHire?: HireInput;
  planId?: string;
  demo: boolean;
  ntsEnabled?: boolean;
}) {
  const [business, setBusiness] = useState(initialBusiness ?? emptyBusiness),
    [hire, setHire] = useState(initialHire ?? sampleHire());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();
  const updateBusiness = <K extends keyof BusinessInput>(key: K, value: BusinessInput[K]) =>
    setBusiness((s) => ({ ...s, [key]: value }));
  const updateHire = <K extends keyof HireInput>(key: K, value: HireInput[K]) =>
    setHire((s) => ({ ...s, [key]: value }));
  return (
    <form
      className="plan-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          if (planId) {
            await api(`plans/${planId}`, "PATCH", hire);
            router.push(`/plans/${planId}`);
          } else {
            const result = await api<{ id: string }>("plans", "POST", { business, hire });
            router.push(`/plans/${result.id}`);
          }
          router.refresh();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {demo && (
        <div className="demo-fill">
          <p>입력 흐름을 빠르게 확인하려면 예시를 사용하세요.</p>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setBusiness({ ...emptyBusiness, nickname: "다음 카페 · 가상 사업장" });
              setHire({
                ...sampleHire(),
                insuranceHeadcount: 5,
                historyRequirementMet: true,
                exclusionClear: true,
                durationRemaining: true,
                hoursRequirementMet: true,
                coverageConfirmed: true,
                laborCountConfirmed: null,
              });
            }}
          >
            <WandSparkles size={16} />
            예시 조건 채우기
          </button>
        </div>
      )}
      {!planId && (
        <section className="panel form-section">
          <div className="section-heading">
            <span className="step">01</span>
            <div>
              <h2>지금의 가게</h2>
              <p>현재 상태는 채용 계획과 별도로 보관합니다.</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              가게 별칭
              <input
                value={business.nickname}
                onChange={(e) => updateBusiness("nickname", e.target.value)}
                maxLength={80}
                placeholder="예: 다음 카페"
                required
              />
            </label>
            <label>
              업종
              <select
                value={business.industry}
                onChange={(e) =>
                  updateBusiness("industry", e.target.value as BusinessInput["industry"])
                }
              >
                <option value="CAFE">카페</option>
                <option value="RESTAURANT">음식점</option>
                <option value="OTHER">기타 · 상세 판정 범위 밖</option>
              </select>
            </label>
            <label>
              소재지
              <input
                value={business.region}
                onChange={(e) => updateBusiness("region", e.target.value)}
                maxLength={80}
                required
              />
            </label>
            <label>
              현재 직원 수
              <input
                type="number"
                min={0}
                max={1000}
                step={1}
                value={business.currentHeadcount}
                onChange={(e) => updateBusiness("currentHeadcount", Number(e.target.value))}
                required
              />
            </label>
            <label>
              사업 형태
              <select
                value={business.businessType}
                onChange={(e) =>
                  updateBusiness("businessType", e.target.value as BusinessInput["businessType"])
                }
              >
                <option value="SOLE">개인사업자</option>
                <option value="CORPORATE">법인 · 상세 판정 범위 밖</option>
              </select>
            </label>
            <label>
              기존 지원 수혜 여부
              <select
                value={business.existingBenefit}
                onChange={(e) =>
                  updateBusiness(
                    "existingBenefit",
                    e.target.value as BusinessInput["existingBenefit"],
                  )
                }
              >
                <option value="UNKNOWN">모름</option>
                <option value="YES">받고 있음</option>
                <option value="NO">받지 않음</option>
              </select>
            </label>
          </div>
          <BusinessLookup enabled={ntsEnabled} />
        </section>
      )}
      <section className="panel form-section">
        <div className="section-heading">
          <span className="step">02</span>
          <div>
            <h2>직원 한 명 채용</h2>
            <p>계획을 저장해도 현재 직원 수는 바뀌지 않습니다.</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            입사 예정일
            <input
              type="date"
              value={hire.startDate}
              onChange={(e) => updateHire("startDate", e.target.value)}
              required
            />
          </label>
          <label>
            고용 형태
            <select
              value={hire.employmentType}
              onChange={(e) =>
                updateHire("employmentType", e.target.value as HireInput["employmentType"])
              }
            >
              <option value="REGULAR">상용근로자</option>
              <option value="DAILY">일용근로자 · 상세 판정 범위 밖</option>
              <option value="OTHER">기타 · 상세 판정 범위 밖</option>
            </select>
          </label>
          <label>
            예상 월평균보수 (원)
            <input
              type="number"
              min={0}
              max={1000000000}
              step={1}
              value={hire.monthlyAveragePay ?? ""}
              onChange={(e) =>
                updateHire(
                  "monthlyAveragePay",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
              placeholder="모르면 비워두세요"
            />
            <small>실수령액과 구별되는 기준입니다. 모르는 값은 비워두세요.</small>
          </label>
          <label>
            해당 보험 기준 산정 인원
            <input
              type="number"
              min={0}
              max={1000}
              step={1}
              value={hire.insuranceHeadcount ?? ""}
              onChange={(e) =>
                updateHire(
                  "insuranceHeadcount",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
              placeholder="모르면 비워두세요"
            />
            <small>현재 직원 수를 자동으로 대입하지 않습니다.</small>
          </label>
        </div>
      </section>
      <section className="panel form-section">
        <div className="section-heading">
          <span className="step">03</span>
          <div>
            <h2>확인한 조건만 선택하세요</h2>
            <p>처음에는 모두 ‘모름’이어도 됩니다. 저장 후 다시 보완할 수 있습니다.</p>
          </div>
        </div>
        <div className="form-grid">
          <TriSelect
            label="해당 보험의 가입 이력 요건"
            value={hire.historyRequirementMet}
            onChange={(v) => updateHire("historyRequirementMet", v)}
          />
          <TriSelect
            label="소득·재산 등 제외 사유 없음"
            value={hire.exclusionClear}
            onChange={(v) => updateHire("exclusionClear", v)}
          />
          <TriSelect
            label="지원기간 잔여 요건"
            value={hire.durationRemaining}
            onChange={(v) => updateHire("durationRemaining", v)}
          />
          <TriSelect
            label="근로시간 등 가입 요건"
            value={hire.hoursRequirementMet}
            onChange={(v) => updateHire("hoursRequirementMet", v)}
          />
          <TriSelect
            label="보험별 가입 대상"
            value={hire.coverageConfirmed}
            onChange={(v) => updateHire("coverageConfirmed", v)}
          />
          <TriSelect
            label="상시근로자 산정 자료"
            value={hire.laborCountConfirmed}
            onChange={(v) => updateHire("laborCountConfirmed", v)}
          />
        </div>
        <details className="insurance-details">
          <summary>고용보험·국민연금 확인값을 따로 입력하기</summary>
          <p className="small-note">
            두 보험의 기준을 확인한 경우에만 각각 입력하세요. 위 가상 규칙 입력값을 복사하지
            않습니다.
          </p>
          <div className="form-grid">
            <label>
              고용보험 기준 산정 인원
              <input
                type="number"
                min={0}
                max={1000}
                value={hire.employmentHeadcount ?? ""}
                onChange={(e) =>
                  updateHire(
                    "employmentHeadcount",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
                placeholder="모르면 비워두세요"
              />
            </label>
            <label>
              국민연금 기준 산정 인원
              <input
                type="number"
                min={0}
                max={1000}
                value={hire.pensionHeadcount ?? ""}
                onChange={(e) =>
                  updateHire(
                    "pensionHeadcount",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
                placeholder="모르면 비워두세요"
              />
            </label>
            <TriSelect
              label="고용보험 가입 이력 요건"
              value={hire.employmentHistoryRequirementMet ?? null}
              onChange={(v) => updateHire("employmentHistoryRequirementMet", v)}
            />
            <TriSelect
              label="국민연금 가입 이력 요건"
              value={hire.pensionHistoryRequirementMet ?? null}
              onChange={(v) => updateHire("pensionHistoryRequirementMet", v)}
            />
          </div>
        </details>
      </section>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <div className="form-footer">
        <p>판정 근거와 추가 확인 사항을 결과에서 확인할 수 있습니다.</p>
        <button className="button primary large" disabled={busy}>
          {busy
            ? "조건을 확인하고 있습니다…"
            : planId
              ? "조건 보완하고 다시 확인"
              : "변화 확인하고 계획 저장"}
          <ArrowRight size={18} />
        </button>
      </div>
    </form>
  );
}

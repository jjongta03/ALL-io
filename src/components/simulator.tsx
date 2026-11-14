"use client";
import { useState } from "react";
import { Minus, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { BusinessInput, HireInput, PolicyVersion } from "@/domain/contracts";
import { simulatePlan } from "@/domain/simulation";
import { statusLabel } from "./result-card";

export function Simulator({
  business,
  hire,
  policies,
  allowDemo,
}: {
  business: BusinessInput;
  hire: HireInput;
  policies: PolicyVersion[];
  allowDemo: boolean;
}) {
  const original = {
    currentHeadcount: business.currentHeadcount,
    monthlyAveragePay: hire.monthlyAveragePay,
    insuranceHeadcount: hire.insuranceHeadcount,
    employmentHeadcount: hire.employmentHeadcount ?? null,
    pensionHeadcount: hire.pensionHeadcount ?? null,
  };
  const [input, setInput] = useState(original);
  const simulation = simulatePlan(business, hire, policies, allowDemo, input);
  const changed = simulation.comparison.filter((r) => r.before !== r.after).length;
  const fields = [
    ["insuranceHeadcount", "데모 보험 기준 인원"],
    ["employmentHeadcount", "고용보험 산정 인원"],
    ["pensionHeadcount", "국민연금 산정 인원"],
  ] as const;
  return (
    <section className="panel simulator" aria-labelledby="simulator-title">
      <div className="simulator-heading">
        <div>
          <div className="eyebrow">WHAT IF · 미리 보기</div>
          <h2 id="simulator-title">
            <SlidersHorizontal size={20} /> 직원 수가 달라진다면?
          </h2>
          <p>현재 인원과 급여를 바꾸며 직원 한 명 채용 후의 결과를 비교하세요.</p>
        </div>
        <button className="button secondary" onClick={() => setInput(original)}>
          <RotateCcw size={15} />
          초기화
        </button>
      </div>
      <div className="simulation-controls">
        <div>
          <label htmlFor="sim-count">가정한 현재 직원 수</label>
          <div className="stepper">
            <button
              type="button"
              aria-label="직원 수 줄이기"
              disabled={input.currentHeadcount === 0}
              onClick={() => setInput({ ...input, currentHeadcount: input.currentHeadcount - 1 })}
            >
              <Minus size={18} />
            </button>
            <input
              id="sim-count"
              type="number"
              min={0}
              max={1000}
              value={input.currentHeadcount}
              onChange={(e) =>
                setInput({
                  ...input,
                  currentHeadcount: Math.max(
                    0,
                    Math.min(1000, Math.trunc(Number(e.target.value)) || 0),
                  ),
                })
              }
            />
            <button
              type="button"
              aria-label="직원 수 늘리기"
              disabled={input.currentHeadcount === 1000}
              onClick={() => setInput({ ...input, currentHeadcount: input.currentHeadcount + 1 })}
            >
              <Plus size={18} />
            </button>
          </div>
          <small>한 명 채용 후 {input.currentHeadcount + 1}명</small>
        </div>
        <label>
          예상 월평균보수 (원)
          <input
            type="number"
            min={0}
            max={1000000000}
            step={10000}
            value={input.monthlyAveragePay ?? ""}
            placeholder="모르면 비워두기"
            onChange={(e) =>
              setInput({
                ...input,
                monthlyAveragePay:
                  e.target.value === ""
                    ? null
                    : Math.max(0, Math.min(1000000000, Math.trunc(Number(e.target.value)))),
              })
            }
          />
        </label>
      </div>
      <details>
        <summary>보험별 산정 인원도 가정하기</summary>
        <p className="small-note">
          보험별 인원은 직원 수와 별도로 확인해야 합니다. 직원 수 버튼으로 함께 바뀌지 않습니다.
        </p>
        <div className="simulation-controls">
          {fields.map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min={0}
                max={1000}
                value={input[key] ?? ""}
                placeholder="모름"
                onChange={(e) =>
                  setInput({
                    ...input,
                    [key]:
                      e.target.value === ""
                        ? null
                        : Math.max(0, Math.min(1000, Math.trunc(Number(e.target.value)))),
                  })
                }
              />
            </label>
          ))}
        </div>
      </details>
      <p className="small-note">
        최신 게시 규칙으로 비교합니다. 시뮬레이션은 저장된 계획·체크리스트·알림을 변경하지 않습니다.
        {allowDemo && " 현재 규칙은 가상 데모입니다."}
      </p>
      <div aria-live="polite" aria-atomic="true" className="simulation-summary">
        저장된 조건 대비 결과 변화 {changed}개
      </div>
      <div className="simulation-results">
        {simulation.comparison.map((r) => {
          const changed = r.before !== r.after;
          const tone =
            changed && r.kind === "BENEFIT" && r.after === "MATCH"
              ? "positive"
              : changed && r.kind === "BENEFIT" && r.before === "MATCH" && r.after === "NO_MATCH"
                ? "negative"
                : changed
                  ? "attention"
                  : "";
          return (
            <article key={r.policyId} className={`simulation-row ${tone}`}>
              <strong>{r.title}</strong>
              <div>
                {changed ? (
                  <>
                    <span>{statusLabel[r.before]}</span>
                    <span aria-hidden="true"> → </span>
                    <b>
                      {tone === "positive" ? "+ " : tone === "negative" ? "− " : ""}
                      {statusLabel[r.after]}
                    </b>
                  </>
                ) : (
                  <span>{statusLabel[r.after]} · 변화 없음</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

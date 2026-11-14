import { ExternalLink, CircleHelp, CircleCheck, CircleAlert } from "lucide-react";
import { factsLabels, type RuleResult, type ResultStatus } from "@/domain/contracts";
export const statusLabel: Record<ResultStatus, string> = {
  MATCH: "입력 기준 조건 부합",
  NO_MATCH: "입력 기준 조건 불충족",
  NEEDS_INFO: "추가 확인 필요",
  REVIEW_REQUIRED: "최신 기준 확인 중",
  OUT_OF_SCOPE: "상세 판정 범위 밖",
};
export function ResultCard({ result }: { result: RuleResult }) {
  const Icon =
    result.status === "MATCH"
      ? CircleCheck
      : result.status === "NEEDS_INFO"
        ? CircleHelp
        : CircleAlert;
  return (
    <article className={`result-card status-${result.status}`}>
      <div className="result-top">
        <Icon size={20} />
        <span className="badge">{statusLabel[result.status]}</span>
      </div>
      <h3>{result.title}</h3>
      <p>{result.explanation}</p>
      {result.missingFields.length > 0 && (
        <div className="missing-list">
          <strong>더 확인할 정보</strong>
          <ul>
            {result.missingFields.map((f) => (
              <li key={f}>{factsLabels[f]}</li>
            ))}
          </ul>
        </div>
      )}
      <details>
        <summary>판정 근거와 버전 보기</summary>
        <div className="evidence">
          <p>
            규칙 v{result.version} ·{" "}
            {result.isDemo ? "가상 규칙 · 실제 제도 미검수" : "검수된 규칙"}
          </p>
          {result.sources.map((s) => (
            <div key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.title}
                <ExternalLink size={13} />
              </a>
              <p>{s.section}</p>
            </div>
          ))}
        </div>
      </details>
    </article>
  );
}

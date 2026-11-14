"use client";
import { useState } from "react";
import { api } from "./actions";
export function BusinessLookup({ enabled }: { enabled: boolean }) {
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <details className="business-lookup">
      <summary>사업자 상태 조회 (선택)</summary>
      <p className="small-note">
        계속·휴폐업 상태와 과세유형만 확인합니다. 번호는 계획에 저장하지 않으며, 지원 자격 판정에는
        쓰지 않습니다.
      </p>
      <div className="inline-form">
        <label>
          사업자등록번호
          <input
            inputMode="numeric"
            autoComplete="off"
            maxLength={12}
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/[^0-9-]/g, ""))}
            placeholder="숫자 10자리"
          />
        </label>
        <button
          type="button"
          className="button secondary"
          disabled={!enabled || busy || number.replaceAll("-", "").length !== 10}
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              const result = await api<{ status: string; taxType: string }>(
                "integrations/nts",
                "POST",
                { number: number.replaceAll("-", "") },
              );
              setMessage(`${result.status} · ${result.taxType} (본인 인증 아님)`);
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "조회 중…" : "국세청 상태 조회"}
        </button>
      </div>
      {!enabled && (
        <p className="small-note">
          현재는 조회가 꺼져 있습니다. 실제 연동과 국세청 키 설정이 필요합니다.
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}

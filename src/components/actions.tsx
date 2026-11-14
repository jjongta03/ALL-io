"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginDestination } from "@/domain/login";
import { LoaderCircle } from "lucide-react";
export function reconnectVisitor() {
  window.location.replace(
    `/start?next=${encodeURIComponent(loginDestination(window.location.pathname + window.location.search))}`,
  );
}

export async function api<T = { ok: boolean }>(
  path: string,
  method = "POST",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (response.status === 401 && path !== "session") {
    reconnectVisitor();
  }
  if (!response.ok)
    throw new Error(
      data.fields?.length
        ? `${data.error} ${data.fields.map((f: { path: string; message: string }) => `${f.path}: ${f.message}`).join(" / ")}`
        : data.error || "요청을 처리하지 못했습니다.",
    );
  return data;
}
export function ActionButton({
  children,
  path,
  method = "POST",
  body,
  href,
  className = "button secondary",
  confirmText,
  successMessage,
  replace = false,
}: {
  children: React.ReactNode;
  path: string;
  method?: string;
  body?: unknown;
  href?: string;
  className?: string;
  confirmText?: string;
  successMessage?: string;
  replace?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const router = useRouter();
  return (
    <div className="action-wrap">
      <button
        className={className}
        disabled={busy}
        onClick={async () => {
          if (confirmText && !window.confirm(confirmText)) return;
          setBusy(true);
          setError("");
          setSuccess("");
          try {
            await api(path, method, body);
            setSuccess(successMessage ?? "");
            if (href) {
              if (replace) router.replace(href);
              else router.push(href);
            }
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <LoaderCircle size={16} className="spin" /> : null}
        {children}
      </button>
      {error && (
        <p role="alert" className="error-inline">
          {error}
        </p>
      )}
      {success && (
        <p aria-live="polite" className="small-note">
          {success}
        </p>
      )}
    </div>
  );
}
export function FeedbackForm({ evaluationId }: { evaluationId: string }) {
  const [message, setMessage] = useState(""),
    [notice, setNotice] = useState("");
  return (
    <details className="feedback">
      <summary>정보가 다르거나 설명이 부족한가요?</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("feedback", "POST", { evaluationId, message });
            setNotice("의견을 받았습니다. 운영자가 해당 판정 버전과 함께 확인합니다.");
            setMessage("");
          } catch (e) {
            setNotice((e as Error).message);
          }
        }}
      >
        <label>
          확인이 필요한 내용
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            minLength={5}
            maxLength={2000}
            required
            rows={3}
            placeholder="어떤 안내를 확인하면 좋을지 알려주세요. 직원 실명 등 개인정보는 입력하지 마세요."
          />
        </label>
        <button className="button secondary">오류·의견 보내기</button>
        <p aria-live="polite">{notice}</p>
      </form>
    </details>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";

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
}: {
  children: React.ReactNode;
  path: string;
  method?: string;
  body?: unknown;
  href?: string;
  className?: string;
  confirmText?: string;
  successMessage?: string;
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
            if (href) router.push(href);
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
export function DemoStart() {
  return (
    <ActionButton path="demo" href="/dashboard" className="button primary large">
      로컬 데모 시작 <ArrowRight size={18} />
    </ActionButton>
  );
}
export function LoginForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form
      className="login-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          await api("session", "POST", { email: f.get("email"), password: f.get("password") });
          router.push("/dashboard");
          router.refresh();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        이메일
        <input name="email" type="email" required autoComplete="username" />
      </label>
      <label>
        비밀번호
        <input name="password" type="password" required autoComplete="current-password" />
      </label>
      <button className="button secondary" disabled={busy}>
        계정으로 로그인
      </button>
      {error && (
        <p className="error-inline" role="alert">
          {error}
        </p>
      )}
    </form>
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

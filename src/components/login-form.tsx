"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { loginDestination } from "@/domain/login";

export function LoginForm({ next }: { next: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [visible, setVisible] = useState(false);
  const router = useRouter();
  return (
    <form
      className="login-form"
      aria-busy={busy}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = new FormData(e.currentTarget);
        setError("");
        setBusy(true);
        try {
          const response = await fetch("/api/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
          });
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error || "로그인하지 못했습니다. 다시 시도해 주세요.");
          router.replace(loginDestination(next));
          router.refresh();
        } catch (e) {
          setError(
            e instanceof TypeError || e instanceof SyntaxError
              ? "연결을 확인한 뒤 다시 시도해 주세요."
              : e instanceof Error
                ? e.message
                : "로그인하지 못했습니다. 다시 시도해 주세요.",
          );
          setBusy(false);
        }
      }}
    >
      <label htmlFor="login-email">
        이메일
        <input
          id="login-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          placeholder="발급받은 이메일 주소"
          required
          maxLength={254}
          disabled={busy}
          onChange={() => setError("")}
          aria-describedby={error ? "login-error" : undefined}
        />
      </label>
      <label htmlFor="login-password">비밀번호</label>
      <div className="password-field">
        <input
          id="login-password"
          name="password"
          type={visible ? "text" : "password"}
          autoComplete="current-password"
          placeholder="비밀번호를 입력하세요"
          required
          maxLength={256}
          disabled={busy}
          onChange={() => setError("")}
          aria-describedby={error ? "login-error" : undefined}
        />
        <button
          type="button"
          className="password-visibility"
          aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
          disabled={busy}
        >
          {visible ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </div>
      {error && (
        <p id="login-error" className="error-inline" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button primary login-submit" disabled={busy}>
        {busy ? (
          <>
            <LoaderCircle size={18} className="spin" />
            로그인 중…
          </>
        ) : (
          <>
            로그인 <ArrowRight size={18} />
          </>
        )}
      </button>
      <p className="login-help">
        계정 발급이나 비밀번호 확인이 필요하면 서비스 관리자에게 문의해 주세요.
      </p>
    </form>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { loginDestination } from "@/domain/login";
export function VisitorEntry({ next }: { next: string }) {
  const router = useRouter(),
    task = useRef<Promise<void> | null>(null);
  const [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    task.current ??= (async () => {
      const response = await fetch("/api/visitor", { method: "POST" });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "접속 요청이 많습니다. 잠시 후 다시 시도해 주세요."
            : "화면을 준비하지 못했습니다. 다시 시도해 주세요.",
        );
      const check = await fetch("/api/me", { cache: "no-store" });
      if (!check.ok) throw new Error("브라우저에서 쿠키를 허용한 뒤 다시 시도해 주세요.");
    })();
    task.current
      .then(() => {
        if (active) {
          router.replace(loginDestination(next));
          router.refresh();
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof TypeError
              ? "연결을 확인한 뒤 다시 시도해 주세요."
              : e instanceof Error
                ? e.message
                : "화면을 준비하지 못했습니다.",
          );
      });
    return () => {
      active = false;
    };
  }, [next, router, attempt]);
  return (
    <section className="aio aio-card" aria-live="polite" aria-busy={!error}>
      <h1>내 사업장 화면을 준비하고 있어요</h1>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button
            type="button"
            className="aio-button is-primary"
            onClick={() => {
              task.current = null;
              setError("");
              setAttempt((n) => n + 1);
            }}
          >
            다시 시도하기
          </button>
        </>
      ) : (
        <p>
          <LoaderCircle size={20} className="spin" /> 잠시만 기다려 주세요.
        </p>
      )}
      <noscript>화면을 시작하려면 브라우저에서 JavaScript와 쿠키를 허용해 주세요.</noscript>
    </section>
  );
}

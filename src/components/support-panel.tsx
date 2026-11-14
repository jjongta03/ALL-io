"use client";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { api } from "./actions";
export function SupportPanel({ planId }: { planId: string }) {
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const command = async (command: string) => {
    setBusy(true);
    try {
      const result = await api<{ answer: string; escalated: boolean }>("support", "POST", {
        planId,
        command,
        message,
      });
      setAnswer(result.answer);
    } catch (e) {
      setAnswer((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel support-panel">
      <h2>
        <MessageCircle size={20} /> 궁금한 점 확인하기
      </h2>
      <p>저장된 결과와 서류를 바로 확인하고, 답이 없는 질문은 운영자에게 접수하세요.</p>
      <div className="inline-actions">
        <button className="button secondary" disabled={busy} onClick={() => command("/혜택조회")}>
          /혜택조회
        </button>
        <button className="button secondary" disabled={busy} onClick={() => command("/서류안내")}>
          /서류안내
        </button>
      </div>
      <label>
        질문 또는 오류 내용
        <textarea
          value={message}
          maxLength={2000}
          rows={3}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="어떤 부분이 궁금하거나 다르게 보이는지 적어주세요."
        />
      </label>
      <div className="inline-actions">
        <button
          className="button secondary"
          disabled={busy || message.trim().length < 5}
          onClick={() => command("/질문")}
        >
          질문 접수
        </button>
        <button
          className="button secondary"
          disabled={busy || message.trim().length < 5}
          onClick={() => command("/오류신고")}
        >
          /오류신고
        </button>
      </div>
      {answer && (
        <p className="support-answer" role="status">
          {answer}
        </p>
      )}
    </section>
  );
}

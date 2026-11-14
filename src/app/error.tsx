"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="aio aio-card">
      <h1>화면을 불러오지 못했습니다.</h1>
      <p>잠시 후 다시 시도해 주세요. 입력한 내용과 연결 상태도 확인해 주세요.</p>
      <button className="aio-button is-primary" onClick={reset}>
        다시 시도
      </button>
    </div>
  );
}

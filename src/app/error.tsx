"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <h1>화면을 불러오지 못했습니다.</h1>
      <p>처음 실행이라면 터미널에서 npm run setup을 실행하고 다시 시도하세요.</p>
      <button className="button primary" onClick={reset}>
        다시 시도
      </button>
    </div>
  );
}

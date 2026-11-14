import Link from "next/link";
export default function NotFound() {
  return (
    <div className="aio aio-card">
      <h1>화면을 찾을 수 없습니다.</h1>
      <p>접근 가능한 기록인지 확인해 주세요.</p>
      <Link href="/dashboard" className="aio-button is-primary">
        대시보드로 돌아가기
      </Link>
    </div>
  );
}

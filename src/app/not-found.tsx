import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>계획을 찾을 수 없습니다.</h1>
      <p>접근 가능한 기록인지 확인해 주세요.</p>
      <Link href="/dashboard" className="button primary">
        내 계획으로
      </Link>
    </div>
  );
}

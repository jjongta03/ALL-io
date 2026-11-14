import { Mail, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { pageUser } from "@/server/page-auth";
import { getDb } from "@/server/db";
export default async function Outbox() {
  const user = await pageUser(false, "/outbox");
  const mail = await (
    await getDb()
  ).query<{ id: string; subject: string; body: string; created_at: Date; plan_id: string }>(
    "SELECT o.*,j.plan_id FROM outbox o JOIN notification_jobs j ON j.id=o.notification_id JOIN change_plans p ON p.id=j.plan_id WHERE p.owner_id=$1 ORDER BY o.created_at DESC LIMIT 50",
    [user.id],
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">NOTIFICATIONS</div>
          <h1>알림 보관함</h1>
          <p>로컬 테스트 알림을 확인하는 공간입니다. 실제 이메일 수신함과 구분됩니다.</p>
        </div>
      </div>
      {mail.length ? (
        <div className="mail-list">
          {mail.map((m) => (
            <article className="panel mail-card" key={m.id}>
              <span className="badge">외부 발송 없음 · 로컬 보관</span>
              <h2>
                <Mail size={19} />
                {m.subject}
              </h2>
              <pre>{m.body}</pre>
              <Link href={`/plans/${m.plan_id}`}>
                연결된 계획 열기 <ArrowUpRight size={15} />
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <section className="empty-state">
          <Mail size={32} />
          <h2>아직 보관된 알림이 없습니다.</h2>
          <p>계획에서 알림을 켜고 ‘로컬 테스트 알림 생성’을 눌러 흐름을 확인하세요.</p>
          <Link href="/dashboard" className="button secondary">
            내 계획 보기
          </Link>
        </section>
      )}
    </>
  );
}

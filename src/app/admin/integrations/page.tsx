import { pageUser } from "@/server/page-auth";
import { getDb } from "@/server/db";
import { integrationStatus } from "@/server/integration-status";
export default async function IntegrationsPage() {
  await pageUser(true);
  const status = await integrationStatus(await getDb());
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">API MAP</div>
          <h1>어떤 API가 어디에서 쓰이나요?</h1>
          <p>기능 연결 상태와 이 버전부터 기록한 서버 호출 결과를 함께 확인합니다.</p>
        </div>
        <span className="badge">외부 연동 {status.live ? "허용" : "꺼짐"}</span>
      </div>
      <div className="integration-grid">
        {status.items.map((item) => {
          const calls = item.events
            .filter((e) => e.mode === "LIVE" && e.status !== "DISABLED")
            .reduce((n, e) => n + e.count, 0);
          return (
            <article className="panel integration-card" key={item.operation}>
              <div className="inline-actions">
                <span className="badge">{item.provider}</span>
                <span className="badge">
                  {item.configured && item.enabled ? "설정 준비됨" : "미활성"}
                </span>
              </div>
              <h2>{item.title}</h2>
              <p>{item.note}</p>
              <dl>
                <dt>사용 위치</dt>
                <dd>{item.where}</dd>
                <dt>앱 API</dt>
                <dd>
                  <code>{item.endpoint}</code>
                </dd>
                <dt>구현 파일</dt>
                <dd>
                  <code>{item.file}</code>
                </dd>
                <dt>호출 기록</dt>
                <dd>
                  외부 요청 시도 {calls}회 · 로컬/비활성{" "}
                  {item.events.filter((e) => e.mode === "LOCAL").reduce((n, e) => n + e.count, 0)}회
                </dd>
              </dl>
            </article>
          );
        })}
        <article className="panel integration-card">
          <span className="badge muted">후속 범위</span>
          <h2>아직 연결하지 않은 API</h2>
          <p>
            Alt 인터뷰·전사 수집, Liner Search Agent·Deep Research, EXAONE 설명, VAPI 전화는
            미구현입니다. 실제 호출이나 데이터 수집은 하지 않습니다.
          </p>
        </article>
      </div>
    </>
  );
}

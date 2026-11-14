import { pageUser } from "@/server/page-auth";
import { getDb } from "@/server/db";
import { listReviews } from "@/server/service";
import { AdminConsole } from "@/components/admin-console";
export default async function Admin() {
  await pageUser(true);
  const db = await getDb();
  const reviews = await listReviews(db);
  const operations = {
    policies: await db.query(
      "SELECT p.id,p.title,v.version,v.status,v.is_demo FROM policies p LEFT JOIN policy_versions v ON v.id=p.active_version_id ORDER BY p.title",
    ),
    jobs: await db.query(
      "SELECT id,type,status,summary FROM job_runs ORDER BY created_at DESC LIMIT 20",
    ),
    feedback: await db.query(
      "SELECT id,message,status FROM feedback ORDER BY created_at DESC LIMIT 30",
    ),
    sources: await db.query("SELECT id,title,url,last_error FROM sources ORDER BY title"),
    changes: await db.query(
      "SELECT c.id,c.status,c.new_snapshot_id,s.title,s.url FROM source_changes c JOIN sources s ON s.id=c.source_id ORDER BY c.created_at DESC LIMIT 20",
    ),
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">REVIEW DESK</div>
          <h1>근거를 확인하고, 변화를 반영합니다.</h1>
          <p>중요한 조건·기한·안내 변경은 사람의 검수 후 게시합니다.</p>
        </div>
      </div>
      <AdminConsole
        reviews={JSON.parse(JSON.stringify(reviews))}
        operations={JSON.parse(JSON.stringify(operations))}
      />
    </>
  );
}

import { pageUser } from "@/server/page-auth";
import { getConfig } from "@/server/config";
import { PlanForm } from "@/components/plan-form";
export default async function NewPlan() {
  const user = await pageUser();
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">NEW PLAN</div>
          <h1>직원 한 명, 새로운 계획</h1>
          <p>현재 가게의 상황과 채용 후의 변화를 함께 살펴봅니다.</p>
        </div>
      </div>
      <PlanForm
        demo={getConfig().demo}
        ntsEnabled={
          !user.is_demo && getConfig().liveIntegrations && Boolean(process.env.NTS_API_KEY)
        }
      />
    </>
  );
}

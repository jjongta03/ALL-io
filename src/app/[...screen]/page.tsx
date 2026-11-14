import { notFound } from "next/navigation";
import { WorkspacePage } from "@/server/workspace-page";
export default async function Page({ params }: { params: Promise<{ screen: string[] }> }) {
  const { screen } = await params;
  const [area, id, action] = screen;
  const simple = ["changes", "schedule", "documents", "reevaluate", "conditions", "notifications"];
  const resourceId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id ?? "",
  );
  const valid =
    (screen.length === 1 &&
      [...simple, "benefits", "projects", "employees", "onboarding", "mypage"].includes(area)) ||
    (area === "onboarding" && screen.length === 2 && ["1", "2", "3", "4"].includes(id)) ||
    (area === "mypage" && screen.length === 2 && ["owner", "business", "history"].includes(id)) ||
    (["benefits", "projects", "contracts", "employees"].includes(area) &&
      screen.length === 2 &&
      resourceId) ||
    (["contracts", "employees"].includes(area) && screen.length === 2 && id === "new") ||
    (area === "employees" && screen.length === 3 && action === "edit" && resourceId);
  if (!valid) notFound();
  return <WorkspacePage screen={screen} />;
}

import { notFound, redirect } from "next/navigation";
import { pageUser } from "./page-auth";
import { getDb } from "./db";
import * as service from "./workspace";
import { notificationInbox } from "./workspace-notifications";
import { workspaceBusinessSchema } from "@/domain/workspace";
import { seoulDate } from "@/domain/dates";
import { AppError } from "./errors";
import { onboardingState } from "@/domain/onboarding";
import { WorkspaceView } from "@/components/allio/workspace-view";
import type {
  Business,
  WorkspaceData,
  Employee,
  Project,
  Document,
} from "@/components/allio/types";
export async function WorkspacePage({ screen }: { screen: string[] }) {
  const user = await pageUser(false, "/" + screen.join("/"));
  const db = await getDb();
  const profile = await service.getProfile(db, user.id);
  const rows = await db.query<Business>(
    "SELECT id,facts,revision FROM businesses WHERE owner_id=$1 ORDER BY created_at",
    [user.id],
  );
  let business = rows.find((b) => workspaceBusinessSchema.safeParse(b.facts).success) ?? null;
  const draft = profile.onboarding as WorkspaceData["draft"];
  const onboarding = onboardingState(profile.profile, business, draft);
  const [area, requestedStage] = screen;
  if (area === "onboarding" && !requestedStage)
    redirect(`/onboarding/${onboarding.complete ? 1 : onboarding.stage}`);
  if (!onboarding.complete) {
    const employeeEntry = onboarding.stage === 4 && ["employees", "contracts"].includes(area);
    if (
      (area !== "onboarding" && !employeeEntry) ||
      (area === "onboarding" && Number(requestedStage) > onboarding.stage)
    )
      redirect(`/onboarding/${onboarding.stage}`);
  }
  const data: WorkspaceData = {
    profile: profile.profile,
    draft,
    email: user.email,
    isAdmin: user.role === "ADMIN",
    business,
    roster: { employees: [], total: 0, currentCount: 0 },
    benefits: {
      evaluationId: null,
      needsReevaluation: false,
      benefits: [],
      completed: [],
      isEligibilityGuarantee: false,
    },
    projects: [],
    documents: [],
    today: seoulDate(),
  };
  try {
    const [area, id] = screen;
    if (id && ["employees", "projects", "benefits", "contracts"].includes(area) && id !== "new") {
      if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
      if (area === "employees") {
        data.employee = await service.employeeDetail(db, id, user.id);
        business = await service.ownBusiness(db, data.employee.business_id!, user.id);
      }
      if (area === "projects") {
        data.project = (await service.projectDetail(db, id, user.id)) as Project;
        business = await service.ownBusiness(db, data.project.project.business_id, user.id);
      }
      if (area === "contracts")
        data.scan = (await service.scanDetail(db, id, user.id)) as WorkspaceData["scan"];
      if (area === "benefits") {
        if (!business) notFound();
        data.benefit = (await service.benefitDetail(
          db,
          business.id,
          user.id,
          id,
        )) as WorkspaceData["benefit"];
      }
    }
    data.business = business;
    if (business) {
      const roster = await service.roster(db, business.id, user.id);
      data.roster = { ...roster, employees: roster.employees as Employee[] };
      data.benefits = await service.eligibleBenefits(db, business.id, user.id);
      data.projects = (await service.projects(db, business.id, user.id)) as Project[];
      data.documents = (await service.documents(db, business.id, user.id)) as Document[];
      if (area === "notifications")
        data.notices = (await notificationInbox(
          db,
          business.id,
          user.id,
        )) as WorkspaceData["notices"];
    }
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  return <WorkspaceView key={screen.join("/")} screen={screen} data={data} />;
}

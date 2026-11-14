import type { OwnerProfile, WorkspaceBusiness, EmployeeDetails } from "@/domain/workspace";
import type { PolicyVersion, TaskTemplate } from "@/domain/contracts";
import type { eligibleBenefits } from "@/server/workspace";
export type Business = { id: string; facts: WorkspaceBusiness; revision: number };
export type Employee = {
  id: string;
  business_id?: string;
  scan_id?: string | null;
  details: EmployeeDetails;
  revision: number;
};
export type Project = {
  project: { id: string; business_id: string; policy_id: string; title: string; cycle_key: string };
  steps: {
    id: string;
    title: string;
    done: boolean;
    deadline: string | null;
    guide: TaskTemplate;
  }[];
  completed: number;
  total: number;
  progress: number;
  complete: boolean;
};
export type Document = {
  id: string;
  title: string;
  anchor_date: string;
  frequency: "WEEKLY" | "MONTHLY" | "YEARLY";
  lead_days: number;
  url: string | null;
  memo: string | null;
  enabled: boolean;
  occurrences: { id: string; dueDate: string; done: boolean }[];
};
export type Benefits = Omit<Awaited<ReturnType<typeof eligibleBenefits>>, "evaluationId"> & {
  evaluationId: string | null;
};
export type WorkspaceData = {
  profile: OwnerProfile | null;
  draft: {
    stage?: number;
    completed?: boolean;
    owner?: OwnerProfile;
    business?: WorkspaceBusiness;
  } | null;
  email: string;
  isAdmin: boolean;
  business: Business | null;
  roster: { employees: Employee[]; total: number; currentCount: number };
  benefits: Benefits;
  projects: Project[];
  documents: Document[];
  today: string;
  employee?: Employee;
  benefit?: {
    policy: PolicyVersion;
    eligibility: string;
    project: Project | null;
    needsReevaluation: boolean;
  };
  project?: Project;
  scan?: {
    id: string;
    draft: Partial<EmployeeDetails>;
    status: string;
    employee_id?: string | null;
  };
  notices?: {
    id: string;
    kind: string;
    status: string;
    payload: { title?: string; path?: string; deadline?: string };
    scheduled_at: string;
  }[];
};
export const industries = { CAFE: "카페", RESTAURANT: "음식점", OTHER: "기타 업종" };
export const employmentTypes = {
  REGULAR: "정규직",
  PART_TIME: "단시간 근로",
  DAILY: "일용직",
  OTHER: "기타",
};

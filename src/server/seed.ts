import { randomUUID } from "node:crypto";
import type { Database } from "./db";
import type { Definition, TaskTemplate } from "@/domain/contracts";
import { getConfig } from "./config";

const reference = {
  title: "두루누리 공식 안내 — 실제 규칙 등록 시 확인할 참고 출처",
  url: "https://insurancesupport.or.kr/durunuri/intro.php",
  verified: false,
  section: "가상 규칙의 법적 근거가 아님. 실제 조건은 별도 검수 필요.",
};
const task = (
  key: string,
  title: string,
  description: string,
  destination: string,
  url: string,
  days: number | null,
): TaskTemplate => ({
  key,
  title,
  description,
  destination,
  url,
  deadlineKind: days === null ? "NEEDS_CONFIRMATION" : "PREPARATION",
  offsetDays: days,
});
const eq = (
  field:
    | "hasHire"
    | "historyRequirementMet"
    | "exclusionClear"
    | "durationRemaining"
    | "hoursRequirementMet"
    | "laborCountConfirmed"
    | "coverageConfirmed",
  value = true,
) => ({ field, op: "eq" as const, value });
export function demoDefinitions(): {
  slug: string;
  title: string;
  kind: "BENEFIT" | "CHANGE" | "TASK";
  definition: Definition;
}[] {
  return [
    {
      slug: "demo-insurance",
      title: "사회보험료 지원 구조 예시 (가상)",
      kind: "BENEFIT",
      definition: {
        conditions: {
          all: [
            eq("hasHire"),
            { field: "insuranceHeadcount", op: "lt", value: 10 },
            { field: "monthlyAveragePay", op: "lt", value: 2500000 },
            eq("historyRequirementMet"),
            eq("exclusionClear"),
            eq("durationRemaining"),
            eq("hoursRequirementMet"),
          ],
        },
        explanation:
          "가상 기준으로 판정 엔진의 동작을 보여줍니다. 월 250만원은 실제 제도 기준이 아닙니다. 실제 지급 가능성·금액을 뜻하지 않습니다.",
        sources: [reference],
        tasks: [
          task(
            "benefit-application",
            "지원 신청 조건 확인",
            "담당 기관에서 실제 적용 조건과 제출 서류를 확인합니다. 아직 신청이 완료된 상태가 아닙니다.",
            "두루누리 공식 안내",
            reference.url,
            null,
          ),
        ],
      },
    },
    {
      slug: "labor-review",
      title: "상시근로자 수와 적용 의무 확인",
      kind: "CHANGE",
      definition: {
        conditions: { all: [eq("hasHire"), eq("laborCountConfirmed")] },
        explanation:
          "채용 후 표시 인원만으로 개별 의무 적용을 확정할 수 없습니다. 산정 자료와 개별 의무의 요건을 확인하세요. 여기서 ‘조건 부합’은 확인 절차를 입력했다는 뜻입니다.",
        sources: [
          {
            title: "국가법령정보센터 근로기준법 시행령",
            url: "https://www.law.go.kr/법령/근로기준법시행령/제7조의2",
            verified: false,
            section: "법 적용 사유별 산정과 예외 검토 필요",
          },
        ],
        tasks: [
          task(
            "labor-count",
            "상시근로자 산정 자료 준비",
            "가동일·일별 근로자 자료를 준비하고 해당 의무 적용 여부를 확인합니다.",
            "국가법령정보센터",
            "https://www.law.go.kr/법령/근로기준법시행령/제7조의2",
            -3,
          ),
        ],
      },
    },
    {
      slug: "employment-contract",
      title: "입사 전 준비 목록",
      kind: "TASK",
      definition: {
        conditions: eq("hasHire"),
        explanation: "입사 전 준비 목표일입니다. 법정 신고기한을 계산한 결과가 아닙니다.",
        sources: [
          {
            title: "고용노동부",
            url: "https://www.moel.go.kr/",
            verified: false,
            section: "실제 양식과 제출 경로는 검수 후 연결",
          },
        ],
        tasks: [
          task(
            "contract",
            "근로계약 내용과 작성 준비",
            "업무·임금·근로시간 등 계약 내용을 확인하세요. 공식 양식의 정확한 메뉴 경로는 아직 미검수 상태입니다.",
            "고용노동부 공식 사이트",
            "https://www.moel.go.kr/",
            -1,
          ),
        ],
      },
    },
    {
      slug: "insurance-report",
      title: "보험별 가입·취득신고 확인",
      kind: "TASK",
      definition: {
        conditions: { all: [eq("hasHire"), eq("coverageConfirmed")] },
        explanation:
          "보험마다 가입 대상과 신고기한을 따로 확인합니다. 아래 목록은 준비 안내이며 신고가 접수된 상태가 아닙니다.",
        sources: [reference],
        tasks: [
          task(
            "insurance-report",
            "보험별 취득신고 대상·기한 확인",
            "근로시간·계약기간 등 가입 조건과 보험별 신고기한을 공식 창구에서 확인하세요. 공통 날짜로 계산하지 않습니다.",
            "4대사회보험 정보연계센터",
            "https://www.4insure.or.kr/",
            null,
          ),
        ],
      },
    },
    {
      slug: "zz-demo-current-business",
      title: "현재 정보 체크리스트 예시 (가상 데모)",
      kind: "BENEFIT",
      definition: {
        conditions: {
          all: [eq("hasHire", false), { field: "currentHeadcount", op: "gte", value: 1 }],
        },
        explanation:
          "직원 목록·진행률·완료·기한 알림을 확인하는 합성 예시입니다. 실제 제도나 지원 자격이 아닙니다.",
        sources: [
          {
            title: "로컬 테스트 참고 링크",
            url: "https://www.moel.go.kr/",
            verified: false,
            section:
              "이 규칙과 준비 목표일은 실제 제도의 조건이나 법정 기한이 아닌 가상 데모입니다.",
          },
        ],
        tasks: [
          task(
            "demo-prepare",
            "예시 자료 준비",
            "테스트용 준비 단계입니다.",
            "공식 참고 사이트",
            "https://www.moel.go.kr/",
            10,
          ),
          task(
            "demo-check",
            "예시 접수 확인",
            "직접 완료 여부를 체크하는 테스트 단계입니다.",
            "공식 참고 사이트",
            "https://www.moel.go.kr/",
            14,
          ),
        ],
      },
    },
  ];
}
export async function seed(db: Database) {
  if (!getConfig().demo)
    throw new Error("가상 규칙 시드는 로컬 데모 모드에서만 실행할 수 있습니다.");
  await db.transaction(async (tx) => {
    for (const item of demoDefinitions()) {
      const existing = await tx.query("SELECT id FROM policies WHERE slug=$1", [item.slug]);
      if (existing.length) continue;
      const policyId = randomUUID();
      const versionId = randomUUID();
      await tx.query("INSERT INTO policies(id,slug,title,kind) VALUES($1,$2,$3,$4)", [
        policyId,
        item.slug,
        item.title,
        item.kind,
      ]);
      await tx.query(
        "INSERT INTO policy_versions(id,policy_id,version,status,definition,effective_from,effective_to,is_demo) VALUES($1,$2,1,'APPROVED',$3,'2020-01-01','2035-12-31',true)",
        [versionId, policyId, JSON.stringify(item.definition)],
      );
      await tx.query("UPDATE policies SET active_version_id=$1 WHERE id=$2", [versionId, policyId]);
      if (item.slug === "demo-insurance") {
        const draft = structuredClone(item.definition);
        if ("all" in draft.conditions)
          draft.conditions.all[2] = { field: "monthlyAveragePay", op: "lt", value: 2600000 };
        draft.explanation =
          "가상 변경 예시: 기준값을 250만원에서 260만원으로 변경했습니다. 실제 공고 변경이 아닙니다.";
        const draftId = randomUUID();
        await tx.query(
          "INSERT INTO policy_versions(id,policy_id,version,status,definition,effective_from,effective_to,is_demo) VALUES($1,$2,2,'PENDING_REVIEW',$3,'2020-01-01','2035-12-31',true)",
          [draftId, policyId, JSON.stringify(draft)],
        );
        await tx.query(
          "INSERT INTO review_items(id,draft_version_id,base_version_id,priority,reason) VALUES($1,$2,$3,2,$4)",
          [
            randomUUID(),
            draftId,
            versionId,
            "[가상 변경] 승인 전후 결과와 영향 계획을 검증하기 위한 초안입니다.",
          ],
        );
      }
    }
  });
}

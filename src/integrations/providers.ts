import { z } from "zod";
import { getConfig } from "@/server/config";
import { AppError } from "@/server/errors";

export function liveKey(name: string): string {
  if (!getConfig().liveIntegrations)
    throw new AppError(503, "실제 외부 연동이 꺼져 있습니다.", "INTEGRATION_DISABLED");
  const key = process.env[name];
  if (!key) throw new AppError(503, `${name} 설정이 필요합니다.`, "INTEGRATION_NOT_CONFIGURED");
  return key;
}
export async function searchOfficialSources(query: string) {
  const key = liveKey("LINER_API_KEY");
  const response = await fetch("https://platform.liner.com/api/v1/tools/search/web", {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      country_code: "kr",
      lang: "ko",
      max_results: 5,
      include_knowledge: false,
    }),
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!response.ok)
    throw new AppError(
      502,
      `Liner 요청 실패 (${response.status}). 키·크레딧을 확인하세요.`,
      "UPSTREAM_ERROR",
    );
  const data = z
    .object({
      results: z.array(
        z.object({
          title: z.string(),
          url: z.string().url(),
          description: z.string().optional(),
          date: z.string().nullable().optional(),
        }),
      ),
    })
    .parse(await response.json());
  return data.results.map((r) => ({ ...r, officialCandidate: isAllowedSource(r.url) }));
}
export const officialHosts = [
  "insurancesupport.or.kr",
  "www.insurancesupport.or.kr",
  "law.go.kr",
  "www.law.go.kr",
  "moel.go.kr",
  "www.moel.go.kr",
  "data.go.kr",
  "www.data.go.kr",
  "4insure.or.kr",
  "www.4insure.or.kr",
  "bizinfo.go.kr",
  "www.bizinfo.go.kr",
  "sbiz24.kr",
  "www.sbiz24.kr",
  "smes.go.kr",
  "www.smes.go.kr",
  "semas.or.kr",
  "www.semas.or.kr",
  "gov.kr",
  "www.gov.kr",
];
export function isAllowedSource(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      officialHosts.includes(url.hostname)
    );
  } catch {
    return false;
  }
}
export async function fetchOfficialText(url: string) {
  if (!isAllowedSource(url))
    throw new AppError(422, "수집 허용 목록에 있는 공식 HTTPS 주소만 사용할 수 있습니다.");
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(12000),
    headers: { Accept: "text/html,text/plain" },
  });
  if (!response.ok) throw new AppError(502, `공식 문서 수집 실패 (${response.status}).`);
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/"))
    throw new AppError(
      422,
      "현재 수집기는 텍스트·HTML만 지원합니다. PDF·동적 페이지는 수동 검수가 필요합니다.",
    );
  const reader = response.body?.getReader();
  if (!reader) throw new AppError(502, "수집 문서가 비어 있습니다.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.length;
      if (bytes > 1000000) {
        await reader.cancel();
        throw new AppError(422, "문서 크기가 수집 한도를 초과했습니다.");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const text = Buffer.concat(chunks)
    .toString("utf8")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 80)
    throw new AppError(422, "본문이 부족합니다. 동적 페이지 또는 인코딩을 확인하세요.");
  return text;
}
export async function checkBusinessStatus(number: string) {
  if (!/^\d{10}$/.test(number)) throw new AppError(422, "사업자번호는 숫자 10자리입니다.");
  const key = liveKey("NTS_API_KEY");
  const url = new URL("https://api.odcloud.kr/api/nts-businessman/v1/status");
  url.searchParams.set("serviceKey", key);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ b_no: [number] }),
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  if (!response.ok) throw new AppError(502, `국세청 상태조회 실패 (${response.status}).`);
  const data = z
    .object({
      data: z.array(
        z.object({
          b_stt: z.string().optional(),
          b_stt_cd: z.string().optional(),
          tax_type: z.string().optional(),
          end_dt: z.string().optional(),
        }),
      ),
    })
    .parse(await response.json());
  const result = data.data[0];
  return {
    status: result?.b_stt || "확인 불가",
    taxType: result?.tax_type || "확인 불가",
    checkedAt: new Date().toISOString(),
    ownershipVerified: false,
  };
}
export async function sendStibee(
  email: string,
  title: string,
  link: string,
): Promise<"ACCEPTED_BY_PROVIDER" | "FAILED" | "UNKNOWN"> {
  const key = liveKey("STIBEE_API_KEY");
  const endpoint = new URL(process.env.STIBEE_AUTO_EMAIL_URL || "https://invalid.local/");
  if (
    endpoint.protocol !== "https:" ||
    endpoint.hostname !== "stibee.com" ||
    !endpoint.pathname.startsWith("/api/v1.0/auto/") ||
    endpoint.username ||
    endpoint.password ||
    endpoint.port
  )
    throw new AppError(503, "스티비 자동 이메일 URL 설정을 확인하세요.");
  // User-supplied values can enter an HTML template, so escape every substitution.
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
    );
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { AccessToken: key, "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriber: email,
        task_title: escape(title),
        plan_url: escape(link),
      }),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    // A timeout or server failure may have happened after the provider accepted the request.
    return response.ok ? "ACCEPTED_BY_PROVIDER" : response.status >= 500 ? "UNKNOWN" : "FAILED";
  } catch {
    return "UNKNOWN";
  }
}

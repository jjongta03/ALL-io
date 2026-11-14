import { AppError } from "@/server/errors";
import { getConfig } from "@/server/config";
export function integrationEnabled(flag: string) {
  if (!getConfig().liveIntegrations || process.env[flag] !== "true")
    throw new AppError(503, "외부 연동이 꺼져 있습니다.", "INTEGRATION_DISABLED");
}
export async function jsonResponse(response: Response, max = 1_000_000): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new AppError(502, "외부 응답이 비어 있습니다.");
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > max) {
        await reader.cancel();
        throw new AppError(502, "외부 응답이 한도를 초과했습니다.");
      }
      parts.push(r.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new AppError(502, "외부 응답 형식을 확인하지 못했습니다.");
  }
}

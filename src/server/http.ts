import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getConfig } from "./config";
import { AppError } from "./errors";

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError(415, "JSON 형식으로 요청하세요.");
  const text = await readTextLimited(req);
  try {
    return schema.parse(JSON.parse(text));
  } catch (e) {
    if (e instanceof ZodError) throw e;
    throw new AppError(400, "JSON 요청을 읽을 수 없습니다.");
  }
}
export async function readTextLimited(req: Request, limit = 65536) {
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.length;
      if (size > limit) {
        await reader.cancel();
        throw new AppError(413, "요청 내용이 너무 큽니다.");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
export function assertOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(getConfig().appUrl).origin)
    throw new AppError(403, "허용된 화면에서 다시 요청하세요.", "ORIGIN_REJECTED");
}
export function route(fn: (req: NextRequest) => Promise<unknown>) {
  return async (req: NextRequest) => {
    try {
      assertOrigin(req);
      const result = await fn(req);
      return result instanceof Response
        ? result
        : NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      if (e instanceof ZodError)
        return NextResponse.json(
          {
            error: "입력값을 확인하세요.",
            code: "VALIDATION_ERROR",
            fields: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          },
          { status: 422 },
        );
      if (e instanceof AppError)
        return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
      console.error("request_failed", e instanceof Error ? e.name : "unknown");
      return NextResponse.json(
        {
          error: "요청을 처리하지 못했습니다. 로컬 설정과 DB 상태를 확인하세요.",
          code: "INTERNAL_ERROR",
        },
        { status: 500 },
      );
    }
  };
}
const rates = new Map<string, { start: number; count: number }>();
export function rateLimit(key: string, limit = 8) {
  const now = Date.now();
  if (rates.size > 5000) for (const [k, v] of rates) if (now - v.start > 900000) rates.delete(k);
  const entry = rates.get(key);
  if (!entry || now - entry.start > 900000) {
    rates.set(key, { start: now, count: 1 });
    return;
  }
  if (++entry.count > limit) throw new AppError(429, "요청이 많습니다. 잠시 후 다시 시도하세요.");
}

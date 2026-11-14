import { createHash } from "node:crypto";
import type { Evaluation } from "@/domain/contracts";

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
export function meaningfulHash(result: Evaluation) {
  return hash(
    result.all.map((r) => ({
      id: r.policyId,
      status: r.status,
      missing: r.missingFields,
      explanation: r.explanation,
      tasks: r.tasks,
    })),
  );
}

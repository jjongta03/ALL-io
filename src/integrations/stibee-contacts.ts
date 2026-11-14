import { z } from "zod";
import { liveKey } from "./providers";
import { integrationEnabled, jsonResponse } from "./transport";
import { AppError } from "@/server/errors";
function list() {
  integrationEnabled("STIBEE_CONTACT_SYNC_ENABLED");
  const id = process.env.STIBEE_LIST_ID;
  if (!id || !/^\d+$/.test(id)) throw new AppError(503, "스티비 주소록 ID가 필요합니다.");
  return `https://api.stibee.com/v2/lists/${id}`;
}
async function call(path: string, body?: unknown) {
  const res = await fetch(list() + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { AccessToken: liveKey("STIBEE_API_KEY"), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok)
    throw new AppError(
      502,
      "스티비 주소록 요청을 확인하지 못했습니다.",
      res.status >= 500 ? "DELIVERY_UNKNOWN" : "CONTACT_REQUEST_FAILED",
    );
  return res;
}
export async function upsertSubscriber(email: string, subscribed: boolean) {
  z.email().max(64).parse(email);
  // Service notifications do not imply marketing consent.
  await call("/subscribers", {
    subscriber: {
      email,
      status: subscribed ? "subscribed" : "unsubscribed",
      marketingAllowed: false,
    },
    updateEnabled: true,
  });
}
export async function listRemoteSubscribers(offset = 0) {
  const res = await call(
    `/subscribers?limit=1000&offset=${offset}&statuses=subscribed,unsubscribed,ready,archived`,
  );
  return z
    .array(
      z.object({
        email: z.email(),
        status: z.enum(["subscribed", "unsubscribed", "ready", "archived"]),
      }),
    )
    .max(1000)
    .parse(await jsonResponse(res));
}

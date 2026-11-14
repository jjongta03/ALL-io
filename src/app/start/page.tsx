import { redirect } from "next/navigation";
import { getUser } from "@/server/auth";
import { VisitorEntry } from "@/components/visitor-entry";
import { loginDestination } from "@/domain/login";
export default async function Start({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams,
    next = loginDestination(typeof params.next === "string" ? params.next : undefined);
  if (await getUser()) redirect(next);
  return <VisitorEntry next={next} />;
}

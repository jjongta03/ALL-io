import { redirect } from "next/navigation";
import { loginDestination } from "@/domain/login";
export default async function OldEntry({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  redirect(
    `/start?next=${encodeURIComponent(loginDestination(typeof params.next === "string" ? params.next : undefined))}`,
  );
}

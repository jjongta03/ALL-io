import { redirect, notFound } from "next/navigation";
import { getUser } from "./auth";
import { loginDestination } from "@/domain/login";
export async function pageUser(admin = false, next = "/dashboard") {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(loginDestination(next))}`);
  if (admin && user.role !== "ADMIN") notFound();
  return user;
}

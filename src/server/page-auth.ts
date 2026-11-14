import { redirect, notFound } from "next/navigation";
import { getUser } from "./auth";
export async function pageUser(admin = false) {
  const user = await getUser();
  if (!user) redirect("/");
  if (admin && user.role !== "ADMIN") notFound();
  return user;
}

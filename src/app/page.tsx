import { redirect } from "next/navigation";
import { getUser } from "@/server/auth";
import { VisitorEntry } from "@/components/visitor-entry";
export default async function Home() {
  if (await getUser()) redirect("/dashboard");
  return <VisitorEntry next="/dashboard" />;
}

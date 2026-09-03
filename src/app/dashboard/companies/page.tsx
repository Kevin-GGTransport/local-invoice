import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { CompaniesClient } from "./companies-client";

export default async function CompaniesPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/dashboard");
  return <CompaniesClient />;
}

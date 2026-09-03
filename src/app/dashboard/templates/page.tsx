import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { TemplatesClient } from "./templates-client";

export default async function TemplatesPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/dashboard");
  return <TemplatesClient />;
}

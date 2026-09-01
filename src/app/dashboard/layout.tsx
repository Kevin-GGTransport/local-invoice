import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { auth } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: import("react").ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <DashboardShell user={session.user}>{children}</DashboardShell>;
}

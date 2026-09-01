import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth();
  return (
    <div className="text-xl font-semibold">
      欢迎，{session?.user?.name ?? "用户"}
    </div>
  );
}

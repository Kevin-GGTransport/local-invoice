"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Home, ReceiptText } from "lucide-react";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "首页", icon: Home },
  { href: "/dashboard/finance/accounting-invoices", label: "陆运账单", icon: ReceiptText },
];

export function DashboardShell({
  user,
  children,
}: {
  user: { name?: string | null };
  children: import("react").ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-background">
        <div className="flex h-14 items-center gap-2 border-b px-4 font-semibold">
          <FileText className="size-4" />
          local-invoice
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted",
                (pathname === item.href ||
                  pathname.startsWith(`${item.href}/`)) &&
                  "bg-muted font-medium"
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <span className="text-sm text-muted-foreground">发票管理</span>
          <div className="flex items-center gap-3">
            <span className="text-sm">{user.name ?? "用户"}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => signOut({ redirectTo: "/login" })}
            >
              退出登录
            </Button>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

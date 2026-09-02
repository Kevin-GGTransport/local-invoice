"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Menu, ReceiptText, Route, X } from "lucide-react";
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
  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const activeHref =
    [...navItems]
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.href ??
    "/dashboard";

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {menuOpen && (
        <button
          type="button"
          aria-label="关闭菜单"
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside
        id="dashboard-navigation"
        aria-label="系统导航"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-800 bg-slate-950 text-slate-100 transition-transform duration-200 lg:translate-x-0",
          menuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between gap-3 border-b border-white/10 px-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-400/40 bg-amber-400/15 text-amber-300">
              <Route className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">G&amp;G</span>
              <span className="block truncate text-[0.63rem] uppercase tracking-[0.18em] text-slate-400">
                Ground Transportation
              </span>
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-300 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setMenuOpen(false)}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const active = activeHref === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white",
                  active && "bg-amber-400/15 font-medium text-amber-200"
                )}
              >
                <item.icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-4 py-4 text-xs leading-5 text-slate-500">
          G&amp;G Ground Transportation System
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col lg:pl-72">
        <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="dashboard-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Menu className="size-4" aria-hidden="true" />
              <span className="sr-only">打开系统菜单</span>
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">G&amp;G 陆运系统</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                运营与账单管理平台
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="max-w-32 truncate text-sm sm:max-w-none">{user.name ?? "用户"}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => signOut({ redirectTo: "/login" })}
            >
              退出
            </Button>
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

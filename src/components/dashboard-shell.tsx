"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Building2, ChevronDown, CircleDollarSign, CircleHelp, FileSliders, Home, Landmark, Menu, PanelLeftClose, PanelLeftOpen, ReceiptText, Route, Settings2, X } from "lucide-react";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const financeChildren = [
  { href: "/dashboard/finance/accounting-invoices", label: "陆运账单", icon: ReceiptText },
  { href: "/dashboard/finance/reconciliation", label: "出纳核销", icon: CircleDollarSign },
];

const basicChildren = [
  { href: "/dashboard/companies", label: "公司管理", icon: Building2 },
  { href: "/dashboard/templates", label: "账单模版管理", icon: FileSliders },
];

const helpChildren = [
  { href: "/dashboard/help/operations", label: "系统操作手册", icon: BookOpen },
  { href: "/dashboard/help/invoice-templates", label: "账单模版操作手册", icon: BookOpen },
];

export function DashboardShell({
  user,
  children,
}: {
  user: { name?: string | null; role?: string | null };
  children: import("react").ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const financeActive = pathname.startsWith("/dashboard/finance");
  const [financeOpen, setFinanceOpen] = React.useState(financeActive);
  const isAdmin = user.role === "admin";
  const basicActive = pathname.startsWith("/dashboard/companies") || pathname.startsWith("/dashboard/templates");
  const [basicOpen, setBasicOpen] = React.useState(basicActive);
  const helpActive = pathname.startsWith("/dashboard/help");
  const [helpOpen, setHelpOpen] = React.useState(helpActive);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const homeActive = pathname === "/dashboard";

  return (
    <div className="min-h-dvh bg-muted/40 text-foreground">
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
          "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[calc(100vw-2rem)] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 motion-reduce:transition-none",
          menuOpen ? "visible translate-x-0" : "invisible -translate-x-full",
          sidebarCollapsed ? "lg:invisible lg:-translate-x-full" : "lg:visible lg:translate-x-0"
        )}
      >
        <div className="flex h-16 items-center justify-between gap-3 border-b border-sidebar-border px-4">
          <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Route className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">G&amp;G</span>
              <span className="block truncate text-[0.63rem] uppercase tracking-[0.18em] text-muted-foreground">
                Ground Transportation
              </span>
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            aria-label="关闭菜单"
            className="size-11 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:hidden"
            onClick={() => setMenuOpen(false)}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto p-3">
          <p className="px-3 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            导航
          </p>

          <Link
            href="/dashboard"
            aria-current={homeActive ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              homeActive && "bg-primary font-medium text-primary-foreground"
            )}
          >
            <Home className="size-4" aria-hidden="true" />
            首页
          </Link>

          {isAdmin && (
            <div className="space-y-1">
              <button
                type="button"
                aria-expanded={basicOpen}
                aria-controls="basic-navigation"
                onClick={() => setBasicOpen((open) => !open)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  basicActive && "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                )}
              >
                <Settings2 className="size-4" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-left">基础管理</span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                    basicOpen && "rotate-180"
                  )}
                  aria-hidden="true"
                />
              </button>

              {basicOpen && (
                <ul id="basic-navigation" className="ml-4 space-y-1 border-l border-sidebar-border pl-3">
                  {basicChildren.map((item) => {
                    const active =
                      pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setMenuOpen(false)}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            active && "bg-primary font-medium text-primary-foreground"
                          )}
                        >
                          <item.icon className="size-4" aria-hidden="true" />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <div className="space-y-1">
            <button
              type="button"
              aria-expanded={financeOpen}
              aria-controls="finance-navigation"
              onClick={() => setFinanceOpen((open) => !open)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                financeActive && "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              )}
            >
              <Landmark className="size-4" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-left">财务管理</span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                  financeOpen && "rotate-180"
                )}
                aria-hidden="true"
              />
            </button>

            {financeOpen && (
              <ul id="finance-navigation" className="ml-4 space-y-1 border-l border-sidebar-border pl-3">
                {financeChildren.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          active &&
                            "bg-primary font-medium text-primary-foreground"
                        )}
                      >
                        <item.icon className="size-4" aria-hidden="true" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-1">
            <button
              type="button"
              aria-expanded={helpOpen}
              aria-controls="help-navigation"
              onClick={() => setHelpOpen((open) => !open)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                helpActive && "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              )}
            >
              <CircleHelp className="size-4" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-left">帮助</span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                  helpOpen && "rotate-180"
                )}
                aria-hidden="true"
              />
            </button>

            {helpOpen && (
              <ul id="help-navigation" className="ml-4 space-y-1 border-l border-sidebar-border pl-3">
                {helpChildren.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          active && "bg-primary font-medium text-primary-foreground"
                        )}
                      >
                        <item.icon className="size-4" aria-hidden="true" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </nav>

        <div className="border-t border-sidebar-border px-4 py-4 text-xs leading-5 text-muted-foreground">
          G&amp;G Ground Transportation System
        </div>
      </aside>

      <div className={cn("flex min-h-dvh min-w-0 flex-col", !sidebarCollapsed && "lg:pl-72")}>
        <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-3 py-2 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="size-11 shrink-0 lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="dashboard-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Menu className="size-4" aria-hidden="true" />
              <span className="sr-only">打开系统菜单</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="hidden size-11 shrink-0 lg:inline-flex"
              aria-label={sidebarCollapsed ? "展开左侧菜单" : "收起左侧菜单"}
              title={sidebarCollapsed ? "展开左侧菜单" : "收起左侧菜单"}
              aria-expanded={!sidebarCollapsed}
              aria-controls="dashboard-navigation"
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="size-4" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="size-4" aria-hidden="true" />
              )}
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">G&amp;G 陆运系统</p>
              <p className="truncate text-xs text-muted-foreground">
                运营与账单管理平台
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
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

        <main className="min-w-0 flex-1 p-3 sm:p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

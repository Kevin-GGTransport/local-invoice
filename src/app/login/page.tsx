import { Suspense } from "react";
import type { Metadata } from "next";
import { Route, ShieldCheck, Truck } from "lucide-react";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "G&G Ground Transportation System",
  description: "G&G 陆运运营与账单管理平台",
};

const routeFeatures = [
  { label: "陆运账单", icon: Truck },
  { label: "调度协同", icon: Route },
  { label: "运营管控", icon: ShieldCheck },
];

function BrandPanel() {
  return (
    <section
      aria-label="G&G Ground Transportation System 品牌信息"
      className="relative isolate flex min-h-72 flex-col justify-between overflow-hidden bg-slate-950 px-5 py-6 text-white sm:min-h-80 sm:px-8 lg:min-h-0 lg:px-12 lg:py-12 xl:px-16"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20"
        style={{
          backgroundImage:
            "radial-gradient(circle at 78% 12%, rgba(56, 189, 248, 0.20), transparent 34%), radial-gradient(circle at 15% 85%, rgba(245, 158, 11, 0.16), transparent 30%), linear-gradient(145deg, #020617 0%, #0F172A 58%, #1E293B 100%)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 opacity-[0.08]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(115deg, rgba(248, 250, 252, 0.55) 0px, rgba(248, 250, 252, 0.55) 1px, transparent 1px, transparent 12px)",
        }}
      />
      <svg
        aria-hidden="true"
        className="absolute inset-0 -z-10 h-full w-full"
        viewBox="0 0 680 720"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="gg-route-line" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="48%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#E2E8F0" />
          </linearGradient>
        </defs>
        <path
          d="M-30 635 C105 568 137 625 238 555 C347 479 348 389 458 327 C548 276 596 296 710 258"
          fill="none"
          stroke="url(#gg-route-line)"
          strokeWidth="18"
          strokeLinecap="round"
          opacity="0.42"
        />
        <path
          d="M-30 635 C105 568 137 625 238 555 C347 479 348 389 458 327 C548 276 596 296 710 258"
          fill="none"
          stroke="#F8FAFC"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="18 20"
          opacity="0.38"
        />
        <circle cx="112" cy="588" r="10" fill="#0F172A" stroke="#F59E0B" strokeWidth="5" />
        <circle cx="355" cy="444" r="8" fill="#0F172A" stroke="#38BDF8" strokeWidth="5" />
        <circle cx="570" cy="293" r="10" fill="#0F172A" stroke="#E2E8F0" strokeWidth="5" />
      </svg>

      <div className="relative z-10 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-400/15 text-amber-300 shadow-[0_0_28px_rgba(245,158,11,0.22)]">
          <Route className="size-5" aria-hidden="true" />
        </span>
        <span>
          <span className="block text-lg font-semibold tracking-tight">G&amp;G</span>
          <span className="block text-[0.68rem] font-medium uppercase tracking-[0.25em] text-slate-300">
            Ground Transportation
          </span>
        </span>
      </div>

      <div className="relative z-10 space-y-5">
        <div className="max-w-lg space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">
            Land Freight Operations
          </p>
          <p className="text-balance text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl lg:text-4xl">
            公路货运，调度与账单一体管理
          </p>
          <p className="max-w-md text-sm leading-6 text-slate-300">
            陆运运营与账单管理平台，让运输路线、费用记录与业务协同保持清晰可控。
          </p>
        </div>

        <ul className="flex flex-wrap gap-2">
          {routeFeatures.map((feature) => (
            <li
              key={feature.label}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-100 backdrop-blur"
            >
              <feature.icon className="size-3.5 text-amber-300" aria-hidden="true" />
              {feature.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-dvh bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto grid min-h-dvh w-full max-w-[100rem] grid-cols-1 lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
        <BrandPanel />
        <section className="flex items-center justify-center self-start px-4 py-8 sm:px-6 lg:self-stretch lg:px-10 lg:py-12">
          <Suspense>
            <LoginForm />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

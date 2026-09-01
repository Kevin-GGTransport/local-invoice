# local-invoice 项目骨架实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用官方脚手架搭出可登录的 Next.js 16 纯骨架（脚手架 + Prisma/Neon 接入 + NextAuth 登录 + Dashboard 空布局），不动已有两张业务表。

**Architecture:** create-next-app 官方默认约定（src/ 目录、App Router、Turbopack）+ shadcn/ui（neutral）+ Prisma 6 连 Neon PostgreSQL（先 `db pull` 反向导入、再迁移基线化、后加 users 表）+ NextAuth v5 Credentials/JWT（edge 安全的 auth.config.ts 与含 Prisma 的 lib/auth.ts 分离，`src/proxy.ts` 做路由保护）。

**Tech Stack:** Next.js 16 / React 19 / TypeScript strict / Tailwind CSS v4 / shadcn-ui / Prisma ^6.19.0 + Neon PostgreSQL / next-auth ^5.0.0-beta.30 / bcryptjs / react-hook-form + zod / sonner / pnpm

**Spec:** `docs/superpowers/specs/2026-09-01-project-skeleton-design.md`

## Global Constraints

- Next.js 16 App Router，`src/` 目录，`@/*` 别名，Turbopack（全部 create-next-app 默认）
- 包管理器 pnpm；TypeScript `strict: true`
- **Prisma 固定 `^6.19.0`，禁止安装 v7**（v7 有 prisma.config.ts / driver-adapter 等破坏性变更；6.19 是与 Next 16 验证过的组合）
- **禁止 `prisma migrate reset`**；禁止改动/删除 `accounting_invoices`、`accounting_invoice_lines` 的结构与数据
- `.env` 不入库（gitignore）；`.env.example` 只放占位符，需在 .gitignore 加 `!.env.example` 例外
- UI 文案与错误消息一律中文
- 每个任务结束必须 commit；提交信息用 `feat:`/`chore:`/`docs:` 前缀
- 本项目无单元测试框架（spec 明确 YAGNI）；每个任务的验证手段是运行验证命令并检查输出
- 工作目录：`/Users/zhangfulai/FLY_Project/我的项目/GNG_Project/project/local-invoice`（下文所有相对路径基于此）

---

### Task 1: create-next-app 脚手架落地仓库根目录

**Files:**
- Create: Next.js 全套脚手架（`package.json`、`tsconfig.json`、`eslint.config.mjs`、`postcss.config.mjs`、`next.config.ts`、`src/app/*`、`.gitignore` 等）

**Interfaces:**
- Produces: 可运行的 Next.js 16 应用（`src/app/layout.tsx`、`src/app/page.tsx`）；`@/*` 别名；pnpm scripts `dev/build/start/lint`

- [ ] **Step 1: 在临时子目录生成脚手架（仓库根已有 README/CLAUDE.md/docs，直接生成会冲突）**

```bash
cd "/Users/zhangfulai/FLY_Project/我的项目/GNG_Project/project/local-invoice"
pnpm create next-app@latest scaffold-tmp --ts --eslint --tailwind --app --src-dir --turbopack --import-alias "@/*" --use-pnpm --skip-install --yes
```

若报 `--turbopack` 未知选项（Next 16 已默认 Turbopack），去掉该 flag 重跑；若 `--skip-install` 未知则去掉并等它装完。

- [ ] **Step 2: 移入仓库根并安装依赖**

```bash
rsync -a scaffold-tmp/ ./ && rm -rf scaffold-tmp
pnpm install
```

- [ ] **Step 3: 验证 dev 可启动**

```bash
pnpm dev --port 3100 &
sleep 8
curl -s -o /dev/null -w "%{http_code}" http://localhost:3100
kill %1
```

Expected: `200`

- [ ] **Step 4: 验证 lint 通过**

Run: `pnpm lint`
Expected: 无错误退出（可能有 warning，可忽略）

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: create-next-app 脚手架（Next.js 16 + TS + Tailwind v4）"
```

---

### Task 2: shadcn/ui 初始化与依赖安装

**Files:**
- Create: `components.json`、`src/lib/utils.ts`（cn）、`src/components/ui/{button,input,label,card,form,sonner}.tsx`
- Modify: `src/app/globals.css`（shadcn 主题变量）、`package.json`（依赖）

**Interfaces:**
- Consumes: Task 1 的 Tailwind v4 + tsconfig 别名
- Produces: `@/components/ui/*` 组件、`cn()`（`@/lib/utils`）；已安装 `react-hook-form` `zod` `@hookform/resolvers` `sonner` `next-themes` `lucide-react`

- [ ] **Step 1: 初始化 shadcn/ui（neutral 基础色）**

```bash
pnpm dlx shadcn@latest init -y -b neutral
```

Expected: 生成 `components.json` 与 `src/lib/utils.ts`，globals.css 被注入主题变量

- [ ] **Step 2: 添加骨架所需组件**

```bash
pnpm dlx shadcn@latest add button input label card form sonner -y
```

Expected: `src/components/ui/` 下出现 6 个组件；`react-hook-form`、`zod`、`@hookform/resolvers`、`sonner`、`next-themes` 自动装入 dependencies

- [ ] **Step 3: 安装认证与数据库依赖（版本固定）**

```bash
pnpm add next-auth@^5.0.0-beta.30 bcryptjs@^3.0.3 prisma@^6.19.0 @prisma/client@^6.19.0
pnpm add -D tsx @types/bcryptjs
```

注意：若 pnpm 解析出 prisma 7.x 则显式 `pnpm add prisma@6 @prisma/client@6`。

- [ ] **Step 4: 验证 lint + 安装结果**

Run: `pnpm lint && node -e "console.log(require('./package.json').dependencies)"`
Expected: lint 通过；dependencies 含 next-auth、bcryptjs、prisma、@prisma/client，且 prisma 主版本为 6

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: shadcn/ui 初始化 + 认证与数据库依赖"
```

---

### Task 3: 环境变量与 package.json scripts

**Files:**
- Create: `.env`、`.env.example`
- Modify: `.gitignore`（加 `!.env.example`）、`package.json`（scripts）

**Interfaces:**
- Produces: 环境变量 `DATABASE_URL`、`AUTH_SECRET`；scripts `type-check`、`db:pull`、`db:push`、`db:migrate`、`db:seed`、`db:studio`

- [ ] **Step 1: 生成 AUTH_SECRET 并写 .env**

```bash
echo "AUTH_SECRET=$(openssl rand -base64 32)" > .env
cat >> .env << 'EOF'
DATABASE_URL="postgresql://neondb_owner:npg_3woZkbe5phvT@ep-soft-credit-ard77ji0-pooler.c-4.us-west-2.aws.neon.tech/neondb?sslmode=require"
EOF
```

说明：连接串来自用户提供的 Neon 库；Prisma 不支持 `channel_binding` 参数，已去掉（`sslmode=require` 保留）。`.env` 含凭据，**不得 commit**（.gitignore 默认含 `.env*`）。

- [ ] **Step 2: 写 .env.example 并放行**

`.env.example` 内容：

```env
# PostgreSQL（Neon）连接串
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
# NextAuth 密钥：openssl rand -base64 32
AUTH_SECRET=""
```

`.gitignore` 末尾追加一行：

```
!.env.example
```

- [ ] **Step 3: 加 scripts**

`package.json` 的 `scripts` 增补（保留已有 dev/build/start/lint）：

```json
"type-check": "tsc --noEmit",
"db:pull": "prisma db pull",
"db:push": "prisma db push",
"db:migrate": "prisma migrate dev",
"db:seed": "tsx prisma/seed.ts",
"db:studio": "prisma studio"
```

- [ ] **Step 4: 验证**

Run: `pnpm type-check && git status --porcelain .env .env.example`
Expected: type-check 通过；`.env` 不出现在 git status（被忽略），`.env.example` 出现为未跟踪

- [ ] **Step 5: Commit**

```bash
git add .gitignore .env.example package.json package-lock.json 2>/dev/null; git add .gitignore .env.example package.json; git commit -m "chore: 环境变量与 db/type-check scripts"
```

---

### Task 4: Prisma 接入现有库并迁移基线化

**Files:**
- Create: `prisma/schema.prisma`、`prisma/migrations/0_init/migration.sql`、`prisma/migrations/migration_lock.toml`

**Interfaces:**
- Consumes: Task 3 的 `DATABASE_URL` 与 `db:*` scripts
- Produces: schema 含 `accounting_invoices`、`accounting_invoice_lines` 两个 model（与库中现状一致）；数据库出现 `_prisma_migrations` 且记录 `0_init` 已应用；**两张业务表结构数据零改动**

- [ ] **Step 1: 手写 datasource/generator，再 db pull**

`prisma/schema.prisma`：

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
```

```bash
pnpm db:pull
```

Expected: schema.prisma 中自动生成 `model accounting_invoices`（约 34 字段、`invoice_number @unique`）与 `model accounting_invoice_lines`（含 `accounting_invoice_id` 关联 + `onDelete: Cascade`）

- [ ] **Step 2: 生成基线迁移并标记已应用**

```bash
mkdir -p prisma/migrations/0_init
pnpm prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql
printf '# Please do not edit this file manually\n# It should be added in your version-control system (i.e. Git)\nprovider = "postgresql"\n' > prisma/migrations/migration_lock.toml
pnpm prisma migrate resolve --applied 0_init
```

- [ ] **Step 3: 验证迁移状态与业务表未动**

```bash
pnpm prisma migrate status
PGPASSWORD=npg_3woZkbe5phvT psql "postgresql://neondb_owner:npg_3woZkbe5phvT@ep-soft-credit-ard77ji0-pooler.c-4.us-west-2.aws.neon.tech/neondb?sslmode=require" -c "\dt" -c "SELECT count(*) FROM accounting_invoices;"
```

Expected: migrate status 显示 1 个迁移已应用（0_init）、schema up to date；`\dt` 显示 `accounting_invoice_lines`、`accounting_invoices`、`_prisma_migrations` 三张表；两张业务表 count 仍为 0

- [ ] **Step 4: Commit**

```bash
git add prisma && git commit -m "feat: Prisma 接入 Neon 库并完成迁移基线化"
```

---

### Task 5: users 表、Prisma 单例与 seed

**Files:**
- Create: `src/lib/prisma.ts`、`prisma/seed.ts`、`prisma/migrations/<ts>_add_users/`
- Modify: `prisma/schema.prisma`（加 users model）、`package.json`（prisma.seed 配置）

**Interfaces:**
- Consumes: Task 4 的基线化迁移历史
- Produces: 库中 `users` 表；`export const prisma: PrismaClient`（`@/lib/prisma`，globalThis 单例）；seed 后存在 `admin` 账号（密码在 seed 输出中，需记录并告知用户）

- [ ] **Step 1: schema 增加 users model 并迁移**

在 `prisma/schema.prisma` 末尾追加：

```prisma
model users {
  id            BigInt   @id @default(autoincrement())
  username      String   @unique @db.VarChar(50)
  password_hash String
  name          String?  @db.VarChar(100)
  role          String   @default("user") @db.VarChar(50)
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt
}
```

```bash
pnpm db:migrate --name add_users
```

Expected: 生成并应用仅含 `CREATE TABLE "users"` 的迁移（若提示 drift/reset，**立即停止**，说明基线化有误，回到 Task 4 排查）

- [ ] **Step 2: Prisma 单例**

`src/lib/prisma.ts`：

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 3: seed 脚本**

`prisma/seed.ts`：

```ts
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const password = randomBytes(8).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.users.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password_hash: passwordHash,
      name: "管理员",
      role: "admin",
    },
  });
  console.log(`admin 账号已创建，初始密码：${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

`package.json` 增加顶层配置（与 scripts 平级）：

```json
"prisma": { "seed": "tsx prisma/seed.ts" }
```

- [ ] **Step 4: 执行 seed 并记录密码**

```bash
pnpm db:seed
```

Expected: 输出 `admin 账号已创建，初始密码：xxxx`——**把密码记下来，最终交付时告知用户**

- [ ] **Step 5: 验证库状态与类型**

```bash
PGPASSWORD=npg_3woZkbe5phvT psql "postgresql://neondb_owner:npg_3woZkbe5phvT@ep-soft-credit-ard77ji0-pooler.c-4.us-west-2.aws.neon.tech/neondb?sslmode=require" -c "SELECT id, username, name, role FROM users;" -c "\dt"
pnpm type-check
```

Expected: users 表有 admin 一行（role=admin）；表总数 4（两张业务表 + users + _prisma_migrations）；type-check 通过

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: users 表 + Prisma 单例 + admin seed 脚本"
```

---

### Task 6: NextAuth v5 认证（Credentials + JWT）

**Files:**
- Create: `src/auth.config.ts`、`src/lib/auth.ts`、`src/app/api/auth/[...nextauth]/route.ts`、`src/types/next-auth.d.ts`

**Interfaces:**
- Consumes: Task 5 的 `prisma`（`@/lib/prisma`）与 `users` model 字段（username/password_hash/name/role，id 为 BigInt）
- Produces: `export const { handlers, auth, signIn, signOut }`（`@/lib/auth`）；`export const authConfig`（`@/auth.config`，edge 安全、不含 prisma）；`session.user` 类型含 `id: string`、`role: string`

- [ ] **Step 1: edge 安全配置**

`src/auth.config.ts`：

```ts
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
} satisfies NextAuthConfig;
```

- [ ] **Step 2: 完整认证实例**

`src/lib/auth.ts`：

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "用户名", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username;
        const password = credentials?.password;
        if (typeof username !== "string" || typeof password !== "string") {
          return null;
        }
        const user = await prisma.users.findUnique({ where: { username } });
        if (!user) return null;
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return null;
        return { id: String(user.id), name: user.name ?? user.username, role: user.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.role = user.role;
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as string) ?? "user";
      }
      return session;
    },
  },
});
```

- [ ] **Step 3: API 路由与类型增强**

`src/app/api/auth/[...nextauth]/route.ts`：

```ts
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

`src/types/next-auth.d.ts`：

```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
  }
  interface Session {
    user: { id: string; role: string } & DefaultSession["user"];
  }
}
```

- [ ] **Step 4: 验证类型与构建期检查**

Run: `pnpm type-check && pnpm lint`
Expected: 均通过（auth.route 的动态段目录名 `[...nextauth]` 不会引发 TS 错误）

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: NextAuth v5 Credentials 认证（JWT + users 表校验）"
```

---

### Task 7: proxy.ts 路由保护

**Files:**
- Create: `src/proxy.ts`

**Interfaces:**
- Consumes: Task 6 的 `authConfig`（`@/auth.config`）
- Produces: 中间件行为——未登录访问 `/dashboard/*` → 307 到 `/login?callbackUrl=...`；已登录访问 `/login` → 307 到 `/dashboard`

- [ ] **Step 1: 写中间件（Next 16 的 middleware 即 proxy.ts，Edge 运行时，禁止 import prisma/bcryptjs）**

`src/proxy.ts`：

```ts
import NextAuth from "next-auth";
import NextResponse from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/dashboard") && !req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }
  if (pathname === "/login" && req.auth) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
});

export const config = { matcher: ["/dashboard/:path*", "/login"] };
```

- [ ] **Step 2: 验证重定向行为**

```bash
pnpm dev --port 3100 &
sleep 8
curl -s -o /dev/null -w "dashboard未登录: %{http_code} -> %{redirect_url}\n" http://localhost:3100/dashboard
curl -s -o /dev/null -w "login页: %{http_code}\n" http://localhost:3100/login
kill %1
```

Expected: `dashboard未登录: 307 -> http://localhost:3100/login?callbackUrl=%2Fdashboard`；`login页: 200`

- [ ] **Step 3: Commit**

```bash
git add src/proxy.ts && git commit -m "feat: proxy.ts 路由保护（未登录跳登录页）"
```

---

### Task 8: 登录页

**Files:**
- Create: `src/app/login/page.tsx`、`src/app/login/login-form.tsx`
- Modify: `src/app/layout.tsx`（挂 Toaster）

**Interfaces:**
- Consumes: Task 2 的 shadcn 组件（`@/components/ui/*`）；`signIn`（`next-auth/react`）；Task 7 的 `callbackUrl` query 参数约定
- Produces: `POST`-型表单组件 `LoginForm`；登录成功 `router.push(callbackUrl ?? "/dashboard")`

- [ ] **Step 1: 表单组件**

`src/app/login/login-form.tsx`：

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const loginSchema = z.object({
  username: z.string().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = async (values: LoginValues) => {
    const result = await signIn("credentials", {
      ...values,
      redirect: false,
    });
    if (result?.error) {
      toast.error("用户名或密码错误");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>登录</CardTitle>
        <CardDescription>local-invoice 发票管理系统</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>用户名</FormLabel>
                  <FormControl>
                    <Input placeholder="请输入用户名" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>密码</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="请输入密码" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "登录中…" : "登录"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: 页面（Suspense 包 useSearchParams）**

`src/app/login/page.tsx`：

```tsx
import { Suspense } from "react";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
```

- [ ] **Step 3: 根布局挂 Toaster**

修改 `src/app/layout.tsx`：在 `import` 区加

```tsx
import { Toaster } from "@/components/ui/sonner";
```

在 `<body>` 内、`{children}` 之后加

```tsx
<Toaster richColors />
```

- [ ] **Step 4: 验证**

```bash
pnpm dev --port 3100 &
sleep 8
curl -s -o /dev/null -w "login页: %{http_code}\n" http://localhost:3100/login
kill %1
pnpm lint && pnpm type-check
```

Expected: login 页 200；lint/type-check 通过（完整登录 E2E 在 Task 10）

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 登录页（RHF + Zod + shadcn Form）"
```

---

### Task 9: Dashboard 骨架

**Files:**
- Create: `src/app/dashboard/layout.tsx`、`src/app/dashboard/page.tsx`、`src/components/dashboard-shell.tsx`
- Modify: `src/app/page.tsx`（首页重定向到 /dashboard）

**Interfaces:**
- Consumes: Task 6 的 `auth`（`@/lib/auth`）与 `session.user`（`{ id, name, role }`）
- Produces: `/dashboard` 受保护布局：侧边栏（仅"首页"）+ 顶栏（用户名 + 退出登录）

- [ ] **Step 1: 布局外壳（客户端组件，含退出）**

`src/components/dashboard-shell.tsx`：

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Home } from "lucide-react";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "首页", icon: Home },
];

export function DashboardShell({
  user,
  children,
}: {
  user: { name?: string | null };
  children: React.ReactNode;
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
                pathname === item.href && "bg-muted font-medium"
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
```

- [ ] **Step 2: dashboard 布局（服务端 session 校验）与首页**

`src/app/dashboard/layout.tsx`：

```tsx
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { auth } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <DashboardShell user={session.user}>{children}</DashboardShell>;
}
```

`src/app/dashboard/page.tsx`：

```tsx
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth();
  return (
    <div className="text-xl font-semibold">
      欢迎，{session?.user?.name ?? "用户"}
    </div>
  );
}
```

- [ ] **Step 3: 根首页重定向**

`src/app/page.tsx` 整体替换为：

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

- [ ] **Step 4: 验证**

```bash
pnpm dev --port 3100 &
sleep 8
curl -s -o /dev/null -w "根路径: %{http_code} -> %{redirect_url}\n" http://localhost:3100/
curl -s -o /dev/null -w "dashboard未登录: %{http_code} -> %{redirect_url}\n" http://localhost:3100/dashboard
kill %1
pnpm lint && pnpm type-check
```

Expected: 根路径 307 → /dashboard；dashboard 未登录 307 → /login?callbackUrl=…；lint/type-check 通过

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Dashboard 骨架（侧边栏 + 顶栏 + 欢迎页）"
```

---

### Task 10: 端到端验证与文档收尾

**Files:**
- Modify: `README.md`、`CLAUDE.md`

**Interfaces:**
- Consumes: 前面全部任务；Task 5 记录的 admin 初始密码

- [ ] **Step 1: 三大检查全绿**

```bash
pnpm lint && pnpm type-check && pnpm build
```

Expected: 全部通过

- [ ] **Step 2: 登录 E2E（带 cookie 的会话流）**

```bash
pnpm dev --port 3100 &
sleep 8
# 1. 获取 csrf token
CSRF=$(curl -s -c /tmp/li-cookies.txt http://localhost:3100/api/auth/csrf | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')
# 2. 登录（密码用 Task 5 记录的 admin 初始密码替换 <ADMIN_PASSWORD>）
curl -s -b /tmp/li-cookies.txt -c /tmp/li-cookies.txt -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "csrfToken=${CSRF}&username=admin&password=<ADMIN_PASSWORD>&json=true" \
  http://localhost:3100/api/auth/callback/credentials
# 3. 带 session cookie 访问 dashboard
curl -s -b /tmp/li-cookies.txt -o /dev/null -w "登录后dashboard: %{http_code}\n" http://localhost:3100/dashboard
# 4. 错误密码应失败
curl -s -b /tmp/li-cookies.txt -c /tmp/li-cookies.txt -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "csrfToken=${CSRF}&username=admin&password=wrong&json=true" \
  http://localhost:3100/api/auth/callback/credentials
rm -f /tmp/li-cookies.txt
kill %1
```

Expected: 步骤 3 返回 `200`（页面含"欢迎，"）；步骤 4 返回 401 JSON（`{"error":"CredentialsSignin"...}` 或 401 状态码）

- [ ] **Step 3: 数据库终检**

```bash
PGPASSWORD=npg_3woZkbe5phvT psql "postgresql://neondb_owner:npg_3woZkbe5phvT@ep-soft-credit-ard77ji0-pooler.c-4.us-west-2.aws.neon.tech/neondb?sslmode=require" -c "\dt" -c "SELECT username, role FROM users;"
```

Expected: 4 张表（两张业务表结构未变）+ admin/admin 一行

- [ ] **Step 4: 更新 README.md**

整体替换为：

```markdown
# local-invoice

独立的发票管理应用。

## 技术栈

Next.js 16（App Router、Turbopack）· React 19 · TypeScript strict · Tailwind CSS v4 · shadcn/ui · Prisma 6 + PostgreSQL（Neon）· NextAuth v5（Credentials + JWT）

## 快速开始

```bash
pnpm install
cp .env.example .env        # 填入 DATABASE_URL 与 AUTH_SECRET
pnpm db:migrate --name init # 已有迁移时无需执行
pnpm db:seed                # 创建 admin 账号（密码见输出）
pnpm dev
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 开发服务器 |
| `pnpm build` / `pnpm start` | 生产构建 / 启动 |
| `pnpm lint` / `pnpm type-check` | 代码检查 / 类型检查 |
| `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:studio` | 迁移 / 种子 / 数据库控制台 |

## 目录结构

```
src/app/          # 页面与 API（login、dashboard、api/auth）
src/components/   # ui/（shadcn）+ dashboard-shell
src/lib/          # auth.ts（NextAuth）、prisma.ts（单例）、utils.ts
src/auth.config.ts# edge 安全认证配置（proxy.ts 用）
src/proxy.ts      # 路由保护中间件
prisma/           # schema、migrations、seed
```
```

- [ ] **Step 5: 更新 CLAUDE.md**

把「Repository Status」和「Guidance for Future Sessions」两节（已过时的空仓库描述）替换为：

```markdown
## 项目状态

已初始化的 Next.js 16 独立发票应用骨架（登录 + Dashboard 空布局）。业务功能（发票 CRUD 等）尚未开始。

## 常用命令

```bash
pnpm dev              # 开发服务器（Turbopack）
pnpm build            # 生产构建
pnpm lint             # ESLint
pnpm type-check       # tsc --noEmit
pnpm db:migrate       # prisma migrate dev
pnpm db:seed          # 创建/更新 admin 种子账号
pnpm db:studio        # Prisma Studio
```

## 架构要点

- `src/lib/auth.ts`（NextAuth v5，Credentials + JWT，查 users 表）与 `src/auth.config.ts`（edge 安全配置）分离；`src/proxy.ts`（Next 16 中间件）做 `/dashboard/*` 路由保护
- Prisma 固定 ^6.19.0（勿升 v7）；`src/lib/prisma.ts` 为 globalThis 单例；迁移已基线化（`0_init` 对应建库时的两张业务表）
- 数据库：Neon PostgreSQL；已有业务表 `accounting_invoices` / `accounting_invoice_lines`（货运发票主表+明细），骨架阶段未接入页面
- UI：shadcn/ui（neutral）+ Tailwind v4；文案与错误消息一律中文
```

保留 CLAUDE.md 中用户手写的「技术栈」整节不动。

- [ ] **Step 6: 终验与最终提交**

```bash
pnpm lint && pnpm type-check
git add -A && git commit -m "docs: README 与 CLAUDE.md 收尾"
git log --oneline
```

Expected: 10 个左右的提交，全部验证步骤通过

- [ ] **Step 7: 向用户交付**

报告：admin 初始密码、登录地址（http://localhost:3000）、验证结果汇总（lint/type-check/build/E2E/数据库终检）。

---

## Self-Review 记录

- Spec 覆盖：脚手架（T1）、shadcn+依赖（T2）、env+scripts（T3）、db pull+基线化（T4）、users+seed（T5）、认证（T6）、proxy（T7）、登录页（T8）、dashboard（T9）、验证+文档（T10）——spec 四节全覆盖；YAGNI 边界未越界
- 与 spec 的偏差：Prisma 由「最新稳定版」收紧为 `^6.19.0`（v7 配置体系破坏性变更，6.19 为与 Next 16 验证过的组合），已在 Global Constraints 注明
- 类型一致性：`authConfig`/`auth`/`handlers`（T6）↔ `proxy.ts`（T7）；`session.user.{id,role}`（T6 类型增强）↔ DashboardShell（T9）；`users` 字段名（T5 schema）↔ authorize 查询（T6）

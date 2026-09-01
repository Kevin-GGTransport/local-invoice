# local-invoice 项目骨架设计

日期：2026-09-01
状态：已获用户批准（对话中确认）

## 背景与定位

local-invoice 是一个**全新独立**的发票管理应用，与 G-G_CoreFlow_ERP 项目暂不关联（不复用其代码与架构模式）。技术栈与 ERP 一致：Next.js 16 + React 19 + TypeScript strict + Tailwind CSS v4 + shadcn/ui + Prisma + PostgreSQL + NextAuth v5。

本次交付**纯骨架**：脚手架、数据库接入、认证、登录页与 Dashboard 空布局。不含任何业务功能。

数据库为 Neon PostgreSQL（连接串见 `.env`，不入库），库中已有两张空业务表：

| 表 | 说明 |
|----|------|
| `accounting_invoices` | 发票主表（company、order_number、invoice_number 唯一、check_* 、pickup_*、drop_* 等约 34 列） |
| `accounting_invoice_lines` | 发票明细行（FK → accounting_invoices，ON DELETE CASCADE；description、quantity、unit_price、amount、sort_order） |

骨架阶段**保持这两张表原样不动**。

## 1. 脚手架与工具链

- `pnpm create next-app@latest . --ts --eslint --tailwind --app --src-dir --turbopack --import-alias "@/*"`（官方默认约定：`src/` 目录、App Router、Turbopack）
- shadcn/ui：`npx shadcn@latest init`，neutral 基础色；添加组件：button、input、label、card、form、sonner
- 依赖追加：`prisma`、`@prisma/client`（最新稳定版）、`next-auth@beta`、`bcryptjs`、`zod`、`@hookform/resolvers`、`react-hook-form`
- `.env`（gitignore，含真实 DATABASE_URL）+ `.env.example`（占位符）
- scripts：`dev`、`build`、`start`、`lint`、`type-check`（tsc --noEmit）、`db:pull`、`db:push`、`db:migrate`、`db:seed`、`db:studio`

## 2. 数据库与 Schema

- `DATABASE_URL` 指向 Neon 库；连接串中 `channel_binding=require` 参数若 Prisma 报错则去掉，保留 `sslmode=require`
- `prisma db pull` 反向导入两张现有表，生成对应 model（snake_case 命名与表一致）
- 迁移基线化（库中已有表、无迁移历史，直接 `migrate dev` 会因 drift 要求 reset，**禁止 reset**）：
  1. `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql`（此时 schema 只含两张现有表）
  2. `prisma migrate resolve --applied 0_init`
- 基线化之后再新增 `users` model：

```prisma
model users {
  id            BigInt   @id @default(autoincrement())
  username      String   @unique @db.VarChar(50)
  password_hash String   @map("password_hash")
  name          String?  @db.VarChar(100)
  role          String   @default("user") @db.VarChar(50)
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt
}
```

- `prisma migrate dev --name add_users` 生成并应用仅含 `users` 表的增量迁移（基线化后无 drift，正常执行）
- `prisma/seed.ts`：创建 admin 账号（用户名 `admin`，密码随机生成，执行后告知用户）

## 3. 认证与页面

- NextAuth v5（beta）Credentials Provider，JWT session（maxAge 30 天），`authorize` 中查 `users` 表 + `bcryptjs.compare` 校验；session 回调把 `id`、`name`、`role` 写入 JWT
- `src/proxy.ts`（Next 16 中间件）：使用 NextAuth `auth` 包装，未登录访问 `/dashboard/:path*` → 重定向 `/login?callbackUrl=...`；已登录访问 `/login` → 跳 `/dashboard`
- 页面：
  - `/login`：用户名 + 密码表单（react-hook-form + Zod + shadcn Form），失败时 toast 中文报错
  - `/dashboard`：Server Component 校验 session 后渲染布局（侧边栏 + 顶栏 + 主区），首页空状态显示「欢迎，{name}」；侧边栏仅一个"首页"入口
- API：仅 NextAuth 自带 `/api/auth/[...nextauth]`

## 4. 验证标准

| 检查 | 通过标准 |
|------|---------|
| `pnpm dev` | 服务启动无报错 |
| 登录流程 | admin 登录成功 → 进 dashboard；错误密码 → 中文 toast 报错 |
| 路由保护 | 未登录访问 `/dashboard` → 重定向 `/login` |
| `pnpm lint` / `pnpm type-check` / `pnpm build` | 全绿 |
| 数据库 | `users` 表建成、admin 记录存在；两张业务表结构原样未动 |

## 明确不做（YAGNI）

- 业务 CRUD、发票相关页面、PDF 生成
- 多数据库路由、RBAC 角色校验（`users.role` 字段预留，登录不校验角色）
- 国际化、单元测试框架、CI/CD、部署配置

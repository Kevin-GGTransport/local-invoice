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

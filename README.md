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

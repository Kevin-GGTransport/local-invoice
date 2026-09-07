/**
 * 表格视图预设 API - 列表 & 创建
 * 按当前登录用户隔离；同一 table_key 下视图名唯一；is_default 同表互斥
 */

import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { tableViewCreateSchema } from "@/lib/validations/table-view"
import {
  requireSession,
  userIdBigint,
  jsonOk,
  jsonError,
  handleDbError,
  readJsonBody,
} from "@/lib/api-helpers"

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error) return error
  const userId = userIdBigint(session)
  if (!userId) return jsonError("无效的用户身份", 401)

  const tableKey = request.nextUrl.searchParams.get("table") ?? ""

  try {
    const views = await prisma.table_views.findMany({
      where: { user_id: userId, ...(tableKey ? { table_key: tableKey } : {}) },
      orderBy: [{ is_default: "desc" }, { created_at: "asc" }],
      select: {
        id: true,
        table_key: true,
        name: true,
        config: true,
        is_default: true,
        updated_at: true,
      },
    })
    return jsonOk({ views })
  } catch (err) {
    return handleDbError(err, "加载表格视图失败")
  }
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error) return error
  const userId = userIdBigint(session)
  if (!userId) return jsonError("无效的用户身份", 401)

  const body = await readJsonBody(request)
  const parsed = tableViewCreateSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "参数不合法", 400)
  }
  const { table_key, name, config, is_default } = parsed.data

  try {
    // Neon 池化连接上交互式事务易超时（P2028），默认标记互斥改为顺序执行
    if (is_default) {
      await prisma.table_views.updateMany({
        where: { user_id: userId, table_key, is_default: true },
        data: { is_default: false },
      })
    }
    const view = await prisma.table_views.create({
      data: {
        user_id: userId,
        table_key,
        name,
        config: config as Prisma.InputJsonValue,
        is_default: is_default ?? false,
      },
    })
    return jsonOk(view, 201)
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (code === "P2002") return jsonError("同名视图已存在", 409)
    return handleDbError(err, "保存表格视图失败")
  }
}

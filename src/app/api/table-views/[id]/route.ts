/**
 * 表格视图预设 API - 更新 & 删除
 * 仅允许操作本人保存的视图；设为默认时同表其余默认视图互斥取消
 */

import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { tableViewUpdateSchema } from "@/lib/validations/table-view"
import {
  requireSession,
  userIdBigint,
  jsonOk,
  jsonError,
  handleDbError,
  readJsonBody,
} from "@/lib/api-helpers"

type Ctx = { params: Promise<{ id: string }> }

async function findOwnedView(id: string, userId: bigint) {
  const numericId = /^\d+$/.test(id) ? BigInt(id) : null
  if (!numericId) return { invalid: true as const }
  const view = await prisma.table_views.findFirst({
    where: { id: numericId, user_id: userId },
    select: { id: true, table_key: true },
  })
  if (!view) return { notFound: true as const }
  return { view }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { session, error } = await requireSession()
  if (error) return error
  const userId = userIdBigint(session)
  if (!userId) return jsonError("无效的用户身份", 401)

  const body = await readJsonBody(request)
  const parsed = tableViewUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "参数不合法", 400)
  }
  if (Object.keys(parsed.data).length === 0) return jsonError("没有需要更新的字段", 400)

  const { id } = await ctx.params
  try {
    const owned = await findOwnedView(id, userId)
    if ("invalid" in owned) return jsonError("无效的视图 ID", 400)
    if ("notFound" in owned) return jsonError("视图不存在", 404)

    // Neon 池化连接上交互式事务易超时（P2028），默认标记互斥改为顺序执行
    if (parsed.data.is_default) {
      await prisma.table_views.updateMany({
        where: { user_id: userId, table_key: owned.view.table_key, is_default: true },
        data: { is_default: false },
      })
    }
    const view = await prisma.table_views.update({
      where: { id: owned.view.id },
      data: {
        name: parsed.data.name,
        is_default: parsed.data.is_default,
        config:
          parsed.data.config === undefined
            ? undefined
            : (parsed.data.config as Prisma.InputJsonValue),
      },
    })
    return jsonOk(view)
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (code === "P2002") return jsonError("同名视图已存在", 409)
    if (code === "P2025") return jsonError("视图不存在", 404)
    return handleDbError(err, "更新表格视图失败")
  }
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { session, error } = await requireSession()
  if (error) return error
  const userId = userIdBigint(session)
  if (!userId) return jsonError("无效的用户身份", 401)

  const { id } = await ctx.params
  try {
    const owned = await findOwnedView(id, userId)
    if ("invalid" in owned) return jsonError("无效的视图 ID", 400)
    if ("notFound" in owned) return jsonError("视图不存在", 404)

    await prisma.table_views.delete({ where: { id: owned.view.id } })
    return jsonOk({ id: owned.view.id })
  } catch (err) {
    return handleDbError(err, "删除表格视图失败")
  }
}

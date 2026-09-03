/**
 * 公司管理 - 编辑（仅 admin）
 * code 不可修改；停用不影响存量发票，仅新建不可再选
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdmin, jsonOk, jsonError, handleDbError, readJsonBody } from "@/lib/api-helpers"

const patchSchema = z.object({
  name: z.string().trim().min(1, "公司名称不能为空").max(100).optional(),
  invoice_prefix: z.string().trim().max(10).nullable().optional(),
  is_active: z.boolean().optional(),
})

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin()
  if (error) return error

  const { id } = await ctx.params
  const numericId = /^\d+$/.test(id) ? BigInt(id) : null
  if (!numericId) return jsonError("无效的公司 ID", 400)

  const body = await readJsonBody(request)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "参数不合法", 400)
  }
  if (Object.keys(parsed.data).length === 0) return jsonError("没有需要更新的字段", 400)

  try {
    const company = await prisma.companies.update({
      where: { id: numericId },
      data: {
        ...parsed.data,
        invoice_prefix:
          parsed.data.invoice_prefix === undefined ? undefined : parsed.data.invoice_prefix || null,
      },
    })
    return jsonOk(company)
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (code === "P2025") return jsonError("公司不存在", 404)
    return handleDbError(err, "更新公司失败")
  }
}

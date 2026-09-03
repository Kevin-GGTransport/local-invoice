/**
 * 账单模版 - 发布（仅 admin）
 * 事务内：校验绑定完整性 → 该公司旧 active 归档 → 本模版置为 active（每公司唯一启用版）
 */

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, userIdBigint, jsonOk, jsonError, handleDbError } from "@/lib/api-helpers"
import { validateBindingForPublish, type TemplateBinding } from "@/lib/templates/types"

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAdmin()
  if (error) return error

  const { id } = await ctx.params
  if (!/^\d+$/.test(id)) return jsonError("无效的模版 ID", 400)

  try {
    const template = await prisma.invoice_templates.findUnique({ where: { id: BigInt(id) } })
    if (!template) return jsonError("模版不存在", 404)
    if (template.status === "archived") return jsonError("已归档模版不能重新发布", 400)

    const errors = validateBindingForPublish(template.binding_config as unknown as TemplateBinding)
    if (errors.length > 0) return jsonError(errors.join("；"), 400)

    await prisma.$transaction(async (tx) => {
      await tx.invoice_templates.updateMany({
        where: { company_id: template.company_id, status: "active" },
        data: { status: "archived" },
      })
      await tx.invoice_templates.update({
        where: { id: template.id },
        data: { status: "active", updated_by: userIdBigint(session) },
      })
    })

    return jsonOk({ id: template.id, status: "active" })
  } catch (err) {
    return handleDbError(err, "发布模版失败")
  }
}

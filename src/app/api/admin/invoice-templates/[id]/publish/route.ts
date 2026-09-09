/**
 * 账单模版 - 发布（仅 admin）
 * 事务内：校验绑定完整性 → 该公司旧 active 归档 → 本模版置为 active（每公司唯一启用版）
 */

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, userIdBigint, jsonOk, jsonError, handleDbError } from "@/lib/api-helpers"
import { validateBindingForPublish, type TemplateBinding, type TemplateGrid } from "@/lib/templates/types"
import { validateTemplateGrid } from "@/lib/templates/template-grid"

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAdmin()
  if (error) return error

  const { id } = await ctx.params
  if (!/^\d+$/.test(id)) return jsonError("无效的模版 ID", 400)

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM invoice_templates WHERE id = ${BigInt(id)} FOR UPDATE`
      const template = await tx.invoice_templates.findUnique({ where: { id: BigInt(id) } })
      if (!template) return jsonError("模版不存在", 404)
      if (template.status !== "draft") {
        return jsonError("模版状态已变化，仅草稿模版可发布", 409)
      }
      // 同一公司的发布串行化，防止两个草稿同时成为 active。
      await tx.$queryRaw`SELECT id FROM companies WHERE id = ${template.company_id} FOR UPDATE`

      const binding = template.binding_config as unknown as TemplateBinding
      const grid = template.grid_config as unknown as TemplateGrid
      const errors = [...validateTemplateGrid(grid, binding), ...validateBindingForPublish(binding)]
      if (errors.length > 0) return jsonError(errors.join("；"), 400)

      await tx.invoice_templates.updateMany({
        where: { company_id: template.company_id, status: "active" },
        data: { status: "archived" },
      })
      await tx.invoice_templates.update({
        where: { id: template.id },
        data: { status: "active", updated_by: userIdBigint(session) },
      })

      return jsonOk({ id: template.id, status: "active" })
    })
  } catch (err) {
    return handleDbError(err, "发布模版失败")
  }
}

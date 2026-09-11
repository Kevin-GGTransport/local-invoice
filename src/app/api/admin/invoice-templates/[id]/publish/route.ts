/**
 * 账单模版 - 发布（仅 admin）
 * 事务内：校验绑定完整性 → 发布为可用模版；公司首个发布模版自动成为默认。
 */

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, userIdBigint, jsonOk, jsonError, handleDbError } from "@/lib/api-helpers"
import { validateBindingForPublish, type TemplateGrid } from "@/lib/templates/types"
import { validateTemplateGrid } from "@/lib/templates/template-grid"
import { deriveBindingFromGrid } from "@/lib/templates/token-binding"
import { isNativeExcelGrid } from "@/lib/templates/native-excel-types"
import { validateNativeBinding, NativeExcelError } from "@/lib/templates/native-excel"
import type { TemplateBinding } from "@/lib/templates/types"

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
      // 同一公司的发布串行化，保证首个默认模版的唯一性。
      await tx.$queryRaw`SELECT id FROM companies WHERE id = ${template.company_id} FOR UPDATE`

      // 绑定由网格现场推导后校验（与打印同源），存储值仅供编辑器展示
      const grid = template.grid_config as unknown as TemplateGrid
      const native = isNativeExcelGrid(grid)
      const binding = native ? template.binding_config as unknown as TemplateBinding : deriveBindingFromGrid(grid).binding
      if (native) await validateNativeBinding(grid, binding, true)
      const errors = native ? [] : [...validateTemplateGrid(grid, binding), ...validateBindingForPublish(binding)]
      if (errors.length > 0) return jsonError(errors.join("；"), 400)

      const hasDefault = await tx.invoice_templates.findFirst({
        where: { company_id: template.company_id, status: "active", is_default: true },
        select: { id: true },
      })
      await tx.invoice_templates.update({
        where: { id: template.id },
        data: { status: "active", is_default: !hasDefault, updated_by: userIdBigint(session) },
      })

      return jsonOk({ id: template.id, status: "active", is_default: !hasDefault })
    })
  } catch (err) {
    if (err instanceof NativeExcelError) return jsonError(err.message, 400)
    return handleDbError(err, "发布模版失败")
  }
}

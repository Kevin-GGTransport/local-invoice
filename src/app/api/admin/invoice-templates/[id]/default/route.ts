import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, jsonOk, jsonError, handleDbError } from "@/lib/api-helpers"

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin()
  if (error) return error
  const { id } = await ctx.params
  if (!/^\d+$/.test(id)) return jsonError("无效的模版 ID", 400)

  try {
    return await prisma.$transaction(async (tx) => {
      const template = await tx.invoice_templates.findUnique({ where: { id: BigInt(id) } })
      if (!template) return jsonError("模版不存在", 404)
      if (template.status !== "active") return jsonError("只有已发布模版可设为默认", 400)
      await tx.$queryRaw`SELECT id FROM companies WHERE id = ${template.company_id} FOR UPDATE`
      await tx.invoice_templates.updateMany({
        where: { company_id: template.company_id, is_default: true },
        data: { is_default: false },
      })
      await tx.invoice_templates.update({ where: { id: template.id }, data: { is_default: true } })
      return jsonOk({ id: template.id, is_default: true })
    })
  } catch (err) {
    return handleDbError(err, "设置默认模版失败")
  }
}

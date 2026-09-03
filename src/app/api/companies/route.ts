/**
 * 公司列表（登录可读）—— 供表单下拉、筛选、发票号前缀与模版可用性判断
 */

import { prisma } from "@/lib/prisma"
import { requireSession, jsonOk, handleDbError } from "@/lib/api-helpers"

export async function GET() {
  const { error } = await requireSession()
  if (error) return error

  try {
    const companies = await prisma.companies.findMany({
      orderBy: [{ is_active: "desc" }, { code: "asc" }],
      include: {
        _count: {
          select: {
            invoice_templates: { where: { status: { in: ["active", "draft"] } } },
          },
        },
      },
    })
    // hasActiveTemplate 单独判断（_count 无法区分状态）
    const activeTemplateCounts = await prisma.invoice_templates.groupBy({
      by: ["company_id"],
      where: { status: "active" },
      _count: { _all: true },
    })
    const activeMap = new Map(activeTemplateCounts.map((g) => [g.company_id.toString(), g._count._all]))

    return jsonOk(
      companies.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        invoice_prefix: c.invoice_prefix,
        is_active: c.is_active,
        template_count: c._count.invoice_templates,
        active_template_count: activeMap.get(c.id.toString()) ?? 0,
        has_active_template: (activeMap.get(c.id.toString()) ?? 0) > 0,
      }))
    )
  } catch (err) {
    return handleDbError(err, "查询公司列表失败")
  }
}

/**
 * 账单模版 - 当前启用版（登录可读）
 * 开票表单的右侧实时预览使用；无启用模版返回 null
 */

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, jsonOk, handleDbError } from "@/lib/api-helpers"
import { deriveBindingFromGrid } from "@/lib/templates/token-binding"
import type { TemplateGrid } from "@/lib/templates/types"

export async function GET(request: NextRequest) {
  const { error } = await requireSession()
  if (error) return error

  try {
    const company = request.nextUrl.searchParams.get("company")?.trim()
    if (!company) return jsonOk(null)

    const template = await prisma.invoice_templates.findFirst({
      where: { status: "active", company: { code: company } },
      orderBy: { updated_at: "desc" },
      select: {
        id: true,
        name: true,
        page_config: true,
        grid_config: true,
        binding_config: true,
      },
    })
    if (!template) return jsonOk(null)
    // 绑定由网格现场推导返回（与打印同源），存量模版无需迁移
    const binding = deriveBindingFromGrid(
      template.grid_config as unknown as TemplateGrid
    ).binding
    return jsonOk({ ...template, binding_config: binding })
  } catch (err) {
    return handleDbError(err, "查询启用模版失败")
  }
}

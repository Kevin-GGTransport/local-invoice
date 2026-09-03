/**
 * 账单模版 - 当前启用版（登录可读）
 * 开票表单的右侧实时预览使用；无启用模版返回 null
 */

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, jsonOk, handleDbError } from "@/lib/api-helpers"

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
    return jsonOk(template)
  } catch (err) {
    return handleDbError(err, "查询启用模版失败")
  }
}

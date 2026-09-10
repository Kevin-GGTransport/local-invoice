/**
 * 账单模版 - 公司已发布模版（登录可读）
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

    const templates = await prisma.invoice_templates.findMany({
      where: { status: "active", company: { code: company } },
      orderBy: [{ is_default: "desc" }, { updated_at: "desc" }],
      select: {
        id: true,
        name: true,
        is_default: true,
        page_config: true,
        grid_config: true,
        binding_config: true,
      },
    })
    return jsonOk(templates.map((template) => ({
      ...template,
      binding_config: deriveBindingFromGrid(template.grid_config as unknown as TemplateGrid).binding,
    })))
  } catch (err) {
    return handleDbError(err, "查询启用模版失败")
  }
}

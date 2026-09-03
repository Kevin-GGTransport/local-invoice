/**
 * 账单模版 - 列表（仅 admin）
 * 可按公司代码筛选，返回 draft/active/archived 全部状态（不含大 JSON 配置）
 */

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, jsonOk, handleDbError } from "@/lib/api-helpers"

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const company = request.nextUrl.searchParams.get("company")?.trim()
    const templates = await prisma.invoice_templates.findMany({
      where: company ? { company: { code: company } } : undefined,
      orderBy: [{ updated_at: "desc" }],
      select: {
        id: true,
        name: true,
        status: true,
        created_at: true,
        updated_at: true,
        company: { select: { id: true, code: true, name: true } },
      },
    })
    return jsonOk(templates)
  } catch (err) {
    return handleDbError(err, "查询模版列表失败")
  }
}

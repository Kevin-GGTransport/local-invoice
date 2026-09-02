/**
 * 陆运账单 批量删除：DELETE ?ids=1,2,3（明细行随外键级联删除）
 */

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseSelectedIds } from "@/lib/finance/accounting-invoice-query"
import { requireSession, jsonOk, jsonError, handleDbError } from "@/lib/api-helpers"

export async function DELETE(request: NextRequest) {
  const { error } = await requireSession()
  if (error) return error

  try {
    const ids = parseSelectedIds(request.nextUrl.searchParams.get("ids"))
    if (!ids || ids.length === 0) {
      return jsonError("请选择要删除的记录", 400)
    }

    const result = await prisma.accounting_invoices.deleteMany({
      where: { id: { in: ids } },
    })

    return jsonOk({ count: result.count })
  } catch (err) {
    return handleDbError(err, "批量删除陆运账单失败")
  }
}

/**
 * GET /api/finance/accounting-invoices/export
 * 导出陆运账单 Excel（「Accouting 清单」三行表头格式）
 *
 * 查询参数与列表页完全一致（search/bill_to/company/billing_category/Invoice日期），同源构建 where；
 * 另支持 ids（勾选导出，优先于筛选）、sort/order
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  parseSelectedIds,
} from "@/lib/finance/accounting-invoice-query"
import { generateAccountingInvoiceExportExcel } from "@/lib/utils/accounting-invoice-export-excel"
import { readAccountingInvoices } from "@/lib/finance/accounting-invoice-read"
import { requireSession, jsonError } from "@/lib/api-helpers"

export async function GET(request: NextRequest) {
  const { error } = await requireSession()
  if (error) return error

  try {
    const params = request.nextUrl.searchParams
    const selectedIds = parseSelectedIds(params.get("ids"))

    const { rows } = await readAccountingInvoices(prisma, params, { selectedIds, take: 10000 })

    const buffer = await generateAccountingInvoiceExportExcel(
      rows.map((row) => {
        return {
          ...row,
          contract_price: row.contract_price == null ? null : Number(row.contract_price),
          invoice_price: row.invoice_price == null ? null : Number(row.invoice_price),
          check_amount: Number(row.check_amount),
        }
      })
    )

    const timestamp = new Date().toISOString().slice(0, 10)
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(`陆运账单_${timestamp}.xlsx`)}"`,
      },
    })
  } catch (error: unknown) {
    console.error("导出陆运账单失败:", error)
    return jsonError("导出陆运账单失败", 500)
  }
}

/**
 * GET /api/finance/accounting-invoices/export
 * 导出陆运账单 Excel（「Accouting 清单」三行表头格式）
 *
 * 查询参数与列表页完全一致（search/company/billing_category/Invoice日期），同源构建 where；
 * 另支持 ids（勾选导出，优先于筛选）、sort/order
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  buildAccountingInvoiceWhere,
  buildAccountingInvoiceOrderBy,
  parseSelectedIds,
} from "@/lib/finance/accounting-invoice-query"
import { generateAccountingInvoiceExportExcel } from "@/lib/utils/accounting-invoice-export-excel"
import { requireSession, jsonError } from "@/lib/api-helpers"

export async function GET(request: NextRequest) {
  const { error } = await requireSession()
  if (error) return error

  try {
    const params = request.nextUrl.searchParams
    const selectedIds = parseSelectedIds(params.get("ids"))

    const where = selectedIds && selectedIds.length > 0
      ? { id: { in: selectedIds } }
      : buildAccountingInvoiceWhere(params)

    const rows = await prisma.accounting_invoices.findMany({
      where,
      orderBy: buildAccountingInvoiceOrderBy(params),
      take: 10000,
    })

    const buffer = await generateAccountingInvoiceExportExcel(
      rows.map((row) => ({
        id: row.id,
        company: row.company,
        master_order_number: row.master_order_number,
        order_number: row.order_number,
        contract_date: row.contract_date,
        contract_price: row.contract_price == null ? null : Number(row.contract_price),
        broker_company: row.broker_company,
        broker_load_number: row.broker_load_number,
        billing_category: row.billing_category,
        invoice_number: row.invoice_number,
        invoice_date: row.invoice_date,
        invoice_price: row.invoice_price == null ? null : Number(row.invoice_price),
        check_date: row.check_date,
        check_amount: row.check_amount == null ? null : Number(row.check_amount),
        check_number: row.check_number,
        deduction: row.deduction,
        rts: row.rts,
        difference: row.difference,
        notes: row.notes,
      }))
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

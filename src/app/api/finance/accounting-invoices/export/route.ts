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
import { reconciliationSummary } from "@/lib/finance/accounting-invoice-reconciliation"
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
      include: {
        accounting_invoice_reconciliations: {
          where: { voided_at: null },
          orderBy: [{ check_date: "desc" }, { id: "desc" }],
        },
      },
    })

    const buffer = await generateAccountingInvoiceExportExcel(
      rows.map((row) => {
        const reconciliations = row.accounting_invoice_reconciliations
        const summary = reconciliationSummary(
          row.invoice_price,
          reconciliations.map((item) => item.check_amount)
        )
        return {
        id: row.id,
        company: row.company,
        master_order_number: row.master_order_number,
        order_number: row.order_number,
        contract_date: row.contract_date,
        contract_price: row.contract_price == null ? null : Number(row.contract_price),
        bill_to: row.bill_to,
        broker_load_number: row.broker_load_number,
        billing_category: row.billing_category,
        invoice_number: row.invoice_number,
        invoice_date: row.invoice_date,
        invoice_price: row.invoice_price == null ? null : Number(row.invoice_price),
        check_date: reconciliations[0]?.check_date ?? null,
        check_amount: reconciliations.length > 0 ? Number(summary.paid_amount) : null,
        check_number: reconciliations.length > 0 ? reconciliations.map((item) => item.check_number).join("/") : null,
        deduction: row.deduction,
        rts: row.rts,
        difference: summary.difference,
        notes: row.notes,
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

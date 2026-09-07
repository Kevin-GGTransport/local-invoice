/**
 * GET /api/finance/accounting-invoices/import-template
 * 下载账单导入模板（.xlsx：18 列表头 + 填写说明），响应头与导出接口一致
 */

import { NextResponse } from "next/server"
import { requireSession, jsonError } from "@/lib/api-helpers"
import { generateAccountingInvoiceImportTemplate } from "@/lib/finance/accounting-invoice-import"

export async function GET() {
  const { error } = await requireSession()
  if (error) return error

  try {
    const buffer = await generateAccountingInvoiceImportTemplate()
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent("账单导入模板.xlsx")}"`,
      },
    })
  } catch (error: unknown) {
    console.error("生成账单导入模板失败:", error)
    return jsonError("生成账单导入模板失败", 500)
  }
}

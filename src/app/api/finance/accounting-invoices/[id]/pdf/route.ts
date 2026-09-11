/**
 * 陆运账单 PDF（一单一份），浏览器 inline 打开
 */

import { NextRequest, NextResponse } from "next/server"
import { generateAccountingInvoicePdf } from "@/lib/services/print/accounting-invoice-pdf.service"
import { requireSession, jsonError } from "@/lib/api-helpers"
import { NativeExcelError } from "@/lib/templates/native-excel"

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { error } = await requireSession()
  if (error) return error

  try {
    const { id } = await context.params
    if (!id || !/^\d+$/.test(id)) {
      return jsonError("无效的记录 ID", 400)
    }

    const excel = _request.nextUrl.searchParams.get('format') === 'xlsx'
    const result = await generateAccountingInvoicePdf(BigInt(id), excel ? 'xlsx' : 'pdf')
    if (result.status === "not_found") {
      return jsonError("记录不存在", 404)
    }
    if (result.status === "unsupported") {
      return jsonError(excel ? '该账单未使用原 Excel 模板，请继续使用原有 PDF 打印' : `公司「${result.company}」暂无 PDF 模版`, 400)
    }

    const safeName = result.invoiceNumber.replace(/[/\\?%*:|"<>]/g, "-")
    const filename = `${safeName}.${excel ? 'xlsx' : 'pdf'}`

    return new NextResponse(result.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": excel ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : "application/pdf",
        "Content-Disposition": `${excel ? 'attachment' : 'inline'}; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error: unknown) {
    if (error instanceof NativeExcelError) return jsonError(error.message, 422)
    console.error("打印Invoice PDF失败:", error)
    return jsonError("打印Invoice PDF失败", 500)
  }
}

/**
 * 陆运账单 PDF（一单一份），浏览器 inline 打开
 */

import { NextRequest, NextResponse } from "next/server"
import { generateAccountingInvoicePdf } from "@/lib/services/print/accounting-invoice-pdf.service"
import { requireSession, jsonError } from "@/lib/api-helpers"

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

    const result = await generateAccountingInvoicePdf(BigInt(id))
    if (result.status === "not_found") {
      return jsonError("记录不存在", 404)
    }
    if (result.status === "unsupported") {
      return jsonError(`公司「${result.company}」暂无 PDF 模版`, 400)
    }

    const safeName = result.invoiceNumber.replace(/[/\\?%*:|"<>]/g, "-")
    const filename = `${safeName}.pdf`

    return new NextResponse(result.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error: unknown) {
    console.error("打印Invoice PDF失败:", error)
    return jsonError("打印Invoice PDF失败", 500)
  }
}

/**
 * 陆运账单 批量 PDF：?ids=1,2,3（最多 40 条），按 id 顺序合并成一个 PDF
 * 所选记录的公司必须有 PDF 模版，否则整批 400
 */

import { NextRequest, NextResponse } from "next/server"
import { generateAccountingInvoicePdf } from "@/lib/services/print/accounting-invoice-pdf.service"
import { mergePdfBuffers } from "@/lib/services/print/merge-pdf"
import { requireSession, jsonError } from "@/lib/api-helpers"

const MAX_BATCH = 40

export async function GET(request: NextRequest) {
  const { error } = await requireSession()
  if (error) return error

  try {
    const idsParam = request.nextUrl.searchParams.get("ids") ?? ""
    const ids = [...new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean))]
    if (ids.length === 0) {
      return jsonError("请选择要打印的记录", 400)
    }
    if (ids.length > MAX_BATCH) {
      return jsonError(`一次最多打印 ${MAX_BATCH} 条`, 400)
    }
    if (ids.some((id) => !/^\d+$/.test(id))) {
      return jsonError("无效的记录 ID", 400)
    }

    const results = await Promise.all(ids.map((id) => generateAccountingInvoicePdf(BigInt(id))))

    const notFound = ids.filter((_, i) => results[i].status === "not_found")
    if (notFound.length > 0) {
      return jsonError(`记录不存在：${notFound.join(", ")}`, 404)
    }
    const unsupported = [
      ...new Set(
        results
          .filter((r) => r.status === "unsupported")
          .map((r) => (r as { company: string }).company)
      ),
    ]
    if (unsupported.length > 0) {
      return jsonError(`以下公司暂无 PDF 模版：${unsupported.join("、")}`, 400)
    }

    const buffers = results.map((r) => (r as { buffer: Buffer }).buffer)
    const merged = await mergePdfBuffers(buffers)

    return new NextResponse(merged as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${encodeURIComponent(`陆运账单_${buffers.length}份.pdf`)}"`,
      },
    })
  } catch (error: unknown) {
    console.error("批量打印Invoice PDF失败:", error)
    return jsonError("批量打印Invoice PDF失败", 500)
  }
}

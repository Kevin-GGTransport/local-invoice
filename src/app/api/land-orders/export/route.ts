import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { jsonError, requireSession } from "@/lib/api-helpers"
import { LandOrderQueryError, readLandOrders } from "@/lib/land-orders/query"
import { parseLandOrderIds } from "@/lib/land-orders/server"
import { generateLandOrderExportExcel } from "@/lib/land-orders/export-excel"

export async function GET(request: NextRequest) {
  const { error } = await requireSession()
  if (error) return error

  try {
    const params = request.nextUrl.searchParams
    const selectedIds = parseLandOrderIds(params.get("ids"))
    const result = await readLandOrders(prisma, params, {
      skip: 0,
      take: 10_000,
      count: true,
      selectedIds: selectedIds.length ? selectedIds : null,
      rejectIfOverTake: true,
    })
    if (result.exceededLimit) {
      return jsonError("导出结果超过 10000 条，请缩小筛选范围后重试", 413)
    }
    const rows = result.rows
    const buffer = await generateLandOrderExportExcel(rows)
    const timestamp = new Date().toISOString().slice(0, 10)
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(`陆运订单清单_${timestamp}.xlsx`)}"`,
      },
    })
  } catch (error) {
    if (error instanceof LandOrderQueryError) return jsonError(error.message, 400)
    console.error("导出路程规划表失败", error)
    return jsonError("导出路程规划表失败", 500)
  }
}

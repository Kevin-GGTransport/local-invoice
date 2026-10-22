import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { jsonError, requireSession } from "@/lib/api-helpers"
import {
  LandDispatchQueryError,
  readLandDispatches,
} from "@/lib/land-orders/dispatch"
import { parseLandOrderIds } from "@/lib/land-orders/server"
import { generateLandDispatchPlanningExcel } from "@/lib/land-orders/dispatch-export-excel"

export async function GET(request: NextRequest) {
  const { error } = await requireSession()
  if (error) return error
  try {
    const params = request.nextUrl.searchParams
    const ids = parseLandOrderIds(params.get("ids"))
    const result = await readLandDispatches(prisma, params, {
      skip: 0,
      take: 10_000,
      count: true,
      ids,
      rejectIfOverTake: true,
    })
    if (result.exceededLimit) {
      return jsonError("导出结果超过 10000 条，请缩小筛选范围后重试", 413)
    }
    const buffer = await generateLandDispatchPlanningExcel(result.rows)
    const timestamp = new Date().toISOString().slice(0, 10)
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(`长途排车表_${timestamp}.xlsx`)}"`,
      },
    })
  } catch (error) {
    if (error instanceof LandDispatchQueryError) return jsonError(error.message, 400)
    console.error("导出排车表失败", error)
    return jsonError("导出排车表失败", 500)
  }
}

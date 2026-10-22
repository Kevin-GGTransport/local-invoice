import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { jsonError, jsonOk, readJsonBody, requireSession, userIdBigint } from "@/lib/api-helpers"
import { landOrderCreateSchema } from "@/lib/land-orders/validation"
import { LandOrderQueryError, readLandOrders } from "@/lib/land-orders/query"
import {
  parseLandOrderIds,
  toLandOrderCreateData,
  toLandOrderStopCreateData,
} from "@/lib/land-orders/server"

export async function GET(request: NextRequest) {
  const { error } = await requireSession()
  if (error) return error

  try {
    const params = request.nextUrl.searchParams
    const page = Math.max(1, Number(params.get("page")) || 1)
    const pageSize = Math.min(500, Math.max(1, Number(params.get("pageSize")) || 100))
    const result = await readLandOrders(prisma, params, {
      skip: (page - 1) * pageSize,
      take: pageSize,
      count: true,
    })
    return jsonOk({
      rows: result.rows,
      pagination: { total: result.total ?? 0, page, pageSize },
    })
  } catch (error) {
    if (error instanceof LandOrderQueryError) return jsonError(error.message, 400)
    console.error("查询陆运订单失败", error)
    return jsonError("查询陆运订单失败", 500)
  }
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error) return error

  try {
    const parsed = landOrderCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "参数校验失败", 400)
    }
    const createdBy = userIdBigint(session)
    const order = await prisma.$transaction(async (tx) => {
      const data = toLandOrderCreateData(parsed.data)
      if (createdBy != null) data.created_by = createdBy
      const created = await tx.land_orders.create({ data })
      await tx.land_order_stops.createMany({
        data: toLandOrderStopCreateData(parsed.data.stops, created.id),
      })
      return tx.land_orders.findUniqueOrThrow({
        where: { id: created.id },
        include: { land_order_stops: { orderBy: { sequence: "asc" } } },
      })
    })
    return jsonOk(order, 201)
  } catch (error) {
    console.error("创建陆运订单失败", error)
    return jsonError("创建陆运订单失败", 500)
  }
}

export async function DELETE(request: NextRequest) {
  const { error } = await requireSession()
  if (error) return error

  try {
    const ids = parseLandOrderIds(request.nextUrl.searchParams.get("ids"))
    if (ids.length === 0) return jsonError("请选择要删除的订单", 400)
    const result = await prisma.land_orders.deleteMany({ where: { id: { in: ids } } })
    return jsonOk({ count: result.count, ids: ids.map(String) })
  } catch (error) {
    console.error("批量删除陆运订单失败", error)
    return jsonError("批量删除陆运订单失败", 500)
  }
}

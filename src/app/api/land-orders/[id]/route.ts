import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { jsonError, jsonOk, readJsonBody, requireSession, userIdBigint } from "@/lib/api-helpers"
import { landOrderCreateSchema, landOrderPatchSchema } from "@/lib/land-orders/validation"
import {
  parseLandOrderId,
  toLandOrderPatchData,
  toLandOrderStopCreateData,
  toLandOrderUpdateData,
} from "@/lib/land-orders/server"

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
  const { error } = await requireSession()
  if (error) return error

  try {
    const id = parseLandOrderId((await params).id)
    if (!id) return jsonError("无效的订单 ID", 400)
    const order = await prisma.land_orders.findUnique({
      where: { id },
      include: { land_order_stops: { orderBy: { sequence: "asc" } } },
    })
    if (!order) return jsonError("订单不存在", 404)
    return jsonOk(order)
  } catch (error) {
    console.error("查询陆运订单失败", error)
    return jsonError("查询陆运订单失败", 500)
  }
}

export async function PUT(request: NextRequest, { params }: Context) {
  const { session, error } = await requireSession()
  if (error) return error

  try {
    const id = parseLandOrderId((await params).id)
    if (!id) return jsonError("无效的订单 ID", 400)
    const parsed = landOrderCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "参数校验失败", 400)
    }

    const updatedBy = userIdBigint(session)
    const order = await prisma.$transaction(async (tx) => {
      const data = toLandOrderUpdateData(parsed.data)
      if (updatedBy != null) data.updated_by = updatedBy
      await tx.land_orders.update({ where: { id }, data })
      await tx.land_order_stops.deleteMany({ where: { land_order_id: id } })
      await tx.land_order_stops.createMany({
        data: toLandOrderStopCreateData(parsed.data.stops, id),
      })
      return tx.land_orders.findUniqueOrThrow({
        where: { id },
        include: { land_order_stops: { orderBy: { sequence: "asc" } } },
      })
    })
    return jsonOk(order)
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code === "P2025") return jsonError("订单不存在", 404)
    console.error("更新陆运订单失败", error)
    return jsonError("更新陆运订单失败", 500)
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const { session, error } = await requireSession()
  if (error) return error

  try {
    const id = parseLandOrderId((await params).id)
    if (!id) return jsonError("无效的订单 ID", 400)
    const parsed = landOrderPatchSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "参数校验失败", 400)
    }
    const data = toLandOrderPatchData(parsed.data)
    const updatedBy = userIdBigint(session)
    if (updatedBy != null) data.updated_by = updatedBy
    const [order] = await prisma.$transaction([
      prisma.land_orders.update({
        where: { id },
        data,
        include: { land_order_stops: { orderBy: { sequence: "asc" } } },
      }),
    ])
    return jsonOk(order)
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code === "P2025") return jsonError("订单不存在", 404)
    console.error("快速更新陆运订单失败", error)
    return jsonError("快速更新陆运订单失败", 500)
  }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const { error } = await requireSession()
  if (error) return error

  try {
    const id = parseLandOrderId((await params).id)
    if (!id) return jsonError("无效的订单 ID", 400)
    await prisma.land_orders.delete({ where: { id } })
    return jsonOk({ id: String(id) })
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code === "P2025") return jsonError("订单不存在", 404)
    console.error("删除陆运订单失败", error)
    return jsonError("删除陆运订单失败", 500)
  }
}

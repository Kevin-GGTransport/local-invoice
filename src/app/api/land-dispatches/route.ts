import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { jsonError, jsonOk, readJsonBody, requireSession, userIdBigint } from "@/lib/api-helpers"
import { landDispatchCreateSchema } from "@/lib/land-orders/validation"
import {
  LandDispatchQueryError,
  readLandDispatches,
} from "@/lib/land-orders/dispatch"
import { parseLandOrderIds, toLandDispatchCreateData } from "@/lib/land-orders/server"

export async function GET(request: NextRequest) {
  const { error } = await requireSession()
  if (error) return error
  try {
    const params = request.nextUrl.searchParams
    const page = Math.max(1, Number(params.get("page")) || 1)
    const pageSize = Math.min(500, Math.max(1, Number(params.get("pageSize")) || 100))
    const result = await readLandDispatches(prisma, params, {
      skip: (page - 1) * pageSize,
      take: pageSize,
      count: true,
    })
    return jsonOk({
      rows: result.rows,
      pagination: { total: result.total ?? 0, page, pageSize },
    })
  } catch (error) {
    if (error instanceof LandDispatchQueryError) return jsonError(error.message, 400)
    console.error("查询排车表失败", error)
    return jsonError("查询排车表失败", 500)
  }
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error) return error
  try {
    const parsed = landDispatchCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "参数校验失败", 400)
    }
    const data = toLandDispatchCreateData(parsed.data)
    const createdBy = userIdBigint(session)
    if (createdBy != null) data.created_by = createdBy
    const created = await prisma.land_dispatch_items.create({
      data,
      include: {
        land_orders: { include: { land_order_stops: { orderBy: { sequence: "asc" } } } },
      },
    })
    return jsonOk(created, 201)
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code === "P2002") return jsonError("该订单已在排车表中", 409)
    if (code === "P2025") return jsonError("陆运订单不存在", 404)
    console.error("创建排车记录失败", error)
    return jsonError("创建排车记录失败", 500)
  }
}

export async function DELETE(request: NextRequest) {
  const { error } = await requireSession()
  if (error) return error
  try {
    const ids = parseLandOrderIds(request.nextUrl.searchParams.get("ids"))
    if (!ids.length) return jsonError("请选择要删除的排车记录", 400)
    const result = await prisma.land_dispatch_items.deleteMany({ where: { id: { in: ids } } })
    return jsonOk({ count: result.count })
  } catch (error) {
    console.error("批量删除排车记录失败", error)
    return jsonError("批量删除排车记录失败", 500)
  }
}

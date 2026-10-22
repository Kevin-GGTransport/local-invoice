import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { jsonError, jsonOk, readJsonBody, requireSession, userIdBigint } from "@/lib/api-helpers"
import {
  landDispatchPatchSchema,
} from "@/lib/land-orders/validation"
import { parseLandOrderId, toLandDispatchUpdateData } from "@/lib/land-orders/server"

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
  const { error } = await requireSession()
  if (error) return error
  try {
    const id = parseLandOrderId((await params).id)
    if (!id) return jsonError("无效的排车记录 ID", 400)
    const item = await prisma.land_dispatch_items.findUnique({
      where: { id },
      include: {
        land_orders: { include: { land_order_stops: { orderBy: { sequence: "asc" } } } },
      },
    })
    if (!item) return jsonError("排车记录不存在", 404)
    return jsonOk(item)
  } catch (error) {
    console.error("查询排车记录失败", error)
    return jsonError("查询排车记录失败", 500)
  }
}

export async function PUT(request: NextRequest, { params }: Context) {
  return PATCH(request, { params })
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const { session, error } = await requireSession()
  if (error) return error
  try {
    const id = parseLandOrderId((await params).id)
    if (!id) return jsonError("无效的排车记录 ID", 400)
    const parsed = landDispatchPatchSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "参数校验失败", 400)
    }
    const data = toLandDispatchUpdateData(parsed.data)
    const updatedBy = userIdBigint(session)
    if (updatedBy != null) data.updated_by = updatedBy
    const item = await prisma.land_dispatch_items.update({
      where: { id },
      data,
      include: {
        land_orders: { include: { land_order_stops: { orderBy: { sequence: "asc" } } } },
      },
    })
    return jsonOk(item)
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code === "P2025") return jsonError("排车记录不存在", 404)
    console.error("更新排车记录失败", error)
    return jsonError("更新排车记录失败", 500)
  }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const { error } = await requireSession()
  if (error) return error
  const id = parseLandOrderId((await params).id)
  if (!id) return jsonError("无效的排车记录 ID", 400)
  try {
    await prisma.land_dispatch_items.delete({ where: { id } })
    return jsonOk({ id: String(id) })
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code === "P2025") return jsonError("排车记录不存在", 404)
    console.error("删除排车记录失败", error)
    return jsonError("删除排车记录失败", 500)
  }
}

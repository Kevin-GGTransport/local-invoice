import { Prisma } from "@prisma/client"
import {
  LAND_DISPATCH_HAUL_TYPES,
  LAND_DISPATCH_STATUSES,
  isRealIsoDate,
} from "./validation"
import {
  buildLandOrderPlanningRow,
  LAND_DISPATCH_HAUL_TYPE_LABELS,
  type LandOrderPlanningRow,
  type LandOrderPlanningSource,
} from "./planning"
import { parseSelectedLandOrderIds } from "./query"

export { LAND_DISPATCH_HAUL_TYPE_LABELS }

export const LAND_DISPATCH_SORT_FIELDS = [
  "dispatch_date",
  "truck",
  "driver",
  "trailer",
  "haul_type",
  "status",
  "load_number",
  "sort_order",
] as const

export type LandDispatchSortField = (typeof LAND_DISPATCH_SORT_FIELDS)[number]

export class LandDispatchQueryError extends Error {}

export type LandDispatchPlanningSource = {
  id: string | bigint
  land_order_id: string | bigint
  dispatch_date: Date | string
  truck?: string | null
  driver?: string | null
  trailer?: string | null
  haul_type: string
  status: string
  todo_note?: string | null
  todo_done: boolean
  sort_order?: number
  land_orders: LandOrderPlanningSource
}

export type LandDispatchPlanningRow = Omit<
  LandOrderPlanningRow,
  "id" | "status"
> & {
  id: string
  land_order_id: string
  dispatch_date: string
  truck: string | null
  driver: string | null
  trailer: string | null
  haul_type: string
  dispatch_status: string
  todo_note: string | null
  todo_done: boolean
  sort_order: number
}

export const LAND_DISPATCH_STATUS_LABELS: Record<string, string> = {
  planned: "已排车",
  dispatched: "已出车",
  completed: "已完成",
  cancelled: "已取消",
}

function textFilter(value: string): Prisma.StringFilter {
  return { contains: value, mode: "insensitive" }
}

function bounded(value: string, label: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed.length > max) throw new LandDispatchQueryError(`${label}不能超过 ${max} 个字符`)
  return trimmed
}

function optionalEnum(
  value: string,
  allowed: readonly string[],
  label: string
): string {
  const trimmed = value.trim()
  if (!trimmed || allowed.includes(trimmed)) return trimmed
  throw new LandDispatchQueryError(`${label}无效`)
}

function dateFilter(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (!isRealIsoDate(trimmed)) {
    throw new LandDispatchQueryError(`${label}格式应为 YYYY-MM-DD 且日期必须真实存在`)
  }
  return trimmed
}

export function parseLandDispatchQuery(params: URLSearchParams) {
  const sortRaw = params.get("sort") ?? "dispatch_date"
  const sort = LAND_DISPATCH_SORT_FIELDS.find((field) => field === sortRaw)
  if (!sort) throw new LandDispatchQueryError("排序字段无效")
  const orderRaw = (params.get("order") ?? "asc").toLowerCase()
  if (orderRaw !== "asc" && orderRaw !== "desc") {
    throw new LandDispatchQueryError("排序方向无效")
  }
  const dateFrom = dateFilter(params.get("dateFrom") ?? "", "开始日期")
  const dateTo = dateFilter(params.get("dateTo") ?? "", "结束日期")
  return {
    q: bounded(params.get("q") ?? "", "搜索关键词", 100),
    truck: bounded(params.get("truck") ?? "", "车牌/标识", 50),
    driver: bounded(params.get("driver") ?? "", "司机", 100),
    haulType: optionalEnum(
      params.get("haulType") ?? "",
      LAND_DISPATCH_HAUL_TYPES,
      "运输类型"
    ),
    status: optionalEnum(
      params.get("status") ?? "",
      LAND_DISPATCH_STATUSES,
      "排车状态"
    ),
    todoDone: optionalEnum(params.get("todoDone") ?? "", ["done", "undone"], "Todo 状态"),
    dateFrom,
    dateTo,
    sort,
    order: orderRaw as "asc" | "desc",
  }
}

function buildWhere(filters: ReturnType<typeof parseLandDispatchQuery>, ids: bigint[]) {
  const and: Prisma.land_dispatch_itemsWhereInput[] = []
  if (ids.length) and.push({ id: { in: ids } })

  const dispatchDate: Prisma.DateTimeFilter = {}
  if (filters.dateFrom) {
    dispatchDate.gte = new Date(`${filters.dateFrom}T00:00:00.000Z`)
  }
  if (filters.dateTo) {
    dispatchDate.lte = new Date(`${filters.dateTo}T00:00:00.000Z`)
  }
  if (dispatchDate.gte != null || dispatchDate.lte != null) {
    and.push({ dispatch_date: dispatchDate })
  }
  if (filters.truck) and.push({ truck: textFilter(filters.truck) })
  if (filters.driver) and.push({ driver: textFilter(filters.driver) })
  if (filters.haulType) and.push({ haul_type: filters.haulType })
  if (filters.status) and.push({ status: filters.status })
  if (filters.todoDone === "done") and.push({ todo_done: true })
  if (filters.todoDone === "undone") and.push({ todo_done: false })
  if (filters.q) {
    and.push({
      OR: [
        { truck: textFilter(filters.q) },
        { driver: textFilter(filters.q) },
        { trailer: textFilter(filters.q) },
        { todo_note: textFilter(filters.q) },
        {
          land_orders: {
            OR: [
              { identifier: textFilter(filters.q) },
              { operating_company: textFilter(filters.q) },
              { load_number: textFilter(filters.q) },
              { broker: textFilter(filters.q) },
              { dispatch_person: textFilter(filters.q) },
              { delivery_person: textFilter(filters.q) },
              { note: textFilter(filters.q) },
              {
                land_order_stops: {
                  some: {
                    OR: [
                      { company_name: textFilter(filters.q) },
                      { address: textFilter(filters.q) },
                      { city: textFilter(filters.q) },
                      { state: textFilter(filters.q) },
                      { zip_code: textFilter(filters.q) },
                      { reference_numbers: textFilter(filters.q) },
                      { stop_note: textFilter(filters.q) },
                    ],
                  },
                },
              },
            ],
          },
        },
      ],
    })
  }
  return and.length ? { AND: and } : {}
}

function orderBy(
  field: LandDispatchSortField,
  direction: "asc" | "desc"
): Prisma.land_dispatch_itemsOrderByWithRelationInput[] {
  const order = direction
  if (field === "load_number") {
    return [
      { land_orders: { load_number: order } },
      { dispatch_date: order },
      { sort_order: order },
      { id: order },
    ]
  }
  return [{ [field]: order }, { sort_order: order }, { id: order }]
}

export function buildLandDispatchPlanningRow(
  item: LandDispatchPlanningSource
): LandDispatchPlanningRow {
  const order = buildLandOrderPlanningRow(item.land_orders)
  const { status, ...orderWithoutStatus } = order
  void status
  return {
    ...orderWithoutStatus,
    id: String(item.id),
    land_order_id: String(item.land_order_id),
    dispatch_date:
      item.dispatch_date instanceof Date
        ? item.dispatch_date.toISOString().slice(0, 10)
        : String(item.dispatch_date).slice(0, 10),
    truck: item.truck ?? null,
    driver: item.driver ?? null,
    trailer: item.trailer ?? null,
    haul_type: item.haul_type,
    dispatch_status: item.status,
    todo_note: item.todo_note ?? null,
    todo_done: item.todo_done,
    sort_order: item.sort_order ?? 0,
  }
}

export async function readLandDispatches(
  tx: Pick<Prisma.TransactionClient, "land_dispatch_items">,
  params: URLSearchParams,
  options: {
    skip?: number
    take: number
    count?: boolean
    ids?: bigint[]
    rejectIfOverTake?: boolean
  }
) {
  const filters = parseLandDispatchQuery(params)
  const ids = options.ids?.length
    ? options.ids
    : (() => {
        const raw = params.get("ids")
        if (!raw) return []
        return parseSelectedLandOrderIds(raw)
      })()
  const where = buildWhere(filters, ids)
  const total = options.count ? await tx.land_dispatch_items.count({ where }) : undefined
  if (total != null && options.rejectIfOverTake && total > options.take) {
    return {
      rows: [] as LandDispatchPlanningRow[],
      total,
      exceededLimit: true as const,
    }
  }

  const items = await tx.land_dispatch_items.findMany({
    where,
    include: {
      land_orders: { include: { land_order_stops: { orderBy: { sequence: "asc" } } } },
    },
    orderBy: orderBy(filters.sort, filters.order),
    skip: options.skip ?? 0,
    take: options.take,
  })
  return {
    rows: items.map((item) =>
      buildLandDispatchPlanningRow(item as unknown as LandDispatchPlanningSource)
    ),
    total,
    exceededLimit: false as const,
  }
}

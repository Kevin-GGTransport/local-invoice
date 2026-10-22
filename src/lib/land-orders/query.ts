import { Prisma } from "@prisma/client"
import {
  LAND_ORDER_HAUL_TYPES,
  LAND_ORDER_SORT_FIELDS_SAFE,
  LAND_ORDER_STATUSES,
  isRealIsoDate,
} from "./validation"
import {
  buildLandOrderPlanningRow,
  type LandOrderPlanningRow,
  type LandOrderPlanningSource,
} from "./planning"

export const LAND_ORDER_SORT_FIELDS = LAND_ORDER_SORT_FIELDS_SAFE
export type LandOrderSortField = (typeof LAND_ORDER_SORT_FIELDS)[number]

const POSTGRES_BIGINT_MAX = BigInt("9223372036854775807")

export class LandOrderQueryError extends Error {}

export function parseSelectedLandOrderIds(value: string | null): bigint[] {
  if (!value) return []
  const unique = new Set<string>()
  for (const item of value.split(",")) {
    const candidate = item.trim()
    if (!/^[1-9]\d*$/.test(candidate)) continue
    if (BigInt(candidate) <= POSTGRES_BIGINT_MAX) unique.add(candidate)
  }
  return [...unique].slice(0, 10_000).map(BigInt)
}

type ParsedLandOrderQuery = {
  q: string
  company: string
  status: string
  driver: string
  haulType: string
  todoDone: string
  dateFrom: string
  dateTo: string
  sort: LandOrderSortField
  order: "asc" | "desc"
}

function boundedFilter(value: string, label: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed.length > max) throw new LandOrderQueryError(`${label}不能超过 ${max} 个字符`)
  return trimmed
}

function enumFilter(value: string, allowed: readonly string[], label: string): string {
  const trimmed = value.trim()
  if (!trimmed || allowed.includes(trimmed)) return trimmed
  throw new LandOrderQueryError(`${label}无效`)
}

function dateFilter(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (!isRealIsoDate(trimmed)) {
    throw new LandOrderQueryError(`${label}格式应为 YYYY-MM-DD 且日期必须真实存在`)
  }
  return trimmed
}

export function parseLandOrderQuery(params: URLSearchParams): ParsedLandOrderQuery {
  const sortRaw = params.get("sort") ?? "pickup_date"
  const sort = LAND_ORDER_SORT_FIELDS.find((field) => field === sortRaw)
  if (!sort) throw new LandOrderQueryError("排序字段无效")
  const orderRaw = (params.get("order") ?? "asc").toLowerCase()
  if (orderRaw !== "asc" && orderRaw !== "desc") throw new LandOrderQueryError("排序方向无效")

  return {
    q: boundedFilter(params.get("q") ?? "", "搜索关键词", 100),
    company: boundedFilter(params.get("company") ?? "", "公司", 20).toUpperCase(),
    status: enumFilter(params.get("status") ?? "", LAND_ORDER_STATUSES, "状态"),
    driver: boundedFilter(params.get("driver") ?? "", "司机", 100),
    haulType: enumFilter(params.get("haulType") ?? "", LAND_ORDER_HAUL_TYPES, "运输类型"),
    todoDone: enumFilter(params.get("todoDone") ?? "", ["done", "undone"], "Todo 状态"),
    dateFrom: dateFilter(params.get("dateFrom") ?? "", "开始日期"),
    dateTo: dateFilter(params.get("dateTo") ?? "", "结束日期"),
    sort,
    order: orderRaw,
  }
}

function buildSqlWhere(filters: ParsedLandOrderQuery, selectedIds: bigint[]): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`]

  if (selectedIds.length) {
    conditions.push(Prisma.sql`o.id IN (${Prisma.join(selectedIds)})`)
  }
  if (filters.q) {
    const pattern = `%${filters.q}%`
    conditions.push(Prisma.sql`(
      o.identifier ILIKE ${pattern}
      OR o.company_code ILIKE ${pattern}
      OR o.load_number ILIKE ${pattern}
      OR o.broker ILIKE ${pattern}
      OR o.driver ILIKE ${pattern}
      OR o.trailer ILIKE ${pattern}
      OR o.dispatch_person ILIKE ${pattern}
      OR o.delivery_person ILIKE ${pattern}
      OR o.note ILIKE ${pattern}
      OR o.todo_note ILIKE ${pattern}
      OR EXISTS (
        SELECT 1 FROM land_order_stops st
        WHERE st.land_order_id = o.id
          AND (
            st.company_name ILIKE ${pattern}
            OR st.address ILIKE ${pattern}
            OR st.city ILIKE ${pattern}
            OR st.state ILIKE ${pattern}
            OR st.zip_code ILIKE ${pattern}
            OR st.reference_numbers ILIKE ${pattern}
            OR st.stop_note ILIKE ${pattern}
          )
      )
    )`)
  }
  if (filters.company) conditions.push(Prisma.sql`o.company_code = ${filters.company}`)
  if (filters.status) conditions.push(Prisma.sql`o.status = ${filters.status}`)
  if (filters.driver) conditions.push(Prisma.sql`o.driver ILIKE ${`%${filters.driver}%`}`)
  if (filters.haulType) conditions.push(Prisma.sql`o.haul_type = ${filters.haulType}`)
  if (filters.todoDone === "done") conditions.push(Prisma.sql`o.todo_done = TRUE`)
  if (filters.todoDone === "undone") conditions.push(Prisma.sql`o.todo_done = FALSE`)

  const stopDateConditions: Prisma.Sql[] = []
  if (filters.dateFrom) {
    stopDateConditions.push(
      Prisma.sql`st.stop_date >= ${new Date(`${filters.dateFrom}T00:00:00.000Z`)}`
    )
  }
  if (filters.dateTo) {
    stopDateConditions.push(
      Prisma.sql`st.stop_date <= ${new Date(`${filters.dateTo}T00:00:00.000Z`)}`
    )
  }
  if (stopDateConditions.length) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM land_order_stops st
      WHERE st.land_order_id = o.id
        AND st.stop_type = 'pickup'
        AND ${Prisma.join(stopDateConditions, " AND ")}
    )`)
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
}

function sortExpression(field: LandOrderSortField): Prisma.Sql {
  if (field === "pickup_date" || field === "drop_date") {
    return Prisma.sql`(
      SELECT MIN(st.stop_date) FROM land_order_stops st
      WHERE st.land_order_id = o.id
        AND st.stop_type = ${field === "pickup_date" ? "pickup" : "drop"}
    )`
  }
  if (field === "created_at") return Prisma.sql`o.created_at`
  return Prisma.raw(`o."${field}"`)
}

export async function readLandOrders(
  tx: Pick<Prisma.TransactionClient, "land_orders" | "$queryRaw">,
  params: URLSearchParams,
  options: {
    skip?: number
    take: number
    count?: boolean
    selectedIds?: bigint[] | null
    rejectIfOverTake?: boolean
  }
) {
  const filters = parseLandOrderQuery(params)
  const selectedIds = options.selectedIds?.length
    ? options.selectedIds
    : parseSelectedLandOrderIds(params.get("ids"))
  const where = buildSqlWhere(filters, selectedIds)

  const total = options.count
    ? Number(
        (
          await tx.$queryRaw<Array<{ total: bigint }>>(
            Prisma.sql`SELECT COUNT(*)::bigint AS total FROM land_orders o ${where}`
          )
        )[0]?.total ?? 0
      )
    : undefined

  if (total != null && options.rejectIfOverTake && total > options.take) {
    return { rows: [] as LandOrderPlanningRow[], total, exceededLimit: true as const }
  }

  const direction = Prisma.raw(filters.order === "desc" ? "DESC" : "ASC")
  const ids = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
    SELECT o.id FROM land_orders o ${where}
    ORDER BY ${sortExpression(filters.sort)} ${direction} NULLS LAST,
             o.load_number ${direction} NULLS LAST,
             o.id ${direction}
    LIMIT ${options.take} OFFSET ${options.skip ?? 0}
  `)

  const records = ids.length
    ? await tx.land_orders.findMany({
        where: { id: { in: ids.map((row) => row.id) } },
        include: { land_order_stops: { orderBy: { sequence: "asc" } } },
      })
    : []
  const byId = new Map(
    records.map((record) => [record.id, record as unknown as LandOrderPlanningSource])
  )

  return {
    rows: ids.map(({ id }) => buildLandOrderPlanningRow(byId.get(id)!)) as LandOrderPlanningRow[],
    total,
    exceededLimit: false as const,
  }
}

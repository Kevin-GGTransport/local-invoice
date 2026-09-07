/**
 * 陆运账单 查询构建器：列表接口与 Excel 导出共用同一套 searchParams → Prisma where/orderBy，
 * 保证「导出筛选结果」与列表所见一致（替代源项目 crud filter-helper 的本模块子集）
 */
import { Prisma } from "@prisma/client"

/** 快速搜索的模糊匹配字段 */
export const ACCOUNTING_INVOICE_SEARCH_FIELDS = [
  "invoice_number",
  "master_order_number",
  "order_number",
  "broker_load_number",
  "notes",
] as const

/** 可排序字段白名单（与源 config 中 sortable 字段一致） */
export const ACCOUNTING_INVOICE_SORTABLE_FIELDS = [
  "id",
  "company",
  "contract_date",
  "contract_price",
  "invoice_number",
  "invoice_date",
  "invoice_price",
  "check_date",
  "check_amount",
  "created_at",
  "updated_at",
] as const

export type AccountingInvoiceSortKey = (typeof ACCOUNTING_INVOICE_SORTABLE_FIELDS)[number]

/** 'YYYY-MM-DD' → Date（UTC 零点）；to 为区间右端时收尾到当天 23:59:59.999 保证整天包含 */
function dateParam(value: string | null, endOfDay = false): Date | null {
  if (!value || value.trim() === "") return null
  const base = endOfDay ? `${value.trim()}T23:59:59.999Z` : `${value.trim()}T00:00:00.000Z`
  const d = new Date(base)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * 解析查询参数 → where：
 *   search 关键词（5 字段不区分大小写模糊）
 *   bill_to 客户名称（不区分大小写模糊匹配）
 *   company 多选（逗号分隔）、billing_category 单选
 *   invoice_status=negative 负数账单（Invoice 金额小于 0）
 *   invoice_status=unsent 未发账单（Invoice 日期为空）
 *   invoice_date_from/to 日期区间
 */
export function buildAccountingInvoiceWhere(
  params: URLSearchParams
): Prisma.accounting_invoicesWhereInput {
  const where: Prisma.accounting_invoicesWhereInput = {}

  const companies = (params.get("company") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (companies.length > 0) where.company = { in: companies }

  const billTo = params.get("bill_to")?.trim()
  if (billTo) where.bill_to = { contains: billTo, mode: "insensitive" }

  const billingCategory = params.get("billing_category")?.trim()
  if (billingCategory) where.billing_category = billingCategory

  if (params.get("invoice_status") === "negative") where.invoice_price = { lt: 0 }

  if (params.get("invoice_status") === "unsent") {
    where.invoice_date = null
  } else {
    const invoiceGte = dateParam(params.get("invoice_date_from"))
    const invoiceLte = dateParam(params.get("invoice_date_to"), true)
    if (invoiceGte || invoiceLte) {
      where.invoice_date = { ...(invoiceGte ? { gte: invoiceGte } : {}), ...(invoiceLte ? { lte: invoiceLte } : {}) }
    }
  }

  const search = params.get("search")?.trim()
  if (search) {
    where.OR = ACCOUNTING_INVOICE_SEARCH_FIELDS.map((field) => ({
      [field]: { contains: search, mode: "insensitive" as const },
    }))
  }

  if (params.get("invoice_status") === "has_difference") {
    where.AND = [{ invoice_date: { not: null } }, { invoice_price: { not: null } }]
  }

  return where
}

/** 排序参数 → orderBy（白名单 + 次级 id 排序，默认 invoice_date desc，与源一致） */
export function buildAccountingInvoiceOrderBy(
  params: URLSearchParams
): Prisma.accounting_invoicesOrderByWithRelationInput[] {
  const sort = params.get("sort") ?? "invoice_date"
  const order = params.get("order") === "asc" ? "asc" : "desc"
  const key: AccountingInvoiceSortKey = (
    ACCOUNTING_INVOICE_SORTABLE_FIELDS as readonly string[]
  ).includes(sort)
    ? (sort as AccountingInvoiceSortKey)
    : "invoice_date"
  return [{ [key]: order }, { id: order }]
}

/** 解析 ?ids=1,2,3 → bigint[]；非法或为空返回 null */
export function parseSelectedIds(value: string | null): bigint[] | null {
  if (!value) return null
  const tokens = value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
  if (tokens.length === 0 || tokens.some((t) => !/^\d+$/.test(t))) return null
  return tokens.map((t) => BigInt(t))
}


/** SQL counterpart used for aggregate filtering. Keep ordinary predicates aligned with the Prisma builder. */
export function buildAccountingInvoiceSqlWhere(params: URLSearchParams): Prisma.Sql {
  const clauses: Prisma.Sql[] = []
  const companies = (params.get("company") ?? "").split(",").map((value) => value.trim()).filter(Boolean)
  if (companies.length) clauses.push(Prisma.sql`i.company IN (${Prisma.join(companies)})`)
  const billTo = params.get("bill_to")?.trim()
  if (billTo) clauses.push(Prisma.sql`i.bill_to ILIKE ${`%${billTo}%`}`)
  const category = params.get("billing_category")?.trim()
  if (category) clauses.push(Prisma.sql`i.billing_category = ${category}`)
  const status = params.get("invoice_status")
  if (status === "negative") clauses.push(Prisma.sql`i.invoice_price < 0`)
  if (status === "unsent") clauses.push(Prisma.sql`i.invoice_date IS NULL`)
  else {
    const from = dateParam(params.get("invoice_date_from"))
    const to = dateParam(params.get("invoice_date_to"), true)
    if (from) clauses.push(Prisma.sql`i.invoice_date >= ${from.toISOString().slice(0, 10)}::date`)
    if (to) clauses.push(Prisma.sql`i.invoice_date <= ${to.toISOString().slice(0, 10)}::date`)
  }
  if (status === "has_difference") clauses.push(Prisma.sql`
    i.invoice_date IS NOT NULL AND i.invoice_price IS NOT NULL
    AND COALESCE(p.paid_amount, 0) - i.invoice_price <> 0
  `)
  const search = params.get("search")?.trim()
  if (search) clauses.push(Prisma.sql`(${Prisma.join(
    ACCOUNTING_INVOICE_SEARCH_FIELDS.map((field) => Prisma.sql`${Prisma.raw(`i."${field}"`)} ILIKE ${`%${search}%`}`),
    " OR ",
  )})`)
  return clauses.length ? Prisma.join(clauses, " AND ") : Prisma.sql`TRUE`
}

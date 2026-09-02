/**
 * 陆运账单 查询构建器：列表接口与 Excel 导出共用同一套 searchParams → Prisma where/orderBy，
 * 保证「导出筛选结果」与列表所见一致（替代源项目 crud filter-helper 的本模块子集）
 */
import type { Prisma } from "@prisma/client"

/** 快速搜索的模糊匹配字段（与源 config.list.searchFields 一致） */
export const ACCOUNTING_INVOICE_SEARCH_FIELDS = [
  "invoice_number",
  "master_order_number",
  "order_number",
  "broker_load_number",
  "check_number",
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
 *   search 关键词（6 字段不区分大小写模糊）
 *   company 多选（逗号分隔）、from_to 单选
 *   invoice_date_from/to、check_date_from/to 日期区间
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

  const fromTo = params.get("from_to")?.trim()
  if (fromTo) where.from_to = fromTo

  const invoiceGte = dateParam(params.get("invoice_date_from"))
  const invoiceLte = dateParam(params.get("invoice_date_to"), true)
  if (invoiceGte || invoiceLte) {
    where.invoice_date = { ...(invoiceGte ? { gte: invoiceGte } : {}), ...(invoiceLte ? { lte: invoiceLte } : {}) }
  }

  const checkGte = dateParam(params.get("check_date_from"))
  const checkLte = dateParam(params.get("check_date_to"), true)
  if (checkGte || checkLte) {
    where.check_date = { ...(checkGte ? { gte: checkGte } : {}), ...(checkLte ? { lte: checkLte } : {}) }
  }

  const search = params.get("search")?.trim()
  if (search) {
    where.OR = ACCOUNTING_INVOICE_SEARCH_FIELDS.map((field) => ({
      [field]: { contains: search, mode: "insensitive" as const },
    }))
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

import type { Prisma } from "@prisma/client"

function dateParam(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : parsed
}

export function validateReconciliationQuery(params: URLSearchParams) {
  const invoiceId = params.get("invoice_id")
  if (invoiceId && !/^[1-9]\d*$/.test(invoiceId)) return "无效的账单 ID"
  for (const key of ["check_date_from", "check_date_to"] as const) {
    const value = params.get(key)
    if (value && !dateParam(value)) return "无效的支票日期"
  }
  return null
}

export function buildReconciliationWhere(params: URLSearchParams): Prisma.accounting_invoice_reconciliationsWhereInput {
  const status = params.get("status") ?? "active"
  const search = params.get("search")?.trim()
  const company = params.get("company")?.trim()
  const invoiceId = params.get("invoice_id")
  const checkDateFrom = dateParam(params.get("check_date_from"))
  const checkDateTo = dateParam(params.get("check_date_to"), true)

  return {
    ...(status === "active" ? { voided_at: null } : status === "voided" ? { voided_at: { not: null } } : {}),
    ...(invoiceId && /^[1-9]\d*$/.test(invoiceId) ? { accounting_invoice_id: BigInt(invoiceId) } : {}),
    ...(checkDateFrom || checkDateTo ? { check_date: {
      ...(checkDateFrom ? { gte: checkDateFrom } : {}),
      ...(checkDateTo ? { lte: checkDateTo } : {}),
    } } : {}),
    ...(company ? { accounting_invoice: { is: { company } } } : {}),
    ...(search ? {
      OR: [
        { check_number: { contains: search, mode: "insensitive" } },
        { accounting_invoice: { is: { OR: [
          { invoice_number: { contains: search, mode: "insensitive" } },
          { master_order_number: { contains: search, mode: "insensitive" } },
          { order_number: { contains: search, mode: "insensitive" } },
          { broker_load_number: { contains: search, mode: "insensitive" } },
          { bill_to: { contains: search, mode: "insensitive" } },
        ] } } },
      ],
    } : {}),
  }
}

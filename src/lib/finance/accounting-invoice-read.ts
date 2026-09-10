import { Prisma } from "@prisma/client"
import { buildAccountingInvoiceSqlWhere, buildAccountingInvoiceOrderBy } from "./accounting-invoice-query"
import { reconciliationSummary } from "./accounting-invoice-reconciliation"

export const activeReconciliations = {
  where: { voided_at: null },
  orderBy: [{ check_date: "desc" }, { id: "desc" }],
} satisfies Prisma.accounting_invoice_reconciliationsFindManyArgs

/** All filters, aggregation, sorting, counts and limits run in the database.
 * Only bounded page IDs cross into Prisma's relation loader.
 */
export async function readAccountingInvoices(
  tx: Pick<Prisma.TransactionClient, "$queryRaw" | "accounting_invoices">,
  params: URLSearchParams,
  options: { skip?: number; take: number; selectedIds?: bigint[] | null; count?: boolean },
) {
  const where = options.selectedIds?.length
    ? Prisma.sql`i.id IN (${Prisma.join(options.selectedIds)})`
    : buildAccountingInvoiceSqlWhere(params)
  const from = Prisma.sql`
    FROM accounting_invoices i
    LEFT JOIN LATERAL (
      SELECT SUM(r.check_amount) AS paid_amount, MAX(r.check_date) AS check_date
      FROM accounting_invoice_reconciliations r
      WHERE r.accounting_invoice_id = i.id AND r.voided_at IS NULL
    ) p ON TRUE
    WHERE ${where}
  `
  const order = buildAccountingInvoiceOrderBy(params)
  const [key, direction] = Object.entries(order[0])[0]
  // The identifier and direction are produced by the existing sort whitelist.
  // 合同日期即账单创建日期，排序键 contract_date 实际按 created_at 排
  const sortField = key === "check_amount" ? Prisma.sql`COALESCE(p.paid_amount, 0)`
    : key === "check_date" ? Prisma.sql`p.check_date`
    : key === "master_order_number" ? Prisma.sql`CASE WHEN i.master_order_number ~ '^[0-9]+$' THEN i.master_order_number::numeric END`
    : key === "contract_date" ? Prisma.raw('i."created_at"')
    : Prisma.raw(`i."${key}"`)
  const sortDirection = Prisma.raw(direction === "asc" ? "ASC" : "DESC")
  const orderClause = key === "master_order_number"
    ? Prisma.sql`${sortField} ${sortDirection} NULLS LAST, i.master_order_number ${sortDirection} NULLS LAST, i.id ${sortDirection}`
    : Prisma.sql`${sortField} ${sortDirection}, i.id ${sortDirection}`
  const ids = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
    SELECT i.id ${from}
    ORDER BY ${orderClause}
    LIMIT ${options.take} OFFSET ${options.skip ?? 0}
  `)
  const counts = options.count ? await tx.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS total ${from}
  `) : null
  const records = await tx.accounting_invoices.findMany({
    where: { id: { in: ids.map((row) => row.id) } },
    include: { accounting_invoice_reconciliations: activeReconciliations },
  })
  const byId = new Map(records.map((row) => [row.id, row]))
  return {
    rows: ids.map(({ id }) => invoiceWithReconciliationSummary(byId.get(id)!)),
    total: counts ? Number(counts[0].total) : undefined,
  }
}

type InvoiceWithPayments = Prisma.accounting_invoicesGetPayload<{
  include: { accounting_invoice_reconciliations: true }
}>

export function invoiceWithReconciliationSummary(row: InvoiceWithPayments) {
  const { accounting_invoice_reconciliations: records, ...invoice } = row
  const active = records.filter((record) => record.voided_at == null)
  const summary = reconciliationSummary(row.invoice_price, active.map((record) => record.check_amount))
  return {
    ...invoice,
    // 合同日期就是账单创建日期（列定义/导出沿用 contract_date 字段名）
    contract_date: invoice.created_at,
    check_amount: summary.paid_amount,
    check_date: active[0]?.check_date ?? null,
    check_number: active.length ? active.map((record) => record.check_number).join("/") : null,
    difference: summary.difference,
  }
}

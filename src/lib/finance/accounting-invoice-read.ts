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
  const sortField = key === "check_amount" ? Prisma.sql`COALESCE(p.paid_amount, 0)`
    : key === "check_date" ? Prisma.sql`p.check_date` : Prisma.raw(`i."${key}"`)
  const sortDirection = Prisma.raw(direction === "asc" ? "ASC" : "DESC")
  const ids = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
    SELECT i.id ${from}
    ORDER BY ${sortField} ${sortDirection}, i.id ${sortDirection}
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
    check_amount: summary.paid_amount,
    check_date: active[0]?.check_date ?? null,
    check_number: active.length ? active.map((record) => record.check_number).join("/") : null,
    difference: summary.difference,
  }
}

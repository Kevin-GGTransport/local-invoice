import { Prisma } from "@prisma/client"

export type ReconciliationStatus = "unreconciled" | "partial" | "settled" | "overpaid"

export function reconciliationSummary(
  invoicePrice: Prisma.Decimal | number | string | null,
  amounts: Array<Prisma.Decimal | number | string>
) {
  const invoiceAmount = new Prisma.Decimal(invoicePrice ?? 0)
  let paidAmount = new Prisma.Decimal(0)
  for (const value of amounts) paidAmount = paidAmount.plus(new Prisma.Decimal(value))
  const difference = invoiceAmount.minus(paidAmount)
  let status: ReconciliationStatus
  if (paidAmount.isZero()) status = "unreconciled"
  else if (difference.isZero()) status = "settled"
  else if (difference.isPositive()) status = "partial"
  else status = "overpaid"

  return {
    invoice_amount: invoiceAmount.toFixed(2),
    paid_amount: paidAmount.toFixed(2),
    difference: difference.toFixed(2),
    status,
  }
}

import assert from "node:assert/strict"
import test from "node:test"
import { Prisma } from "@prisma/client"
import { negativeInvoiceDateSchema, updateNegativeInvoiceDates, NegativeInvoiceDateError } from "../accounting-invoice-negative-date"
import { buildAccountingInvoiceWhere } from "../accounting-invoice-query"

type Tx = Parameters<typeof updateNegativeInvoiceDates>[0]
const input = { ids: ["1", "2"], invoice_date: "2026-09-07" }
function fake(prices: Array<number | null>, count = prices.length) {
  const updates: unknown[] = []
  const tx = { accounting_invoices: {
    findMany: async () => prices.map((price, i) => ({ id: BigInt(i + 1), invoice_number: `INV-${i + 1}`,
      invoice_price: price == null ? null : new Prisma.Decimal(price),
      invoice_date: i === 0 ? new Date("2026-01-01") : null })),
    updateMany: async (args: unknown) => { updates.push(args); return { count } },
  } } as unknown as Tx
  return { tx, updates }
}
test("negative tab combines amount with broker, keywords and dates", () => {
  const params = new URLSearchParams({ bill_to: "Acme", search: "123", invoice_date_from: "2026-09-01" })
  const existing = buildAccountingInvoiceWhere(params)
  params.set("invoice_status", "negative")
  assert.deepEqual(buildAccountingInvoiceWhere(params), { ...existing, invoice_price: { lt: 0 } })
})
test("date update validates dates, unique bounded IDs and batch size", () => {
  assert.ok(negativeInvoiceDateSchema.safeParse(input).success)
  for (const payload of [
    { ...input, invoice_date: "2026-02-29" }, { ...input, invoice_date: "" },
    { ...input, ids: [] }, { ...input, ids: ["1", "1"] },
    { ...input, ids: ["0"] }, { ...input, ids: ["9223372036854775808"] },
    { ...input, ids: Array.from({ length: 1001 }, (_, i) => String(i + 1)) },
  ]) assert.equal(negativeInvoiceDateSchema.safeParse(payload).success, false)
})
test("sets both existing and empty dates without requiring PDF templates", async () => {
  const { tx, updates } = fake([-1, -0.01])
  assert.deepEqual(await updateNegativeInvoiceDates(tx, input, BigInt(9)), { ...input, count: 2 })
  assert.deepEqual(updates, [{ where: { id: { in: [BigInt(1), BigInt(2)] }, invoice_price: { lt: 0 } },
    data: { invoice_date: new Date("2026-09-07T00:00:00.000Z"), updated_by: BigInt(9) } }])
})
test("rejects missing or non-negative invoices before any write", async () => {
  for (const prices of [[-1], [-1, 0], [-1, 1], [-1, null]]) {
    const { tx, updates } = fake(prices)
    await assert.rejects(() => updateNegativeInvoiceDates(tx, input, null), NegativeInvoiceDateError)
    assert.equal(updates.length, 0)
  }
})
test("throws on changed update count so the enclosing transaction rolls back", async () => {
  const { tx } = fake([-1, -2], 1)
  await assert.rejects(() => updateNegativeInvoiceDates(tx, input, null),
    (error: unknown) => error instanceof NegativeInvoiceDateError && error.status === 409)
})

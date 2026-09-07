import assert from "node:assert/strict"
import test from "node:test"
import { buildAccountingInvoiceWhere, buildAccountingInvoiceSqlWhere } from "../accounting-invoice-query"
import {
  invoiceDeductionSchema,
  updateInvoiceDeductions,
  InvoiceDeductionError,
} from "../accounting-invoice-deduction"

type Tx = Parameters<typeof updateInvoiceDeductions>[0]
const input = { ids: ["1", "2"], deduction: "RTS -50" }
function fake(count = input.ids.length) {
  const updates: unknown[] = []
  const tx = { accounting_invoices: {
    count: async () => count,
    updateMany: async (args: unknown) => { updates.push(args); return { count } },
  } } as unknown as Tx
  return { tx, updates }
}

test("deduction schema accepts bounded text and null, rejects oversized or bad IDs", () => {
  assert.ok(invoiceDeductionSchema.safeParse(input).success)
  assert.ok(invoiceDeductionSchema.safeParse({ ids: ["1"], deduction: null }).success)
  assert.ok(invoiceDeductionSchema.safeParse({
    ids: ["1"], deduction: "x".repeat(200),
  }).success)
  for (const payload of [
    { ...input, deduction: "x".repeat(201) },
    { ...input, ids: [] },
    { ...input, ids: ["1", "1"] },
    { ...input, ids: ["abc"] },
    { ...input, ids: Array.from({ length: 1001 }, (_, i) => String(i + 1)) },
  ]) assert.equal(invoiceDeductionSchema.safeParse(payload).success, false)
})

test("updates the deduction text and stamps the operator", async () => {
  const { tx, updates } = fake()
  assert.deepEqual(await updateInvoiceDeductions(tx, input, BigInt(9)), { ...input, count: 2 })
  assert.deepEqual(updates, [{ where: { id: { in: [BigInt(1), BigInt(2)] } },
    data: { deduction: "RTS -50", updated_by: BigInt(9) } }])
})

test("clearing the deduction writes null", async () => {
  const { tx, updates } = fake(1)
  await updateInvoiceDeductions(tx, { ids: ["1"], deduction: null }, null)
  assert.deepEqual(updates, [{ where: { id: { in: [BigInt(1)] } }, data: { deduction: null } }])
})

test("rejects missing invoices and inconsistent update counts", async () => {
  const missing = fake(1)
  await assert.rejects(
    () => updateInvoiceDeductions(missing.tx, input, null),
    (error: unknown) => error instanceof InvoiceDeductionError && error.status === 404,
  )
  assert.equal(missing.updates.length, 0)
  const conflict = fake(1)
  // count passes but updateMany returns a different count → 409 rollback
  const shortTx = { accounting_invoices: {
    count: async () => 2,
    updateMany: async () => ({ count: 1 }),
  } } as unknown as Tx
  await assert.rejects(
    () => updateInvoiceDeductions(shortTx, input, null),
    (error: unknown) => error instanceof InvoiceDeductionError && error.status === 409,
  )
  assert.equal(conflict.updates.length, 0)
})

// Prisma.Sql 的文本片段在 strings 数组里（参数化值在 values）
function sqlText(sql: ReturnType<typeof buildAccountingInvoiceSqlWhere>): string {
  return (sql as unknown as { strings: readonly string[] }).strings.join(" ? ")
}

test("with_deduction where keeps ordinary predicates and requires non-empty text in SQL", () => {
  assert.deepEqual(buildAccountingInvoiceWhere(new URLSearchParams({ invoice_status: "with_deduction" })), {
    deduction: { not: null },
  })
  const sql = buildAccountingInvoiceSqlWhere(
    new URLSearchParams({ invoice_status: "with_deduction" })
  )
  assert.match(sqlText(sql), /i\.deduction IS NOT NULL AND i\.deduction <> ''/)
})

test("unmatched_paid where requires sent, priced invoices with an active payment", () => {
  assert.deepEqual(buildAccountingInvoiceWhere(new URLSearchParams({ invoice_status: "unmatched_paid" })), {
    AND: [
      { invoice_date: { not: null } },
      { invoice_price: { not: null } },
      { accounting_invoice_reconciliations: { some: { voided_at: null } } },
    ],
  })
  const sql = buildAccountingInvoiceSqlWhere(
    new URLSearchParams({ invoice_status: "unmatched_paid" })
  )
  assert.match(sqlText(sql), /COALESCE\(p\.paid_amount, 0\) <> 0/)
  assert.match(sqlText(sql), /COALESCE\(p\.paid_amount, 0\) - i\.invoice_price <> 0/)
})

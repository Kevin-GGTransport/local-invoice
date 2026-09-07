import assert from "node:assert/strict"
import test from "node:test"
import { PrismaClient } from "@prisma/client"
import ExcelJS from "exceljs"
import { readAccountingInvoices, activeReconciliations, invoiceWithReconciliationSummary } from "../accounting-invoice-read"
import { buildAccountingInvoiceWhere, buildAccountingInvoiceOrderBy } from "../accounting-invoice-query"
import { generateAccountingInvoiceExportExcel } from "../../utils/accounting-invoice-export-excel"

// Opt in only against a disposable database with the project schema installed.
const url = process.env.INVOICE_TEST_DATABASE_URL

test("database difference filtering, pagination and Excel agree", { skip: !url }, async () => {
  const db = new PrismaClient({ datasources: { db: { url } } })
  const rollback = new Error("rollback fixtures")
  try {
    await assert.rejects(db.$transaction(async (tx) => {
      const prefix = `difference-test-${Date.now()}`
      const cases = [
        { name: "unpaid", price: "100", paid: [], difference: "-100.00" },
        { name: "partial", price: "100", paid: ["40"], difference: "-60.00" },
        { name: "settled", price: "100", paid: ["40", "60"], difference: "0.00" },
        { name: "overpaid", price: "100", paid: ["50", "60"], difference: "10.00" },
        { name: "voided", price: "100", paid: ["40"], voided: "60", difference: "-60.00" },
        { name: "negative", price: "-100", paid: [], difference: "100.00" },
        { name: "missing-price", price: null, paid: [], difference: null },
        { name: "missing-date", price: "100", paid: [], unsent: true, difference: "-100.00" },
        { name: "zero", price: "0", paid: [], difference: "0.00" },
        { name: "decimal", price: "0.30", paid: ["0.10", "0.20"], difference: "0.00" },
        { name: "next-month", price: "100", paid: [], nextMonth: true, difference: "-100.00" },
      ]
      const ids: bigint[] = []
      for (const item of cases) {
        const row = await tx.accounting_invoices.create({ data: {
          company: "TEST", invoice_number: `${prefix}-${item.name}`,
          invoice_price: item.price, invoice_date: item.unsent ? null : new Date(item.nextMonth ? "2024-03-01" : "2024-02-29"),
          bill_to: "Acme", billing_category: "SAV Local",
          // Stale legacy values must never affect the computed amount or difference.
          check_amount: 999, difference: "legacy",
        } })
        ids.push(row.id)
        for (const [index, amount] of [...item.paid, ...(item.voided ? [item.voided] : [])].entries()) {
          await tx.accounting_invoice_reconciliations.create({ data: {
            accounting_invoice_id: row.id, request_id: `${prefix}-${item.name}-${index}`,
            check_amount: amount, check_date: new Date("2024-03-05"), check_number: `CHECK${index}`,
            voided_at: item.voided && index === item.paid.length ? new Date() : null,
          } })
        }
        const full = await tx.accounting_invoices.findUniqueOrThrow({
          where: { id: row.id }, include: { accounting_invoice_reconciliations: activeReconciliations },
        })
        assert.equal(invoiceWithReconciliationSummary(full).difference, item.difference, item.name)
      }
      const params = new URLSearchParams({ invoice_status: "has_difference", search: prefix,
        company: "TEST", bill_to: "acme", billing_category: "SAV Local",
        invoice_date_from: "2024-02-01", invoice_date_to: "2024-02-29", sort: "id", order: "asc" })
      const matching = [ids[0], ids[1], ids[3], ids[4], ids[5]]
      const page = await readAccountingInvoices(tx, params, { skip: 2, take: 2, count: true })
      assert.equal(page.total, 5)
      assert.deepEqual(page.rows.map((row) => row.id), matching.slice(2, 4))
      const exported = await readAccountingInvoices(tx, params, { take: 10000 })
      assert.deepEqual(exported.rows.map((row) => row.id), matching)
      // Ordinary filters remain compatible with the existing Prisma query semantics.
      for (const status of ["all", "negative", "unsent"]) {
        const ordinary = new URLSearchParams(params)
        ordinary.set("invoice_status", status)
        const expected = await tx.accounting_invoices.findMany({
          where: buildAccountingInvoiceWhere(ordinary), orderBy: buildAccountingInvoiceOrderBy(ordinary),
        })
        const actual = await readAccountingInvoices(tx, ordinary, { take: 10000 })
        assert.deepEqual(actual.rows.map((row) => row.id), expected.map((row) => row.id))
      }
      const sorted = new URLSearchParams(params)
      sorted.set("sort", "check_amount")
      const sortedRows = (await readAccountingInvoices(tx, sorted, { take: 10000 })).rows
      assert.deepEqual(sortedRows.map((row) => row.check_amount), ["0.00", "0.00", "40.00", "40.00", "110.00"])
      sorted.set("sort", "check_date")
      const dateSortedRows = (await readAccountingInvoices(tx, sorted, { take: 10000 })).rows
      assert.deepEqual(dateSortedRows.map((row) => row.check_date != null), [true, true, true, false, false])
      const unsentWithStaleDates = await readAccountingInvoices(tx, new URLSearchParams({
        invoice_status: "unsent", search: prefix,
        invoice_date_from: "2024-02-01", invoice_date_to: "2024-02-29",
      }), { take: 10000 })
      assert.deepEqual(unsentWithStaleDates.rows.map((row) => row.id), [ids[7]])
      const selected = await readAccountingInvoices(tx, params, { selectedIds: [ids[2], ids[6]], take: 10000 })
      assert.deepEqual(selected.rows.map((row) => row.id), [ids[2], ids[6]])
      const buffer = await generateAccountingInvoiceExportExcel(exported.rows.map((row) => {
        return { ...row, invoice_price: row.invoice_price == null ? null : Number(row.invoice_price),
          contract_price: row.contract_price == null ? null : Number(row.contract_price), check_amount: Number(row.check_amount) }
      }))
      const book = new ExcelJS.Workbook()
      await book.xlsx.load(buffer as unknown as Parameters<typeof book.xlsx.load>[0])
      const sheet = book.worksheets[0]
      const contents: string[] = []
      sheet.eachRow((row) => row.eachCell((cell) => contents.push(String(cell.value))))
      assert.ok(contents.includes("-60.00"))
      assert.ok(contents.includes("10.00"))
      assert.ok(!contents.includes("legacy"))
      params.set("company", "NO-MATCH")
      assert.equal((await readAccountingInvoices(tx, params, { take: 10, count: true })).total, 0)
      // A large matching set must not become an unbounded IN parameter list.
      await tx.$executeRaw`
        INSERT INTO accounting_invoices (company, invoice_number, invoice_date, invoice_price)
        SELECT 'SCALE', ${prefix} || '-scale-' || n, DATE '2024-02-01', 100
        FROM generate_series(1, 40000) AS n
      `
      const large = await readAccountingInvoices(tx, new URLSearchParams({ company: "SCALE", invoice_status: "has_difference" }),
        { take: 2, skip: 39998, count: true })
      assert.equal(large.total, 40000)
      assert.equal(large.rows.length, 2)
      throw rollback
    }, { timeout: 20000 }), (error) => error === rollback)
  } finally {
    await db.$disconnect()
  }
})

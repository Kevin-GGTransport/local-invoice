import assert from "node:assert/strict"
import test from "node:test"
import {
  AccountingInvoiceSendError,
  accountingInvoiceSendSchema,
  invoiceDateToUtc,
  MAX_ACCOUNTING_INVOICE_SEND,
  sendAccountingInvoices,
} from "../accounting-invoice-send"

type SendTx = Parameters<typeof sendAccountingInvoices>[0]

function fakeTransaction(options: {
  records?: Array<{ id: bigint; invoice_number: string; invoice_date: Date | null; company: string }>
  templateCompanies?: string[]
  updateCount?: number
}) {
  let updateCalls = 0
  const tx = {
    accounting_invoices: {
      findMany: async () => options.records ?? [],
      updateMany: async () => {
        updateCalls += 1
        return { count: options.updateCount ?? options.records?.length ?? 0 }
      },
    },
    invoice_templates: {
      findMany: async () => (options.templateCompanies ?? []).map((code) => ({ company: { code } })),
    },
  } as unknown as SendTx
  return { tx, getUpdateCalls: () => updateCalls }
}

const sendInput = {
  rawIds: ["1", "2"],
  invoiceDate: new Date("2026-09-04T00:00:00.000Z"),
  invoiceDateText: "2026-09-04",
  updatedBy: BigInt(9),
}

test("accepts one or many unique invoice IDs with a real date", () => {
  const result = accountingInvoiceSendSchema.parse({
    ids: ["1", "9007199254740993"],
    invoice_date: "2026-09-04",
  })

  assert.deepEqual(result.ids, ["1", "9007199254740993"])
  assert.equal(invoiceDateToUtc(result.invoice_date).toISOString(), "2026-09-04T00:00:00.000Z")
})

test("rejects impossible dates, duplicate IDs and invalid IDs", () => {
  for (const payload of [
    { ids: ["1"], invoice_date: "2026-02-29" },
    { ids: ["1", "1"], invoice_date: "2026-09-04" },
    { ids: ["abc"], invoice_date: "2026-09-04" },
    { ids: ["01"], invoice_date: "2026-09-04" },
    { ids: ["9223372036854775808"], invoice_date: "2026-09-04" },
  ]) {
    assert.equal(accountingInvoiceSendSchema.safeParse(payload).success, false)
  }
})

test("rejects missing, already sent and unsupported invoices before updating", async () => {
  const scenarios = [
    {
      options: {
        records: [{ id: BigInt(1), invoice_number: "INV-1", invoice_date: null, company: "GNG" }],
        templateCompanies: ["GNG"],
      },
      status: 404,
    },
    {
      options: {
        records: [
          { id: BigInt(1), invoice_number: "INV-1", invoice_date: new Date(), company: "GNG" },
          { id: BigInt(2), invoice_number: "INV-2", invoice_date: null, company: "GNG" },
        ],
        templateCompanies: ["GNG"],
      },
      status: 409,
    },
    {
      options: {
        records: [
          { id: BigInt(1), invoice_number: "INV-1", invoice_date: null, company: "GNG" },
          { id: BigInt(2), invoice_number: "INV-2", invoice_date: null, company: "AA" },
        ],
        templateCompanies: ["GNG"],
      },
      status: 400,
    },
  ]

  for (const scenario of scenarios) {
    const fake = fakeTransaction(scenario.options)
    await assert.rejects(
      () => sendAccountingInvoices(fake.tx, sendInput),
      (error: unknown) => error instanceof AccountingInvoiceSendError && error.status === scenario.status
    )
    assert.equal(fake.getUpdateCalls(), 0)
  }
})

test("reports a concurrent send conflict when the conditional update count changes", async () => {
  const fake = fakeTransaction({
    records: [
      { id: BigInt(1), invoice_number: "INV-1", invoice_date: null, company: "GNG" },
      { id: BigInt(2), invoice_number: "INV-2", invoice_date: null, company: "GNG" },
    ],
    templateCompanies: ["GNG"],
    updateCount: 1,
  })

  await assert.rejects(
    () => sendAccountingInvoices(fake.tx, sendInput),
    (error: unknown) => error instanceof AccountingInvoiceSendError && error.status === 409
  )
  assert.equal(fake.getUpdateCalls(), 1)
})

test("updates every eligible invoice and returns the stable request order", async () => {
  const fake = fakeTransaction({
    records: [
      { id: BigInt(2), invoice_number: "INV-2", invoice_date: null, company: "GNG" },
      { id: BigInt(1), invoice_number: "INV-1", invoice_date: null, company: "GNG" },
    ],
    templateCompanies: ["GNG"],
    updateCount: 2,
  })

  assert.deepEqual(await sendAccountingInvoices(fake.tx, sendInput), {
    count: 2,
    ids: ["1", "2"],
    invoice_date: "2026-09-04",
  })
})

test("enforces the shared 40 invoice batch limit", () => {
  const ids = Array.from({ length: MAX_ACCOUNTING_INVOICE_SEND + 1 }, (_, index) => String(index + 1))
  assert.equal(
    accountingInvoiceSendSchema.safeParse({ ids, invoice_date: "2026-09-04" }).success,
    false
  )
})

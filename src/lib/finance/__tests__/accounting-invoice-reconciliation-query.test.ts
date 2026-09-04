import assert from "node:assert/strict"
import test from "node:test"
import { buildReconciliationWhere, validateReconciliationQuery } from "../accounting-invoice-reconciliation-query"

test("reconciliation records default to active and can filter a single invoice", () => {
  assert.deepEqual(buildReconciliationWhere(new URLSearchParams({ invoice_id: "42" })), {
    voided_at: null,
    accounting_invoice_id: BigInt(42),
  })
})

test("reconciliation records support voided status and inclusive check date range", () => {
  assert.deepEqual(buildReconciliationWhere(new URLSearchParams({
    status: "voided",
    check_date_from: "2026-09-01",
    check_date_to: "2026-09-04",
  })), {
    voided_at: { not: null },
    check_date: {
      gte: new Date("2026-09-01T00:00:00.000Z"),
      lte: new Date("2026-09-04T23:59:59.999Z"),
    },
  })
})

test("all status omits void filter and invalid invoice ids are ignored", () => {
  assert.deepEqual(buildReconciliationWhere(new URLSearchParams({ status: "all", invoice_id: "nope" })), {})
})

test("query validation rejects invalid invoice IDs and impossible calendar dates", () => {
  assert.equal(validateReconciliationQuery(new URLSearchParams({ invoice_id: "nope" })), "无效的账单 ID")
  assert.equal(validateReconciliationQuery(new URLSearchParams({ check_date_from: "2026-02-31" })), "无效的支票日期")
  assert.equal(validateReconciliationQuery(new URLSearchParams({ check_date_to: "2026-02-28" })), null)
})

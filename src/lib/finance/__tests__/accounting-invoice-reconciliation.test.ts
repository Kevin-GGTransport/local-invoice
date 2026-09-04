import assert from "node:assert/strict"
import test from "node:test"
import { reconciliationSummary } from "../accounting-invoice-reconciliation"
import {
  createReconciliationsSchema,
  reconciliationDateToUtc,
} from "../../validations/accounting-invoice-reconciliation"

test("reconciliation summary supports repeated payments and a negative difference", () => {
  assert.deepEqual(reconciliationSummary("4000.00", ["2500.00", "2000.00"]), {
    invoice_amount: "4000.00",
    paid_amount: "4500.00",
    difference: "-500.00",
    status: "overpaid",
  })
})

test("reconciliation summary distinguishes unreconciled, partial and settled", () => {
  assert.equal(reconciliationSummary("4000", []).status, "unreconciled")
  assert.equal(reconciliationSummary("4000", ["1000"]).status, "partial")
  assert.equal(reconciliationSummary("4000", ["1500", "2500"]).status, "settled")
})

test("reconciliation validation normalizes check number and accepts overpayment", () => {
  const result = createReconciliationsSchema.parse({
    items: [{
      invoice_id: "12",
      request_id: "test-request-1",
      check_date: "2026-09-04",
      check_amount: "5000.25",
      check_number: "ach0904",
    }],
  })
  assert.equal(result.items[0].check_number, "ACH0904")
  assert.equal(result.items[0].check_amount, 5000.25)
})

test("reconciliation validation rejects invalid dates, non-alphanumeric checks and non-positive amounts", () => {
  const result = createReconciliationsSchema.safeParse({
    items: [{
      invoice_id: "12",
      request_id: "test-request-2",
      check_date: "2026-02-31",
      check_amount: "0",
      check_number: "ACH/0904",
    }],
  })
  assert.equal(result.success, false)
})

test("reconciliation validation rejects sub-cent amounts that the database would round to zero", () => {
  const result = createReconciliationsSchema.safeParse({
    items: [{
      invoice_id: "12",
      request_id: "test-request-small",
      check_date: "2026-09-04",
      check_amount: "0.0000001",
      check_number: "ACH0904",
    }],
  })
  assert.equal(result.success, false)
})

test("reconciliation dates are stored at UTC midnight", () => {
  assert.equal(reconciliationDateToUtc("2026-09-04").toISOString(), "2026-09-04T00:00:00.000Z")
})

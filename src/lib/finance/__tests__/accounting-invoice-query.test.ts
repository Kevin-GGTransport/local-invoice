import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildAccountingInvoiceWhere } from '../accounting-invoice-query'
import {
  billingCategoryPayloadValue,
  fromBillingCategorySelectValue,
  toBillingCategorySelectValue,
} from '../accounting-invoice-companies'

describe('buildAccountingInvoiceWhere billing category', () => {
  it('uses billing_category as an exact-match filter', () => {
    const where = buildAccountingInvoiceWhere(
      new URLSearchParams({ billing_category: 'SAV Local' })
    )

    assert.deepEqual(where, { billing_category: 'SAV Local' })
  })

  it('ignores a blank billing_category', () => {
    const where = buildAccountingInvoiceWhere(
      new URLSearchParams({ billing_category: '   ' })
    )

    assert.deepEqual(where, {})
  })

  it('does not support the legacy from_to parameter', () => {
    const where = buildAccountingInvoiceWhere(
      new URLSearchParams({ from_to: '长途出货' })
    )

    assert.deepEqual(where, {})
  })
})

describe('buildAccountingInvoiceWhere invoice status', () => {
  it('filters unsent invoices by a null Invoice date', () => {
    const where = buildAccountingInvoiceWhere(
      new URLSearchParams({ invoice_status: 'unsent' })
    )

    assert.deepEqual(where, { invoice_date: null })
  })

  it('gives the unsent tab precedence over stale date-range parameters', () => {
    const where = buildAccountingInvoiceWhere(
      new URLSearchParams({
        invoice_status: 'unsent',
        invoice_date_from: '2026-09-01',
        invoice_date_to: '2026-09-04',
      })
    )

    assert.deepEqual(where, { invoice_date: null })
  })
})

describe('billing category form values', () => {
  it('round-trips arbitrary legacy values without trimming or sentinel collisions', () => {
    for (const legacyValue of [' LA短途 ', '   ', 'billing-category:unclassified']) {
      assert.equal(
        fromBillingCategorySelectValue(toBillingCategorySelectValue(legacyValue)),
        legacyValue
      )
      assert.equal(billingCategoryPayloadValue(legacyValue), legacyValue)
    }
  })

  it('maps only an explicit unclassified value to null', () => {
    assert.equal(fromBillingCategorySelectValue(toBillingCategorySelectValue('')), '')
    assert.equal(billingCategoryPayloadValue(''), null)
  })
})

describe('buildAccountingInvoiceWhere broker', () => {
  it('trims the customer name and uses case-insensitive substring matching', () => {
    assert.deepEqual(buildAccountingInvoiceWhere(new URLSearchParams({ bill_to: '  AcMe  ' })), {
      bill_to: { contains: 'AcMe', mode: 'insensitive' },
    })
  })

  it('ignores missing or blank customer names', () => {
    for (const params of [new URLSearchParams(), new URLSearchParams({ bill_to: '   ' })]) {
      assert.deepEqual(buildAccountingInvoiceWhere(params), {})
    }
  })

  it('intersects the customer with keyword, company, category and date filters', () => {
    const params = new URLSearchParams({
      search: 'load123', company: 'A,B', billing_category: 'SAV Local',
      invoice_date_from: '2026-09-01', invoice_date_to: '2026-09-07',
    })
    const existing = buildAccountingInvoiceWhere(params)
    params.set('bill_to', 'Acme')
    assert.deepEqual(buildAccountingInvoiceWhere(params), {
      ...existing, bill_to: { contains: 'Acme', mode: 'insensitive' },
    })
    assert.ok(existing.OR?.length)
    assert.deepEqual(existing.company, { in: ['A', 'B'] })
  })

  it('combines customer filtering with the unsent tab', () => {
    assert.deepEqual(buildAccountingInvoiceWhere(new URLSearchParams({
      bill_to: 'Acme', invoice_status: 'unsent',
    })), {
      bill_to: { contains: 'Acme', mode: 'insensitive' }, invoice_date: null,
    })
  })
})


describe('Invoice month shortcuts', () => {
  it('covers leap years, year boundaries and full-month highlighting', async () => {
    const { invoiceMonthRange, selectedInvoiceMonth } = await import('../accounting-invoice-month')
    assert.deepEqual(invoiceMonthRange(2024, 2), { from: '2024-02-01', to: '2024-02-29' })
    assert.deepEqual(invoiceMonthRange(2026, 2), { from: '2026-02-01', to: '2026-02-28' })
    assert.deepEqual(invoiceMonthRange(2026, 12), { from: '2026-12-01', to: '2026-12-31' })
    assert.deepEqual(invoiceMonthRange(2027, 1), { from: '2027-01-01', to: '2027-01-31' })
    assert.equal(selectedInvoiceMonth(2024, '2024-02-01', '2024-02-29'), 2)
    assert.equal(selectedInvoiceMonth(2026, '2024-02-01', '2024-02-29'), null)
    assert.equal(selectedInvoiceMonth(2024, '2024-02-02', '2024-02-29'), null)
    assert.equal(selectedInvoiceMonth(2024, '', ''), null)
  })
  it('retains date and company restrictions for the difference tab', () => {
    const where = buildAccountingInvoiceWhere(new URLSearchParams({
      invoice_status: 'has_difference', company: 'A',
      invoice_date_from: '2024-02-01', invoice_date_to: '2024-02-29',
    }))
    assert.deepEqual(where.company, { in: ['A'] })
    assert.deepEqual(where.AND, [{ invoice_date: { not: null } }, { invoice_price: { not: null } }])
    assert.deepEqual(where.invoice_date, {
      gte: new Date('2024-02-01T00:00:00.000Z'), lte: new Date('2024-02-29T23:59:59.999Z'),
    })
  })
})

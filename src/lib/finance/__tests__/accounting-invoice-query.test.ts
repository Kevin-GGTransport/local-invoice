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

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  accountingInvoiceCreateSchema,
  accountingInvoiceUpdateSchema,
} from '../../validations/accounting-invoice'

test('create schema accepts and normalizes contract price', () => {
  const result = accountingInvoiceCreateSchema.parse({
    company: 'GNG',
    invoice_number: 'INV-001',
    contract_price: '1250.50',
    invoice_date: '2026-09-04',
  })

  assert.equal(result.contract_price, 1250.5)
  assert.equal('invoice_date' in result, false)
})

test('update schema strips contract price from existing invoice updates', () => {
  const result = accountingInvoiceUpdateSchema.parse({
    bill_to: 'Acme Broker',
    contract_price: '9999.99',
    invoice_date: '2026-09-04',
  })

  assert.deepEqual(result, { bill_to: 'Acme Broker' })
  assert.equal('contract_price' in result, false)
  assert.equal('invoice_date' in result, false)
})

test('create and update schemas carry the deduction note within 200 chars', () => {
  const base = { company: 'GNG', invoice_number: 'INV-001' }
  assert.equal(
    accountingInvoiceCreateSchema.parse({ ...base, deduction: 'RTS -50' }).deduction,
    'RTS -50'
  )
  assert.equal(
    accountingInvoiceUpdateSchema.parse({ deduction: null }).deduction,
    null
  )
  assert.equal(
    accountingInvoiceUpdateSchema.safeParse({ deduction: 'x'.repeat(201) }).success,
    false
  )
})

test('tonu stays an optional boolean on create and update', () => {
  assert.equal(
    accountingInvoiceCreateSchema.parse({ company: 'GNG', invoice_number: 'INV-001', tonu: true }).tonu,
    true
  )
  assert.equal('tonu' in accountingInvoiceUpdateSchema.parse({ bill_to: 'A' }), false)
  assert.equal(accountingInvoiceUpdateSchema.parse({ tonu: false }).tonu, false)
})

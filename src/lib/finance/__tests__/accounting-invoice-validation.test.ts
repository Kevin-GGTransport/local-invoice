import assert from 'node:assert/strict'
import test from 'node:test'
import {
  accountingInvoiceCreateSchema,
  accountingInvoiceUpdateSchema,
} from '../../validations/accounting-invoice'
import {
  ACCOUNTING_INVOICE_LINES_MAX,
  normalizeAccountingInvoiceLines,
  validateAccountingInvoiceLines,
} from '../accounting-invoice-lines'
import { validateAccountingInvoiceRendererSelection } from '../accounting-invoice-renderers'

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

test('AA cold-chain renderer is exclusive to AA and cannot combine with an uploaded template', () => {
  assert.equal(validateAccountingInvoiceRendererSelection({
    company: 'AA', rendererKey: 'aa_cold_chain', invoiceTemplateId: null,
  }), null)
  assert.match(validateAccountingInvoiceRendererSelection({
    company: 'GNG', rendererKey: 'aa_cold_chain', invoiceTemplateId: null,
  }) ?? '', /仅可用于 AA/)
  assert.match(validateAccountingInvoiceRendererSelection({
    company: 'AA', rendererKey: 'aa_cold_chain', invoiceTemplateId: '12',
  }) ?? '', /不能与上传模版同时选择/)
})

test('cold-chain lines normalize dates, addresses and retain meaningful rows only', () => {
  const lines = normalizeAccountingInvoiceLines([
    { service_date: '2026-09-11', pickup_address: ' Oakland ', drop_address_1: ' San Jose ', amount: '125.50' },
    { service_date: '', pickup_address: ' ', amount: '' },
  ])
  assert.equal(lines.length, 1)
  assert.equal(lines[0].service_date?.toISOString(), '2026-09-11T00:00:00.000Z')
  assert.equal(lines[0].pickup_address, 'Oakland')
  assert.equal(lines[0].drop_address_1, 'San Jose')
  assert.equal(lines[0].amount, 125.5)
  assert.equal(validateAccountingInvoiceLines([{ service_date: '2026-02-30' }]), '第 1 行运输日期无效')
  assert.equal(validateAccountingInvoiceLines([{ amount: 'abc' }]), '第 1 行 RATE 必须为最多 2 位小数的数字')
  assert.equal(validateAccountingInvoiceLines([null]), '第 1 行明细格式无效')
  assert.match(validateAccountingInvoiceLines([{ amount: '12.345' }]) ?? '', /最多 2 位小数/)
  assert.match(validateAccountingInvoiceLines([{ amount: 12.345 }]) ?? '', /最多 2 位小数/)
  assert.match(validateAccountingInvoiceLines([{ amount: '0x10' }]) ?? '', /最多 2 位小数/)
  assert.match(
    validateAccountingInvoiceLines(Array.from({ length: ACCOUNTING_INVOICE_LINES_MAX + 1 }, () => ({}))) ?? '',
    /最多 200 行/
  )
})

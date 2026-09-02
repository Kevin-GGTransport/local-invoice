/**
 * 陆运账单 PDF 生成入口
 * 按记录的公司字段从注册表取模版渲染；未注册模版的公司返回 unsupported
 * 合计 = 明细行金额之和（无明细行的历史数据回退主表单行字段）
 */

import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { prisma } from '@/lib/prisma'
import { ACCOUNTING_INVOICE_PDF_TEMPLATES } from './accounting-invoice-pdf-registry'
import type { AccountingInvoicePdfPayload, AccountingInvoicePdfLine } from './accounting-invoice-pdf-types'

export type AccountingInvoicePdfResult =
  | { status: 'ok'; buffer: Buffer; invoiceNumber: string; company: string }
  | { status: 'not_found' }
  | { status: 'unsupported'; company: string }

function formatMoney(value: unknown): string {
  const num = Number(value)
  if (value == null || Number.isNaN(num)) return ''
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(date: Date | null): string {
  if (!date) return ''
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${mm}/${dd}/${date.getUTCFullYear()}`
}

function formatNumber(value: unknown): string {
  const num = Number(value)
  if (value == null || Number.isNaN(num)) return ''
  return String(num)
}

export async function generateAccountingInvoicePdf(id: bigint): Promise<AccountingInvoicePdfResult> {
  const row = await prisma.accounting_invoices.findUnique({
    where: { id },
    include: {
      accounting_invoice_lines: { orderBy: { sort_order: 'asc' } },
    },
  })
  if (!row) return { status: 'not_found' }

  const Template = ACCOUNTING_INVOICE_PDF_TEMPLATES[row.company]
  if (!Template) return { status: 'unsupported', company: row.company }

  const dbLines = row.accounting_invoice_lines ?? []
  const lines: AccountingInvoicePdfLine[] =
    dbLines.length > 0
      ? dbLines.map((line) => ({
          description: line.description ?? '',
          quantity: formatNumber(line.quantity),
          unitPrice: formatMoney(line.unit_price),
          amount: formatMoney(line.amount),
        }))
      : // 历史数据：无明细行时回退主表单行字段
        [
          {
            description: row.description ?? '',
            quantity: formatNumber(row.quantity),
            unitPrice: formatMoney(row.unit_price),
            amount: formatMoney(row.invoice_price),
          },
        ]

  // 合计：明细行之和；无明细行时用主表 invoice_price
  const total =
    dbLines.length > 0
      ? dbLines.reduce((sum, line) => sum + Number(line.amount ?? 0), 0)
      : Number(row.invoice_price ?? 0)
  const totalStr = formatMoney(Math.round(total * 100) / 100)

  const payload: AccountingInvoicePdfPayload = {
    company: row.company,
    invoiceNumber: row.invoice_number,
    invoiceDate: formatDate(row.invoice_date),
    loadNumber: row.broker_load_number ?? '',
    billTo: row.bill_to ?? '',
    invoicePrice: totalStr,
    amount: totalStr,
    lines,
    pickupDate: formatDate(row.pickup_date),
    pickupCompany: row.pickup_company ?? '',
    pickupAddress: row.pickup_address ?? '',
    dropDate: formatDate(row.drop_date),
    dropCompany: row.drop_company ?? '',
    dropAddress: row.drop_address ?? '',
  }

  const buf = await renderToBuffer(<Template data={payload} />)
  const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer)
  return { status: 'ok', buffer, invoiceNumber: row.invoice_number, company: row.company }
}

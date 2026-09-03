/**
 * 陆运账单 PDF 生成入口（数据驱动）
 * 按记录的公司代码查询当前启用的账单模版，经共享渲染核心生成 PDF；
 * 无启用模版的公司返回 unsupported。历史数据无明细行时回退主表单行字段。
 */

import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { prisma } from '@/lib/prisma'
import type {
  TemplateBinding,
  TemplateGrid,
  TemplatePageConfig,
  TemplateRenderData,
} from '@/lib/templates/types'
import { renderTemplateData } from '@/lib/templates/render-template-data'
import { GenericTemplateDocument } from './generic-template-pdf'

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

  const template = await prisma.invoice_templates.findFirst({
    where: { status: 'active', company: { code: row.company } },
    orderBy: { updated_at: 'desc' },
  })
  if (!template) return { status: 'unsupported', company: row.company }

  const dbLines = row.accounting_invoice_lines ?? []
  const lines: TemplateRenderData['lines'] =
    dbLines.length > 0
      ? dbLines.map((line) => ({
          description: line.description ?? '',
          quantity: formatNumber(line.quantity),
          unitPrice: formatMoney(line.unit_price),
          amount: formatMoney(line.amount),
        }))
      : [
          {
            description: row.description ?? '',
            quantity: formatNumber(row.quantity),
            unitPrice: formatMoney(row.unit_price),
            amount: formatMoney(row.invoice_price),
          },
        ]

  const total =
    dbLines.length > 0
      ? dbLines.reduce((sum, line) => sum + Number(line.amount ?? 0), 0)
      : Number(row.invoice_price ?? 0)
  const totalStr = formatMoney(Math.round(total * 100) / 100)

  const data: TemplateRenderData = {
    invoiceNumber: row.invoice_number,
    invoiceDate: formatDate(row.invoice_date),
    loadNumber: row.broker_load_number ?? '',
    billTo: row.bill_to ?? '',
    total: totalStr,
    pickupDate: formatDate(row.pickup_date),
    pickupCompany: row.pickup_company ?? '',
    pickupAddress: row.pickup_address ?? '',
    dropDate: formatDate(row.drop_date),
    dropCompany: row.drop_company ?? '',
    dropAddress: row.drop_address ?? '',
    lines,
  }

  const rendered = renderTemplateData(
    template.grid_config as unknown as TemplateGrid,
    template.binding_config as unknown as TemplateBinding,
    data
  )

  const buf = await renderToBuffer(
    <GenericTemplateDocument
      pageConfig={template.page_config as unknown as TemplatePageConfig}
      grid={rendered}
    />
  )
  const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer)
  return { status: 'ok', buffer, invoiceNumber: row.invoice_number, company: row.company }
}

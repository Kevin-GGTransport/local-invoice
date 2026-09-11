/**
 * 陆运账单 PDF 生成入口（数据驱动）
 * 按记录的公司代码查询当前启用的账单模版，经共享渲染核心生成 PDF；
 * 无启用模版的公司返回 unsupported。历史数据无明细行时回退主表单行字段。
 */

import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { prisma } from '@/lib/prisma'
import type {
  TemplateGrid,
  TemplatePageConfig,
  TemplateRenderData,
} from '@/lib/templates/types'
import { renderTemplateData } from '@/lib/templates/render-template-data'
import { deriveBindingFromGrid } from '@/lib/templates/token-binding'
import { GenericTemplateDocument } from './generic-template-pdf'
import { AA_COLD_CHAIN_COMPANY, AA_COLD_CHAIN_RENDERER_KEY } from '@/lib/finance/accounting-invoice-renderers'
import { AA_COLD_CHAIN_PAGE_CONFIG, buildAaColdChainGrid } from '@/lib/templates/aa-cold-chain-template'

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

  if (row.company === AA_COLD_CHAIN_COMPANY && row.renderer_key === AA_COLD_CHAIN_RENDERER_KEY) {
    const total = (row.accounting_invoice_lines ?? []).reduce(
      (sum, line) => sum + Number(line.amount ?? 0),
      0
    )
    const grid = buildAaColdChainGrid({
      invoiceNumber: row.invoice_number,
      invoiceDate: formatDate(row.invoice_date),
      loadNumber: row.broker_load_number ?? '',
      billTo: row.bill_to ?? '',
      total: formatMoney(Math.round(total * 100) / 100),
      lines: (row.accounting_invoice_lines ?? []).map((line) => ({
        serviceDate: formatDate(line.service_date),
        pickupAddress: line.pickup_address ?? '',
        dropAddress1: line.drop_address_1 ?? '',
        dropAddress2: line.drop_address_2 ?? '',
        dropAddress3: line.drop_address_3 ?? '',
        amount: formatMoney(line.amount),
      })),
    })
    const buf = await renderToBuffer(
      <GenericTemplateDocument pageConfig={AA_COLD_CHAIN_PAGE_CONFIG} grid={grid} />
    )
    return {
      status: 'ok',
      buffer: Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer),
      invoiceNumber: row.invoice_number,
      company: row.company,
    }
  }

  const template = row.invoice_template_id
    ? await prisma.invoice_templates.findFirst({
        where: { id: row.invoice_template_id, status: 'active', company: { code: row.company } },
      })
    : await prisma.invoice_templates.findFirst({
        where: { status: 'active', is_default: true, company: { code: row.company } },
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

  // 绑定由网格现场推导（与保存/发布同源），存量模版无需迁移即享受最新推导规则
  const grid = template.grid_config as unknown as TemplateGrid
  const binding = deriveBindingFromGrid(grid).binding
  const rendered = renderTemplateData(grid, binding, data)

  const buf = await renderToBuffer(
    <GenericTemplateDocument
      pageConfig={template.page_config as unknown as TemplatePageConfig}
      grid={rendered}
    />
  )
  const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer)
  return { status: 'ok', buffer, invoiceNumber: row.invoice_number, company: row.company }
}

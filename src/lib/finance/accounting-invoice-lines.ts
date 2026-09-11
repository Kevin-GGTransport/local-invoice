/**
 * 陆运账单明细行处理：请求体中的 lines 数组规范化、全量替换、合计回写主表 invoice_price
 */

import { prisma } from '@/lib/prisma'

export interface AccountingInvoiceLineInput {
  description?: string | null
  quantity?: number | string | null
  unit_price?: number | string | null
  amount?: number | string | null
  service_date?: string | Date | null
  pickup_address?: string | null
  drop_address_1?: string | null
  drop_address_2?: string | null
  drop_address_3?: string | null
}

export const ACCOUNTING_INVOICE_LINES_MAX = 200

function toAmount(value: unknown): number | null {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function toText(value: unknown): string | null {
  return String(value ?? '').trim() || null
}

function toDate(value: unknown): Date | null {
  if (value === '' || value == null) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return date.toISOString().slice(0, 10) === value ? date : null
}

export function validateAccountingInvoiceLines(lines: unknown[]): string | null {
  if (lines.length > ACCOUNTING_INVOICE_LINES_MAX) {
    return `明细行最多 ${ACCOUNTING_INVOICE_LINES_MAX} 行`
  }
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]
    if (rawLine == null || typeof rawLine !== 'object' || Array.isArray(rawLine)) {
      return `第 ${index + 1} 行明细格式无效`
    }
    const line = rawLine as AccountingInvoiceLineInput
    if (line.service_date != null && line.service_date !== '' && toDate(line.service_date) == null) {
      return `第 ${index + 1} 行运输日期无效`
    }
    if (line.amount != null && !(typeof line.amount === 'string' && line.amount.trim() === '')) {
      const validAmount =
        (typeof line.amount === 'number' &&
          Number.isFinite(line.amount) &&
          Math.abs(line.amount * 100 - Math.round(line.amount * 100)) < 1e-8) ||
        (typeof line.amount === 'string' && /^-?\d+(?:\.\d{1,2})?$/.test(line.amount.trim()))
      if (!validAmount) return `第 ${index + 1} 行 RATE 必须为最多 2 位小数的数字`
    }
    const amount = toAmount(line.amount)
    if (amount != null && (amount < -9999999999.99 || amount > 9999999999.99)) {
      return `第 ${index + 1} 行 RATE 超出范围`
    }
    for (const [label, value] of [
      ['PU', line.pickup_address],
      ['DEL 1', line.drop_address_1],
      ['DEL 2', line.drop_address_2],
      ['DEL 3', line.drop_address_3],
    ] as const) {
      if (String(value ?? '').trim().length > 500) return `第 ${index + 1} 行 ${label} 最长 500 字`
    }
  }
  return null
}

/** 过滤全空行并规范化为可入库结构（跳过没有任何内容的行） */
export function normalizeAccountingInvoiceLines(
  lines: AccountingInvoiceLineInput[]
): Array<{
  description: string | null
  quantity: number | null
  unit_price: number | null
  amount: number | null
  service_date: Date | null
  pickup_address: string | null
  drop_address_1: string | null
  drop_address_2: string | null
  drop_address_3: string | null
  sort_order: number
}> {
  return lines
    .map((line, index) => ({
      description: String(line.description ?? '').trim() || null,
      quantity: toAmount(line.quantity),
      unit_price: toAmount(line.unit_price),
      amount: toAmount(line.amount),
      service_date: toDate(line.service_date),
      pickup_address: toText(line.pickup_address),
      drop_address_1: toText(line.drop_address_1),
      drop_address_2: toText(line.drop_address_2),
      drop_address_3: toText(line.drop_address_3),
      sort_order: index,
    }))
    .filter(
      (line) =>
        line.description != null || line.quantity != null || line.unit_price != null || line.amount != null ||
        line.service_date != null || line.pickup_address != null || line.drop_address_1 != null ||
        line.drop_address_2 != null || line.drop_address_3 != null
    )
}

/** 明细合计（保留 2 位） */
export function sumLineAmounts(
  lines: Array<{ amount: number | null }>
): number | null {
  let total = 0
  let has = false
  for (const line of lines) {
    if (line.amount == null) continue
    total += line.amount
    has = true
  }
  return has ? Math.round(total * 100) / 100 : null
}

/**
 * 全量替换某张账单的明细行，并把合计回写主表 invoice_price（无有效行时保留主表现值）。
 * 必须在 withDb 上下文内调用。
 */
export async function replaceAccountingInvoiceLines(
  accountingInvoiceId: bigint,
  lines: AccountingInvoiceLineInput[]
): Promise<void> {
  const normalized = normalizeAccountingInvoiceLines(lines)
  const total = sumLineAmounts(normalized)

  await prisma.$transaction(async (tx) => {
    await tx.accounting_invoice_lines.deleteMany({
      where: { accounting_invoice_id: accountingInvoiceId },
    })
    if (normalized.length > 0) {
      await tx.accounting_invoice_lines.createMany({
        data: normalized.map((line) => ({ ...line, accounting_invoice_id: accountingInvoiceId })),
      })
    }
    if (total != null) {
      await tx.accounting_invoices.update({
        where: { id: accountingInvoiceId },
        data: { invoice_price: total },
      })
    }
  })
}

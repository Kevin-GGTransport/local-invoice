/**
 * 陆运账单明细行处理：请求体中的 lines 数组规范化、全量替换、合计回写主表 invoice_price
 */

import { prisma } from '@/lib/prisma'

export interface AccountingInvoiceLineInput {
  description?: string | null
  quantity?: number | string | null
  unit_price?: number | string | null
  amount?: number | string | null
}

function toAmount(value: unknown): number | null {
  if (value === '' || value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isNaN(n) ? null : n
}

/** 过滤全空行并规范化为可入库结构（跳过没有任何内容的行） */
export function normalizeAccountingInvoiceLines(
  lines: AccountingInvoiceLineInput[]
): Array<{ description: string | null; quantity: number | null; unit_price: number | null; amount: number | null; sort_order: number }> {
  return lines
    .map((line, index) => ({
      description: String(line.description ?? '').trim() || null,
      quantity: toAmount(line.quantity),
      unit_price: toAmount(line.unit_price),
      amount: toAmount(line.amount),
      sort_order: index,
    }))
    .filter(
      (line) =>
        line.description != null || line.quantity != null || line.unit_price != null || line.amount != null
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

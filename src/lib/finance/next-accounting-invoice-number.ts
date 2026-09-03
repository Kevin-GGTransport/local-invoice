/**
 * 陆运账单 发票号：公司前缀 + 月(2) + 年(4) + 当月 3 位顺序号（按公司按月独立计数）
 * 例：AA082026005、YG082026060、GG022026106
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export async function getNextAccountingInvoiceNumber(company: string, date: Date = new Date()): Promise<string> {
  const companyRow = await prisma.companies.findUnique({ where: { code: company } })
  if (!companyRow) {
    throw new Error(`公司「${company}」不存在，请在基础管理 → 公司管理中维护`)
  }
  const prefix = companyRow.invoice_prefix
  if (!prefix) {
    throw new Error(`公司「${company}」未配置发票号前缀，请手动填写发票号`)
  }

  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = String(date.getFullYear())
  const key = `${prefix}${mm}${yyyy}`

  const list = await prisma.accounting_invoices.findMany({
    where: {
      invoice_number: { startsWith: key },
    },
    select: { invoice_number: true },
    orderBy: { invoice_number: 'desc' },
    take: 1,
  })

  let nextSeq = 1
  if (list.length > 0) {
    const suffix = list[0].invoice_number.slice(key.length)
    const num = parseInt(suffix, 10)
    if (!Number.isNaN(num) && num >= 0) nextSeq = num + 1
  }

  return `${key}${String(nextSeq).padStart(3, '0')}`
}

/**
 * 货号 / 总货号 —— 系统自动递增分配，视为记录 ID，用户不可编辑
 * 取两列现有最大纯数字值 +1（空表从 1 开始），两列同值
 * 接受事务客户端，避免并发创建拿到相同序号
 */
export async function getNextAccountingOrderNumbers(
  tx: Prisma.TransactionClient
): Promise<{ masterOrderNumber: string; orderNumber: string }> {
  const rows = await tx.accounting_invoices.findMany({
    select: { master_order_number: true, order_number: true },
    take: 1000,
    orderBy: { id: 'desc' },
  })
  let max = 0
  for (const row of rows) {
    for (const v of [row.master_order_number, row.order_number]) {
      if (v == null) continue
      const t = v.trim()
      const n = parseInt(t, 10)
      if (!Number.isNaN(n) && String(n) === t && n > max) max = n
    }
  }
  const next = String(max + 1)
  return { masterOrderNumber: next, orderNumber: next }
}

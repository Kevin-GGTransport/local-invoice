/**
 * 陆运账单 发票号：公司前缀 + 月(2) + 年(4) + 当月 3 位顺序号（按公司按月独立计数）
 * 例：AA082026005、YG082026060、GG022026106
 */

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

import { z } from "zod"
import type { Prisma } from "@prisma/client"

export const MAX_ACCOUNTING_INVOICE_SEND = 40
const POSTGRES_BIGINT_MAX = BigInt("9223372036854775807")

function isCanonicalPostgresBigint(value: string): boolean {
  return /^[1-9]\d*$/.test(value) && BigInt(value) <= POSTGRES_BIGINT_MAX
}

const invoiceIdSchema = z.string().refine(isCanonicalPostgresBigint, "账单 ID 无效或超出范围")

function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export const accountingInvoiceSendSchema = z.object({
  ids: z
    .array(invoiceIdSchema)
    .min(1, "请选择要发送的账单")
    .max(MAX_ACCOUNTING_INVOICE_SEND, `一次最多发送 ${MAX_ACCOUNTING_INVOICE_SEND} 条`)
    .refine((ids) => new Set(ids).size === ids.length, "账单 ID 不能重复"),
  invoice_date: z.string().refine(isRealIsoDate, "Invoice 日期无效"),
})

export function invoiceDateToUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

export class AccountingInvoiceSendError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

type SendTransaction = Pick<Prisma.TransactionClient, "accounting_invoices" | "invoice_templates">

export async function sendAccountingInvoices(
  tx: SendTransaction,
  input: { rawIds: string[]; invoiceDate: Date; invoiceDateText: string; updatedBy: bigint | null }
) {
  const { rawIds, invoiceDate, invoiceDateText, updatedBy } = input
  const ids = rawIds.map(BigInt)
  const records = await tx.accounting_invoices.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      invoice_number: true,
      invoice_date: true,
      company: true,
    },
  })

  const foundIds = new Set(records.map((record) => record.id.toString()))
  const missing = rawIds.filter((id) => !foundIds.has(id))
  if (missing.length > 0) {
    throw new AccountingInvoiceSendError(`账单不存在：${missing.join("、")}`, 404)
  }

  const alreadySent = records.filter((record) => record.invoice_date != null)
  if (alreadySent.length > 0) {
    throw new AccountingInvoiceSendError(
      `以下账单已发送：${alreadySent.map((record) => record.invoice_number).join("、")}`,
      409
    )
  }

  const companies = [...new Set(records.map((record) => record.company))]
  const activeTemplates = await tx.invoice_templates.findMany({
    where: { status: "active", company: { code: { in: companies } } },
    select: { company: { select: { code: true } } },
  })
  const supportedCompanies = new Set(activeTemplates.map((template) => template.company.code))
  const unsupported = companies.filter((company) => !supportedCompanies.has(company))
  if (unsupported.length > 0) {
    throw new AccountingInvoiceSendError(`以下公司暂无启用的 PDF 模板：${unsupported.join("、")}`, 400)
  }

  const updateResult = await tx.accounting_invoices.updateMany({
    where: { id: { in: ids }, invoice_date: null },
    data: {
      invoice_date: invoiceDate,
      ...(updatedBy != null ? { updated_by: updatedBy } : {}),
    },
  })
  if (updateResult.count !== rawIds.length) {
    throw new AccountingInvoiceSendError("部分账单已被发送，本次操作已取消，请刷新后重试", 409)
  }

  return { count: updateResult.count, ids: rawIds, invoice_date: invoiceDateText }
}

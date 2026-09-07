import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { invoiceIdSchema, isRealIsoDate, invoiceDateToUtc } from "./accounting-invoice-send"

export const MAX_NEGATIVE_INVOICE_DATE_BATCH = 1000

export const negativeInvoiceDateSchema = z.object({
  ids: z.array(invoiceIdSchema)
    .min(1, "请选择负数账单")
    .max(MAX_NEGATIVE_INVOICE_DATE_BATCH, "一次最多修改 1000 条")
    .refine((ids) => new Set(ids).size === ids.length, "账单 ID 不能重复"),
  invoice_date: z.string().refine(isRealIsoDate, "Invoice 日期无效"),
})

export class NegativeInvoiceDateError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

// 必须在事务中调用：计数不一致时抛出错误，使整个批次回滚。
export async function updateNegativeInvoiceDates(
  tx: Pick<Prisma.TransactionClient, "accounting_invoices">,
  input: z.infer<typeof negativeInvoiceDateSchema>,
  updatedBy: bigint | null,
) {
  const ids = input.ids.map(BigInt)
  const records = await tx.accounting_invoices.findMany({
    where: { id: { in: ids } },
    select: { id: true, invoice_number: true, invoice_price: true },
  })
  if (records.length !== ids.length) {
    throw new NegativeInvoiceDateError("部分账单不存在，请刷新后重试", 404)
  }
  const invalid = records.filter((row) => row.invoice_price == null || !row.invoice_price.lessThan(0))
  if (invalid.length) {
    throw new NegativeInvoiceDateError(
      `仅可修改负数账单：${invalid.map((row) => row.invoice_number).join("、")} 不符合条件`, 409,
    )
  }
  const result = await tx.accounting_invoices.updateMany({
    where: { id: { in: ids }, invoice_price: { lt: 0 } },
    data: {
      invoice_date: invoiceDateToUtc(input.invoice_date),
      ...(updatedBy != null ? { updated_by: updatedBy } : {}),
    },
  })
  if (result.count !== ids.length) {
    throw new NegativeInvoiceDateError("账单状态已变化，本次操作已取消，请刷新后重试", 409)
  }
  return { count: result.count, ids: input.ids, invoice_date: input.invoice_date }
}

import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { invoiceIdSchema } from "./accounting-invoice-send"

export const MAX_INVOICE_DEDUCTION_BATCH = 1000

/** 扣钱为纯文本说明；传 null 清除 */
export const invoiceDeductionSchema = z.object({
  ids: z.array(invoiceIdSchema)
    .min(1, "请选择账单")
    .max(MAX_INVOICE_DEDUCTION_BATCH, "一次最多修改 1000 条")
    .refine((ids) => new Set(ids).size === ids.length, "账单 ID 不能重复"),
  deduction: z.string().max(200, "扣钱说明最长 200 字").nullable(),
})

export class InvoiceDeductionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

// 必须在事务中调用：计数不一致时抛出错误，使整个批次回滚。
export async function updateInvoiceDeductions(
  tx: Pick<Prisma.TransactionClient, "accounting_invoices">,
  input: z.infer<typeof invoiceDeductionSchema>,
  updatedBy: bigint | null,
) {
  const ids = input.ids.map(BigInt)
  const count = await tx.accounting_invoices.count({ where: { id: { in: ids } } })
  if (count !== ids.length) {
    throw new InvoiceDeductionError("部分账单不存在，请刷新后重试", 404)
  }
  const result = await tx.accounting_invoices.updateMany({
    where: { id: { in: ids } },
    data: {
      deduction: input.deduction,
      ...(updatedBy != null ? { updated_by: updatedBy } : {}),
    },
  })
  if (result.count !== ids.length) {
    throw new InvoiceDeductionError("账单状态已变化，本次操作已取消，请刷新后重试", 409)
  }
  return { count: result.count, ids: input.ids, deduction: input.deduction }
}

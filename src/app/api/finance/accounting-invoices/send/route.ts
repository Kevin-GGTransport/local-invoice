/**
 * 单条/批量发账单：首次设置 invoice_date。
 * 任一记录不存在、已发送或无启用 PDF 模板时，整批不更新。
 */

import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import {
  AccountingInvoiceSendError,
  accountingInvoiceSendSchema,
  invoiceDateToUtc,
  sendAccountingInvoices,
} from "@/lib/finance/accounting-invoice-send"
import {
  handleDbError,
  jsonError,
  jsonOk,
  readJsonBody,
  requireSession,
  userIdBigint,
} from "@/lib/api-helpers"

const MAX_SERIALIZABLE_ATTEMPTS = 3

export async function POST(request: Request) {
  const { session, error } = await requireSession()
  if (error) return error

  try {
    const parsed = accountingInvoiceSendSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "参数校验失败", 400)
    }

    const { ids: rawIds, invoice_date } = parsed.data
    const invoiceDate = invoiceDateToUtc(invoice_date)
    const updatedBy = userIdBigint(session)

    let result: Awaited<ReturnType<typeof sendAccountingInvoices>> | null = null
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        result = await prisma.$transaction(
          (tx) => sendAccountingInvoices(tx, {
            rawIds,
            invoiceDate,
            invoiceDateText: invoice_date,
            updatedBy,
          }),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        )
        break
      } catch (err) {
        const isWriteConflict = (err as { code?: string })?.code === "P2034"
        if (!isWriteConflict || attempt === MAX_SERIALIZABLE_ATTEMPTS) throw err
      }
    }

    if (result == null) return jsonError("发账单冲突，请刷新后重试", 409)
    return jsonOk(result)
  } catch (err) {
    if (err instanceof AccountingInvoiceSendError) return jsonError(err.message, err.status)
    if ((err as { code?: string })?.code === "P2034") {
      return jsonError("发账单冲突，请刷新后重试", 409)
    }
    return handleDbError(err, "发账单失败")
  }
}

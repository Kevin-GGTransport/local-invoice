import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import {
  NegativeInvoiceDateError,
  negativeInvoiceDateSchema,
  updateNegativeInvoiceDates,
} from "@/lib/finance/accounting-invoice-negative-date"
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
    const parsed = negativeInvoiceDateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "参数校验失败", 400)
    }

    const updatedBy = userIdBigint(session)

    let result: Awaited<ReturnType<typeof updateNegativeInvoiceDates>> | null = null
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        result = await prisma.$transaction(
          (tx) => updateNegativeInvoiceDates(tx, parsed.data, updatedBy),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        )
        break
      } catch (err) {
        const isWriteConflict = (err as { code?: string })?.code === "P2034"
        if (!isWriteConflict || attempt === MAX_SERIALIZABLE_ATTEMPTS) throw err
      }
    }

    if (result == null) return jsonError("修改 Invoice 日期冲突，请刷新后重试", 409)
    return jsonOk(result)
  } catch (err) {
    if (err instanceof NegativeInvoiceDateError) return jsonError(err.message, err.status)
    if ((err as { code?: string })?.code === "P2034") {
      return jsonError("修改 Invoice 日期冲突，请刷新后重试", 409)
    }
    return handleDbError(err, "修改 Invoice 日期失败")
  }
}

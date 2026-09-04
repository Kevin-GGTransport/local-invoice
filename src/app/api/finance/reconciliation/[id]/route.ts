import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  jsonError,
  jsonOk,
  handleDbError,
  readJsonBody,
  requireAdmin,
  userIdBigint,
} from "@/lib/api-helpers"
import {
  reconciliationDateToUtc,
  updateReconciliationSchema,
} from "@/lib/validations/accounting-invoice-reconciliation"

function parseId(raw: string): bigint | null {
  return /^[1-9]\d*$/.test(raw) ? BigInt(raw) : null
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin()
  if (error) return error

  try {
    const id = parseId((await params).id)
    if (id == null) return jsonError("无效的销账 ID", 400)
    const parsed = updateReconciliationSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "参数校验失败", 400)

    const actor = userIdBigint(session)
    const record = await prisma.$transaction(async (tx) => {
      const originalById = await tx.accounting_invoice_reconciliations.findUnique({ where: { id } })
      if (!originalById) throw new Error("RECONCILIATION_NOT_ACTIVE")
      const existingReplacement = await tx.accounting_invoice_reconciliations.findUnique({
        where: { request_id: parsed.data.request_id },
      })
      if (existingReplacement) {
        const payloadMatches = existingReplacement.accounting_invoice_id === originalById.accounting_invoice_id
          && existingReplacement.check_date.toISOString().slice(0, 10) === parsed.data.check_date
          && Number(existingReplacement.check_amount) === parsed.data.check_amount
          && existingReplacement.check_number === parsed.data.check_number
          && (existingReplacement.notes ?? null) === (parsed.data.notes || null)
        if (!payloadMatches) throw new Error("IDEMPOTENCY_CONFLICT")
        return existingReplacement
      }

      const original = await tx.accounting_invoice_reconciliations.findFirst({
        where: { id, voided_at: null },
      })
      if (!original) throw new Error("RECONCILIATION_NOT_ACTIVE")

      const voided = await tx.accounting_invoice_reconciliations.updateMany({
        where: { id, voided_at: null },
        data: {
          voided_at: new Date(),
          voided_by: actor,
          void_reason: `管理员修改，已生成替代记录 ${parsed.data.request_id}`,
          updated_by: actor,
        },
      })
      if (voided.count !== 1) {
        const concurrentReplacement = await tx.accounting_invoice_reconciliations.findUnique({
          where: { request_id: parsed.data.request_id },
        })
        if (concurrentReplacement) {
          const payloadMatches = concurrentReplacement.accounting_invoice_id === originalById.accounting_invoice_id
            && concurrentReplacement.check_date.toISOString().slice(0, 10) === parsed.data.check_date
            && Number(concurrentReplacement.check_amount) === parsed.data.check_amount
            && concurrentReplacement.check_number === parsed.data.check_number
            && (concurrentReplacement.notes ?? null) === (parsed.data.notes || null)
          if (!payloadMatches) throw new Error("IDEMPOTENCY_CONFLICT")
          return concurrentReplacement
        }
        throw new Error("RECONCILIATION_NOT_ACTIVE")
      }
      return tx.accounting_invoice_reconciliations.create({
        data: {
          accounting_invoice_id: original.accounting_invoice_id,
          request_id: parsed.data.request_id,
          check_date: reconciliationDateToUtc(parsed.data.check_date),
          check_amount: parsed.data.check_amount,
          check_number: parsed.data.check_number,
          notes: parsed.data.notes || null,
          created_by: actor,
          updated_by: actor,
        },
      })
    })
    return jsonOk(record)
  } catch (err) {
    if (err instanceof Error && err.message === "RECONCILIATION_NOT_ACTIVE") return jsonError("销账记录不存在或已撤销", 409)
    if (err instanceof Error && err.message === "IDEMPOTENCY_CONFLICT") return jsonError("该请求标识已用于不同的销账内容", 409)
    return handleDbError(err, "更新销账记录失败")
  }
}

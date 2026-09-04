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
import { voidReconciliationSchema } from "@/lib/validations/accounting-invoice-reconciliation"

function parseId(raw: string): bigint | null {
  return /^[1-9]\d*$/.test(raw) ? BigInt(raw) : null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin()
  if (error) return error

  try {
    const id = parseId((await params).id)
    if (id == null) return jsonError("无效的销账 ID", 400)
    const parsed = voidReconciliationSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "参数校验失败", 400)

    const result = await prisma.accounting_invoice_reconciliations.updateMany({
      where: { id, voided_at: null },
      data: {
        voided_at: new Date(),
        voided_by: userIdBigint(session),
        void_reason: parsed.data.reason,
        updated_by: userIdBigint(session),
      },
    })
    if (result.count !== 1) return jsonError("销账记录不存在或已撤销", 409)
    return jsonOk({ id: id.toString() })
  } catch (err) {
    return handleDbError(err, "撤销销账记录失败")
  }
}

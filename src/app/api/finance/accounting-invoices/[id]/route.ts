/**
 * 陆运账单 API - 详情 / 更新 / 删除
 * body 携带 lines 数组时，主记录更新与明细行全量替换、合计回写在同一事务内完成
 */

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  normalizeAccountingInvoiceLines,
  sumLineAmounts,
  type AccountingInvoiceLineInput,
} from "@/lib/finance/accounting-invoice-lines"
import { toInvoiceUpdateData } from "@/lib/finance/accounting-invoice-input"
import { accountingInvoiceUpdateSchema } from "@/lib/validations/accounting-invoice"
import { requireSession, userIdBigint, jsonOk, jsonError, handleDbError } from "@/lib/api-helpers"

function parseId(raw: string): bigint | null {
  return /^\d+$/.test(raw) ? BigInt(raw) : null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireSession()
  if (error) return error

  try {
    const { id: raw } = await params
    const id = parseId(raw)
    if (id == null) return jsonError("无效的记录 ID", 400)

    const record = await prisma.accounting_invoices.findUnique({
      where: { id },
      include: { accounting_invoice_lines: { orderBy: { sort_order: "asc" } } },
    })
    if (!record) return jsonError("记录不存在", 404)

    return jsonOk({ data: record })
  } catch (err) {
    return handleDbError(err, "查询陆运账单失败")
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireSession()
  if (error) return error

  try {
    const { id: raw } = await params
    const id = parseId(raw)
    if (id == null) return jsonError("无效的记录 ID", 400)

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const { lines, ...rest } = body

    const parsed = accountingInvoiceUpdateSchema.safeParse(rest)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "参数校验失败", 400)
    }

    const data = toInvoiceUpdateData(parsed.data)
    const updatedBy = userIdBigint(session)
    if (updatedBy != null) data.updated_by = updatedBy

    const hasLines = Array.isArray(lines)
    const normalized = hasLines
      ? normalizeAccountingInvoiceLines(lines as AccountingInvoiceLineInput[])
      : []
    const total = hasLines ? sumLineAmounts(normalized) : null

    const record = await prisma.$transaction(async (tx) => {
      let updated = await tx.accounting_invoices.update({ where: { id }, data })

      if (hasLines) {
        // 全量替换明细行，合计回写主表（无有效行时保留主表现值）
        await tx.accounting_invoice_lines.deleteMany({ where: { accounting_invoice_id: id } })
        if (normalized.length > 0) {
          await tx.accounting_invoice_lines.createMany({
            data: normalized.map((line) => ({ ...line, accounting_invoice_id: id })),
          })
        }
        if (total != null) {
          updated = await tx.accounting_invoices.update({
            where: { id },
            data: { invoice_price: total },
          })
        }
      }

      return updated
    })

    return jsonOk({ data: record })
  } catch (err) {
    return handleDbError(err, "更新陆运账单失败")
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireSession()
  if (error) return error

  try {
    const { id: raw } = await params
    const id = parseId(raw)
    if (id == null) return jsonError("无效的记录 ID", 400)

    await prisma.accounting_invoices.delete({ where: { id } })
    return jsonOk({ data: { id: id.toString() } })
  } catch (err) {
    return handleDbError(err, "删除陆运账单失败")
  }
}

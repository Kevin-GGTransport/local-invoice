/**
 * 陆运账单 API - 详情 / 更新 / 删除
 * body 携带 lines 数组时，主记录更新与明细行全量替换、合计回写在同一事务内完成
 */

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  normalizeAccountingInvoiceLines,
  sumLineAmounts,
  validateAccountingInvoiceLines,
  type AccountingInvoiceLineInput,
} from "@/lib/finance/accounting-invoice-lines"
import { toInvoiceUpdateData } from "@/lib/finance/accounting-invoice-input"
import { accountingInvoiceUpdateSchema } from "@/lib/validations/accounting-invoice"
import { validateAccountingInvoiceRendererSelection } from "@/lib/finance/accounting-invoice-renderers"
import {
  requireSession,
  userIdBigint,
  jsonOk,
  jsonError,
  handleDbError,
  readJsonBody,
} from "@/lib/api-helpers"

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

    return jsonOk(record)
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

    const body = await readJsonBody(request)
    const { lines, ...rest } = body
    if (lines !== undefined && !Array.isArray(lines)) {
      return jsonError("lines 必须为数组", 400)
    }

    const parsed = accountingInvoiceUpdateSchema.safeParse(rest)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "参数校验失败", 400)
    }

    const current = await prisma.accounting_invoices.findUnique({
      where: { id },
      select: { company: true, invoice_template_id: true, renderer_key: true },
    })
    if (!current) return jsonError("记录不存在", 404)

    // 更换公司时必须同步规范化版式选择，避免保留跨公司的旧模版/内置渲染器。
    const companyChanged = parsed.data.company != null && parsed.data.company !== current.company
    if (companyChanged) {
      if (parsed.data.renderer_key != null) {
        if (parsed.data.invoice_template_id === undefined) parsed.data.invoice_template_id = null
      } else if (parsed.data.invoice_template_id != null) {
        if (parsed.data.renderer_key === undefined) parsed.data.renderer_key = null
      } else {
        const fallback = await prisma.invoice_templates.findFirst({
          where: { status: "active", is_default: true, company: { code: parsed.data.company! } },
          select: { id: true },
        })
        parsed.data.invoice_template_id = fallback?.id.toString() ?? null
        parsed.data.renderer_key = null
      }
    }


    const effectiveCompany = parsed.data.company ?? current.company
    const effectiveRendererKey = parsed.data.renderer_key === undefined ? current.renderer_key : parsed.data.renderer_key
    const effectiveTemplateId = parsed.data.invoice_template_id === undefined
      ? current.invoice_template_id?.toString() ?? null
      : parsed.data.invoice_template_id
    const rendererError = validateAccountingInvoiceRendererSelection({
      company: effectiveCompany,
      rendererKey: effectiveRendererKey,
      invoiceTemplateId: effectiveTemplateId,
    })
    if (rendererError) return jsonError(rendererError, 400)

    const lineError = Array.isArray(lines)
      ? validateAccountingInvoiceLines(lines as AccountingInvoiceLineInput[])
      : null
    if (lineError) return jsonError(lineError, 400)

    if (effectiveTemplateId) {
      const selectedTemplate = await prisma.invoice_templates.findFirst({
        where: { id: BigInt(effectiveTemplateId), status: "active", company: { code: effectiveCompany } },
        select: { id: true },
      })
      if (!selectedTemplate) return jsonError("所选模版不属于该公司或尚未发布", 400)
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

    return jsonOk(record)
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
    return jsonOk({ id: id.toString() })
  } catch (err) {
    return handleDbError(err, "删除陆运账单失败")
  }
}

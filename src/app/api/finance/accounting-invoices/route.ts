/**
 * 陆运账单 API - 列表 & 创建（单库单 Prisma 实例）
 * 创建时发票号留空则按公司前缀自动生成（前缀+月+年+3位序号）；
 * 主记录与明细行同一事务写入，并把明细合计回写主表 invoice_price
 */

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  buildAccountingInvoiceWhere,
  buildAccountingInvoiceOrderBy,
} from "@/lib/finance/accounting-invoice-query"
import { getNextAccountingInvoiceNumber } from "@/lib/finance/next-accounting-invoice-number"
import {
  normalizeAccountingInvoiceLines,
  sumLineAmounts,
  type AccountingInvoiceLineInput,
} from "@/lib/finance/accounting-invoice-lines"
import { toInvoiceCreateData } from "@/lib/finance/accounting-invoice-input"
import { accountingInvoiceCreateSchema } from "@/lib/validations/accounting-invoice"
import {
  requireSession,
  userIdBigint,
  jsonOk,
  jsonError,
  handleDbError,
  readJsonBody,
} from "@/lib/api-helpers"

export async function GET(request: NextRequest) {
  const { error } = await requireSession()
  if (error) return error

  try {
    const params = request.nextUrl.searchParams
    const page = Math.max(1, Number(params.get("page")) || 1)
    const pageSize = Math.min(500, Math.max(1, Number(params.get("pageSize")) || 100))
    const where = buildAccountingInvoiceWhere(params)
    const orderBy = buildAccountingInvoiceOrderBy(params)

    const [rows, total] = await prisma.$transaction([
      prisma.accounting_invoices.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.accounting_invoices.count({ where }),
    ])

    return jsonOk({ rows, pagination: { total, page, pageSize } })
  } catch (err) {
    return handleDbError(err, "查询陆运账单失败")
  }
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error) return error

  try {
    const body = await readJsonBody(request)
    const { lines, ...rest } = body

    // 发票号留空 → 先按公司前缀 + 月 + 年 + 当月序号自动生成，再进校验
    if (!String(rest.invoice_number ?? "").trim() && rest.company) {
      try {
        rest.invoice_number = await getNextAccountingInvoiceNumber(String(rest.company))
      } catch (err) {
        return jsonError(err instanceof Error ? err.message : "发票号自动生成失败", 400)
      }
    }

    const parsed = accountingInvoiceCreateSchema.safeParse(rest)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "参数校验失败", 400)
    }

    const normalized = Array.isArray(lines)
      ? normalizeAccountingInvoiceLines(lines as AccountingInvoiceLineInput[])
      : []
    const total = sumLineAmounts(normalized)

    const data = toInvoiceCreateData(parsed.data)
    if (total != null) data.invoice_price = total
    const createdBy = userIdBigint(session)
    if (createdBy != null) data.created_by = createdBy

    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.accounting_invoices.create({ data })
      if (normalized.length > 0) {
        await tx.accounting_invoice_lines.createMany({
          data: normalized.map((line) => ({ ...line, accounting_invoice_id: created.id })),
        })
      }
      return created
    })

    return jsonOk(record, 201)
  } catch (err) {
    return handleDbError(err, "创建陆运账单失败")
  }
}

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { reconciliationSummary } from "@/lib/finance/accounting-invoice-reconciliation"
import {
  createReconciliationsSchema,
  reconciliationDateToUtc,
} from "@/lib/validations/accounting-invoice-reconciliation"
import {
  handleDbError,
  jsonError,
  jsonOk,
  readJsonBody,
  requireSession,
  userIdBigint,
} from "@/lib/api-helpers"

function serializeInvoice(row: Awaited<ReturnType<typeof findRows>>[number]) {
  const active = row.accounting_invoice_reconciliations.filter((item) => item.voided_at == null)
  return {
    ...row,
    ...reconciliationSummary(row.invoice_price, active.map((item) => item.check_amount)),
  }
}

async function findRows(args: Parameters<typeof prisma.accounting_invoices.findMany>[0]) {
  return prisma.accounting_invoices.findMany({
    ...args,
    include: {
      accounting_invoice_reconciliations: {
        orderBy: [{ check_date: "desc" }, { id: "desc" }],
      },
    },
  })
}

export async function GET(request: NextRequest) {
  const { error } = await requireSession()
  if (error) return error

  try {
    const params = request.nextUrl.searchParams
    const page = Math.max(1, Number(params.get("page")) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(params.get("pageSize")) || 50))
    const status = params.get("status") ?? "unreconciled"
    const search = params.get("search")?.trim()
    const company = params.get("company")?.trim()

    const where = {
      ...(company ? { company } : {}),
      ...(search ? {
        OR: [
          "invoice_number",
          "master_order_number",
          "order_number",
          "broker_load_number",
          "bill_to",
        ].map((field) => ({ [field]: { contains: search, mode: "insensitive" as const } })),
      } : {}),
      ...(status === "unreconciled" ? {
        accounting_invoice_reconciliations: { none: { voided_at: null } },
      } : status === "reconciled" ? {
        accounting_invoice_reconciliations: { some: { voided_at: null } },
      } : {}),
    }

    const [rows, total] = await Promise.all([
      findRows({
        where,
        orderBy: [{ invoice_date: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.accounting_invoices.count({ where }),
    ])

    return jsonOk({
      rows: rows.map(serializeInvoice),
      pagination: { total, page, pageSize },
    })
  } catch (err) {
    return handleDbError(err, "查询销账列表失败")
  }
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error) return error

  try {
    const parsed = createReconciliationsSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "参数校验失败", 400)

    const requestIds = parsed.data.items.map((item) => item.request_id)
    const existing = await prisma.accounting_invoice_reconciliations.findMany({
      where: { request_id: { in: requestIds } },
    })
    if (existing.length === requestIds.length) {
      const byRequestId = new Map(existing.map((record) => [record.request_id, record]))
      const payloadMatches = parsed.data.items.every((item) => {
        const record = byRequestId.get(item.request_id)
        return record != null
          && record.accounting_invoice_id === BigInt(item.invoice_id)
          && record.check_date.toISOString().slice(0, 10) === item.check_date
          && Number(record.check_amount) === item.check_amount
          && record.check_number === item.check_number
          && (record.notes ?? null) === (item.notes || null)
      })
      if (!payloadMatches) return jsonError("该请求标识已用于不同的销账内容，请刷新后重试", 409)
      return jsonOk({ count: existing.length, records: existing })
    }
    if (existing.length > 0) return jsonError("部分销账请求已处理，请刷新后重试", 409)

    const invoiceIds = [...new Set(parsed.data.items.map((item) => item.invoice_id))].map(BigInt)
    const createdBy = userIdBigint(session)
    const records = await prisma.$transaction(async (tx) => {
      const invoices = await tx.accounting_invoices.findMany({
        where: { id: { in: invoiceIds } },
        select: { id: true },
      })
      if (invoices.length !== invoiceIds.length) throw new Error("INVOICE_NOT_FOUND")

      const created = []
      for (const item of parsed.data.items) {
        created.push(await tx.accounting_invoice_reconciliations.create({
          data: {
            accounting_invoice_id: BigInt(item.invoice_id),
            request_id: item.request_id,
            check_date: reconciliationDateToUtc(item.check_date),
            check_amount: item.check_amount,
            check_number: item.check_number,
            notes: item.notes || null,
            created_by: createdBy,
            updated_by: createdBy,
          },
        }))
      }
      return created
    })

    return jsonOk({ count: records.length, records }, 201)
  } catch (err) {
    if (err instanceof Error && err.message === "INVOICE_NOT_FOUND") return jsonError("部分账单不存在", 404)
    return handleDbError(err, "销账失败")
  }
}

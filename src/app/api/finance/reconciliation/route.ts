import { NextRequest } from "next/server"
import { Prisma, type accounting_invoice_reconciliations } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { buildReconciliationWhere, validateReconciliationQuery } from "@/lib/finance/accounting-invoice-reconciliation-query"
import {
  createReconciliationsSchema,
  reconciliationsHaveSameCompany,
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

function serializeReconciliation(row: Awaited<ReturnType<typeof findRows>>[number]) {
  const invoice = row.accounting_invoice
  return {
    id: row.id,
    invoice_id: row.accounting_invoice_id,
    master_order_number: invoice.master_order_number,
    company: invoice.company,
    order_number: invoice.order_number,
    bill_to: invoice.bill_to,
    broker_load_number: invoice.broker_load_number,
    billing_category: invoice.billing_category,
    invoice_number: invoice.invoice_number,
    check_date: row.check_date,
    check_amount: row.check_amount,
    check_number: row.check_number,
    notes: row.notes,
    voided_at: row.voided_at,
    void_reason: row.void_reason,
    created_at: row.created_at,
    created_by: row.created_by,
  }
}

async function findRows(args: Parameters<typeof prisma.accounting_invoice_reconciliations.findMany>[0]) {
  return prisma.accounting_invoice_reconciliations.findMany({
    ...args,
    include: {
      accounting_invoice: {
        select: {
          master_order_number: true,
          company: true,
          order_number: true,
          bill_to: true,
          broker_load_number: true,
          billing_category: true,
          invoice_number: true,
        },
      },
    },
  })
}

type ReconciliationInput = {
  invoice_id: string
  request_id: string
  check_date: string
  check_amount: number
  check_number: string
  notes?: string | null
}

function recordsMatchItems(records: accounting_invoice_reconciliations[], items: ReconciliationInput[]) {
  if (records.length !== items.length) return false
  const byRequestId = new Map(records.map((record) => [record.request_id, record]))
  return items.every((item) => {
    const record = byRequestId.get(item.request_id)
    return record != null
      && record.accounting_invoice_id === BigInt(item.invoice_id)
      && record.check_date.toISOString().slice(0, 10) === item.check_date
      && Number(record.check_amount) === item.check_amount
      && record.check_number === item.check_number
      && (record.notes ?? null) === (item.notes || null)
  })
}

export async function GET(request: NextRequest) {
  const { error } = await requireSession()
  if (error) return error

  try {
    const params = request.nextUrl.searchParams
    const queryError = validateReconciliationQuery(params)
    if (queryError) return jsonError(queryError, 400)
    const page = Math.max(1, Number(params.get("page")) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(params.get("pageSize")) || 50))
    const where = buildReconciliationWhere(params)

    const [rows, total] = await Promise.all([
      findRows({
        where,
        orderBy: [{ check_date: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.accounting_invoice_reconciliations.count({ where }),
    ])

    return jsonOk({
      rows: rows.map(serializeReconciliation),
      pagination: { total, page, pageSize },
    })
  } catch (err) {
    return handleDbError(err, "查询销账记录失败")
  }
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error) return error

  let reconciliationItems: ReconciliationInput[] | null = null
  try {
    const parsed = createReconciliationsSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "参数校验失败", 400)
    reconciliationItems = parsed.data.items

    const invoiceIds = [...new Set(parsed.data.items.map((item) => item.invoice_id))].map(BigInt)
    const requestIds = parsed.data.items.map((item) => item.request_id)
    const createdBy = userIdBigint(session)
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM accounting_invoices
        WHERE id IN (${Prisma.join(invoiceIds)})
        ORDER BY id
        FOR UPDATE
      `)
      const invoices = await tx.accounting_invoices.findMany({
        where: { id: { in: invoiceIds } },
        select: { id: true, company: true },
      })
      if (invoices.length !== invoiceIds.length) throw new Error("INVOICE_NOT_FOUND")
      if (!reconciliationsHaveSameCompany(invoices.map((invoice) => invoice.company))) {
        throw new Error("INVOICE_COMPANY_MISMATCH")
      }

      const existing = await tx.accounting_invoice_reconciliations.findMany({
        where: { request_id: { in: requestIds } },
      })
      if (existing.length === requestIds.length) {
        if (!recordsMatchItems(existing, parsed.data.items)) throw new Error("IDEMPOTENCY_CONFLICT")
        return { records: existing, replayed: true }
      }
      if (existing.length > 0) throw new Error("PARTIAL_IDEMPOTENCY_CONFLICT")

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
      return { records: created, replayed: false }
    })

    return jsonOk({ count: result.records.length, records: result.records }, result.replayed ? 200 : 201)
  } catch (err) {
    if (err instanceof Error && err.message === "INVOICE_NOT_FOUND") return jsonError("部分账单不存在", 404)
    if (err instanceof Error && err.message === "INVOICE_COMPANY_MISMATCH") {
      return jsonError("同一张支票只能核销同一公司的账单", 400)
    }
    if (err instanceof Error && err.message === "IDEMPOTENCY_CONFLICT") {
      return jsonError("该请求标识已用于不同的销账内容，请刷新后重试", 409)
    }
    if (err instanceof Error && err.message === "PARTIAL_IDEMPOTENCY_CONFLICT") {
      return jsonError("部分销账请求已处理，请刷新后重试", 409)
    }
    if ((err as { code?: string })?.code === "P2002") {
      if (reconciliationItems) {
        const existing = await prisma.accounting_invoice_reconciliations.findMany({
          where: { request_id: { in: reconciliationItems.map((item) => item.request_id) } },
        })
        if (recordsMatchItems(existing, reconciliationItems)) {
          return jsonOk({ count: existing.length, records: existing })
        }
      }
      return jsonError("该请求标识已被使用，请刷新后重试", 409)
    }
    return handleDbError(err, "销账失败")
  }
}

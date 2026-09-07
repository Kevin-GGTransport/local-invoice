/**
 * POST /api/finance/accounting-invoices/import
 * 账单 Excel 导入（.xlsx）：按账单编号 upsert —— 已存在则全量覆盖可导入字段，不存在则新增（货号系统分配）
 * 校验 all-or-nothing：任一行有错则整体拒绝、零写入，行级错误经 details.rowErrors 返回（jsonError 只收 string，故手写响应）
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, userIdBigint, jsonOk, jsonError, handleDbError } from "@/lib/api-helpers"
import {
  IMPORT_MAX_BYTES,
  ImportFormatError,
  type ImportRowError,
  type ImportRowPlan,
  type ImportSummary,
  parseAccountingInvoiceImportWorkbook,
  planAccountingInvoiceImport,
} from "@/lib/finance/accounting-invoice-import"
import { getNextAccountingOrderNumbers } from "@/lib/finance/next-accounting-invoice-number"

/**
 * 事务内逐行 upsert；货号只分配一次后本地递增（只有真实新增消耗序号）
 * - pg_advisory_xact_lock 串行化并发导入（货号列无唯一约束，靠锁避免两批导入拿到相同序号）；
 *   键用 SQL 字面量而非参数绑定——Prisma 会把数字参数绑成 bigint，PG 只有 (bigint) / (int,int) 两种重载
 * - 存在性在事务内重查（而非沿用事务外快照）：导入开始前记录被删/新增时，货号递增与计数仍正确
 */
async function runImport(plans: ImportRowPlan[], userId: bigint | null): Promise<ImportSummary> {
  return prisma.$transaction(
    async (tx) => {
      // $executeRaw：函数返回 void 列，$queryRaw 无法反序列化
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(91501120001)`
      const [orderNumbers, existingRows] = await Promise.all([
        getNextAccountingOrderNumbers(tx),
        tx.accounting_invoices.findMany({
          where: { invoice_number: { in: plans.map((plan) => plan.invoiceNumber) } },
          select: { invoice_number: true },
        }),
      ])
      const existingNumbers = new Set(existingRows.map((row) => row.invoice_number))
      let seq = Number.parseInt(orderNumbers.orderNumber, 10)
      for (const plan of plans) {
        const nextOrderNumber = String(seq)
        await tx.accounting_invoices.upsert({
          where: { invoice_number: plan.invoiceNumber },
          create: {
            ...plan.createData,
            master_order_number: nextOrderNumber,
            order_number: nextOrderNumber,
            ...(userId != null ? { created_by: userId } : {}),
          },
          update: {
            ...plan.updateData,
            ...(userId != null ? { updated_by: userId } : {}),
          },
        })
        if (!existingNumbers.has(plan.invoiceNumber)) seq += 1
      }
      const created = plans.filter((plan) => !existingNumbers.has(plan.invoiceNumber)).length
      return { total: plans.length, created, updated: plans.length - created }
    },
    { timeout: 60_000 }
  )
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error) return error

  try {
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) return jsonError("请选择 .xlsx 文件", 400)
    if (file.size > IMPORT_MAX_BYTES) return jsonError("文件大小不能超过 5MB", 400)
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return jsonError("仅支持 .xlsx 文件（.xls 请先另存为 .xlsx）", 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = await parseAccountingInvoiceImportWorkbook(buffer)
    // 解析阶段已有行错误时跳过 plan 的 DB 校验（文件必然整体拒绝，省两次查询）
    const planned =
      parsed.rowErrors.length > 0
        ? { plans: [], rowErrors: [] as ImportRowError[] }
        : await planAccountingInvoiceImport(prisma, parsed.rows)

    const rowErrors: ImportRowError[] = [...parsed.rowErrors, ...planned.rowErrors]
    if (rowErrors.length > 0) {
      const failedRows = new Set(rowErrors.map((item) => item.row)).size
      return NextResponse.json(
        {
          success: false,
          error: `共 ${failedRows} 行数据未通过校验，本次导入已取消（未写入任何数据）`,
          details: { rowErrors, ignoredColumns: parsed.ignoredColumns },
        },
        { status: 400 }
      )
    }

    const summary = await runImport(planned.plans, userIdBigint(session))
    return jsonOk(summary)
  } catch (err) {
    if (err instanceof ImportFormatError) return jsonError(err.message, 400)
    return handleDbError(err, "导入账单失败")
  }
}

/**
 * 陆运账单：校验后的输入（日期为 string）→ Prisma 可写入 data
 * 日期字段 'YYYY-MM-DD' → Date（UTC 零点，与 PDF 模版的 getUTC 格式化配套），空串 → null
 */
import type { Prisma } from "@prisma/client"

const DATE_KEYS = new Set([
  "invoice_date",
  "pickup_date",
  "drop_date",
])

function mapDates(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (DATE_KEYS.has(key)) {
      out[key] =
        typeof value === "string" && value.trim() !== ""
          ? new Date(`${value.trim()}T00:00:00.000Z`)
          : value === ""
            ? null
            : value
    } else {
      out[key] = value
    }
  }
  return out
}

/** zod 校验通过的对象（未知键已被剥离）→ create data */
export function toInvoiceCreateData(input: Record<string, unknown>): Prisma.accounting_invoicesCreateInput {
  return mapDates(input) as Prisma.accounting_invoicesCreateInput
}

/** zod 校验通过的对象 → update data（undefined 键 Prisma 会忽略） */
export function toInvoiceUpdateData(input: Record<string, unknown>): Prisma.accounting_invoicesUpdateInput {
  return mapDates(input) as Prisma.accounting_invoicesUpdateInput
}

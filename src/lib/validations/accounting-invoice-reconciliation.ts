import { z } from "zod"

export const MAX_RECONCILIATION_BATCH = 100
const POSTGRES_BIGINT_MAX = BigInt("9223372036854775807")

function isCanonicalPostgresBigint(value: string): boolean {
  return /^[1-9]\d*$/.test(value) && BigInt(value) <= POSTGRES_BIGINT_MAX
}

function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

const idSchema = z.string().refine(isCanonicalPostgresBigint, "ID 无效或超出范围")
const requestIdSchema = z.string().trim().min(1, "请求标识不能为空").max(100)
const checkDateSchema = z.string().refine(isRealIsoDate, "支票日期无效")
const checkNumberSchema = z
  .string()
  .trim()
  .min(1, "支票号码不能为空")
  .max(100, "支票号码不能超过 100 个字符")
  .regex(/^[A-Za-z0-9]+$/, "支票号码只能包含英文字母和数字")
  .transform((value) => value.toUpperCase())

const checkAmountSchema = z.preprocess(
  (value) => typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : value,
  z.string("销账金额必须为数字")
    .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "销账金额必须为正数且最多保留两位小数")
    .transform(Number)
    .refine((value) => value > 0, "销账金额必须大于 0")
    .refine((value) => value <= 9_999_999_999.99, "销账金额超出范围")
)

export const reconciliationItemSchema = z.object({
  invoice_id: idSchema,
  request_id: requestIdSchema,
  check_date: checkDateSchema,
  check_amount: checkAmountSchema,
  check_number: checkNumberSchema,
  notes: z.string().trim().max(500, "备注不能超过 500 个字符").optional().nullable(),
})

export const createReconciliationsSchema = z.object({
  items: z.array(reconciliationItemSchema)
    .min(1, "请选择要销账的账单")
    .max(MAX_RECONCILIATION_BATCH, `一次最多销账 ${MAX_RECONCILIATION_BATCH} 条`)
    .refine((items) => new Set(items.map((item) => item.request_id)).size === items.length, "请求标识不能重复"),
})

export const updateReconciliationSchema = z.object({
  request_id: requestIdSchema,
  check_date: checkDateSchema,
  check_amount: checkAmountSchema,
  check_number: checkNumberSchema,
  notes: z.string().trim().max(500).optional().nullable(),
})

export const voidReconciliationSchema = z.object({
  reason: z.string().trim().min(1, "请填写撤销原因").max(500, "撤销原因不能超过 500 个字符"),
})

export function reconciliationDateToUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

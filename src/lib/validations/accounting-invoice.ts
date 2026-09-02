import { z } from 'zod'

/**
 * 陆运账单校验
 * 日期字段为 string（CRUD api-handler 自动把 *_date 转 Date）
 * 金额字段同时接受 number 与数字字符串：行内编辑（EntityTable）对 currency/number
 * 字段原样发送输入框字符串（"925"/""），preprocess 统一转 number|null
 */

const moneyField = z.preprocess(
  (v) => {
    if (v === '' || v === null || v === undefined) return null
    if (typeof v === 'string') return v.trim() === '' ? null : Number(v)
    return v
  },
  z
    .number('金额必须为数字')
    .min(-9999999999.99, '金额超出范围')
    .max(9999999999.99, '金额超出范围')
    .nullable()
).optional()

export const accountingInvoiceCreateSchema = z.object({
  company: z.string().min(1, '请选择公司').max(20),
  invoice_number: z.string().min(1, '发票号不能为空').max(50),
  master_order_number: z.string().max(100).optional().nullable(),
  order_number: z.string().max(100).optional().nullable(),
  contract_date: z.string().optional().nullable(),
  contract_price: moneyField,
  broker_company: z.string().max(200).optional().nullable(),
  broker_load_number: z.string().max(100).optional().nullable(),
  from_to: z.string().max(50).optional().nullable(),
  invoice_date: z.string().optional().nullable(),
  invoice_price: moneyField,
  check_date: z.string().optional().nullable(),
  check_amount: moneyField,
  check_number: z.string().max(100).optional().nullable(),
  deduction: z.string().max(200).optional().nullable(),
  rts: z.string().max(200).optional().nullable(),
  difference: z.string().max(200).optional().nullable(),
  notes: z.string().optional().nullable(),
  bill_to: z.string().max(200).optional().nullable(),
  description: z.string().optional().nullable(),
  quantity: moneyField,
  unit_price: moneyField,
  pickup_date: z.string().optional().nullable(),
  pickup_company: z.string().max(200).optional().nullable(),
  pickup_address: z.string().max(300).optional().nullable(),
  drop_date: z.string().optional().nullable(),
  drop_company: z.string().max(200).optional().nullable(),
  drop_address: z.string().max(300).optional().nullable(),
})

export const accountingInvoiceUpdateSchema = accountingInvoiceCreateSchema.partial()

export type AccountingInvoiceCreateInput = z.infer<typeof accountingInvoiceCreateSchema>
export type AccountingInvoiceUpdateInput = z.infer<typeof accountingInvoiceUpdateSchema>

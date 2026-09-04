import { z } from 'zod'

/**
 * 陆运账单校验
 * 开账单功能只管理 PDF 上打印的字段；对账字段由其他功能维护。
 * 合同金额例外地允许在创建时设置，但更新 schema 会将它剥离忽略。
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
  contract_price: moneyField,
  broker_load_number: z.string().max(100).optional().nullable(),
  billing_category: z.string().max(50).optional().nullable(),
  tonu: z.boolean().optional(),
  invoice_price: moneyField,
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

// 合同金额只能在创建时设置，已有记录不允许通过更新接口修改。
export const accountingInvoiceUpdateSchema = accountingInvoiceCreateSchema
  .omit({ contract_price: true })
  .partial()

export type AccountingInvoiceCreateInput = z.infer<typeof accountingInvoiceCreateSchema>
export type AccountingInvoiceUpdateInput = z.infer<typeof accountingInvoiceUpdateSchema>

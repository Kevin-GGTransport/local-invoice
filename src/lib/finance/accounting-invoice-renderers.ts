export const AA_COLD_CHAIN_RENDERER_KEY = "aa_cold_chain" as const
export const AA_COLD_CHAIN_COMPANY = "AA" as const

export type AccountingInvoiceRendererKey = typeof AA_COLD_CHAIN_RENDERER_KEY

export function isBuiltInAccountingInvoiceRenderer(
  value: unknown
): value is AccountingInvoiceRendererKey {
  return value === AA_COLD_CHAIN_RENDERER_KEY
}

export function validateAccountingInvoiceRendererSelection(input: {
  company: string
  rendererKey: string | null | undefined
  invoiceTemplateId: string | null | undefined
}): string | null {
  if (!input.rendererKey) return null
  if (!isBuiltInAccountingInvoiceRenderer(input.rendererKey)) return "未知的内置账单版式"
  if (input.company !== AA_COLD_CHAIN_COMPANY) return "AA 冷链版式仅可用于 AA 公司"
  if (input.invoiceTemplateId) return "内置账单版式不能与上传模版同时选择"
  return null
}

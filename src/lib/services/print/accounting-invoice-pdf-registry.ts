/**
 * 陆运账单 PDF 模版注册表
 * 新增公司模版：新建 accounting-invoice-<code>-pdf.tsx → 在此注册一行 →
 * 并把公司加入 ACCOUNTING_PDF_TEMPLATE_COMPANIES（lib/finance/accounting-invoice-companies.ts）
 */

import type { ComponentType } from 'react'
import type { AccountingInvoicePdfPayload } from './accounting-invoice-pdf-types'
import { AccountingInvoiceAaDocument } from './accounting-invoice-aa-pdf'
import { AccountingInvoiceYgDocument } from './accounting-invoice-yg-pdf'

export const ACCOUNTING_INVOICE_PDF_TEMPLATES: Partial<
  Record<string, ComponentType<{ data: AccountingInvoicePdfPayload }>>
> = {
  AA: AccountingInvoiceAaDocument,
  YG: AccountingInvoiceYgDocument,
}

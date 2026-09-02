/**
 * 陆运账单 PDF —— payload 类型与两家公司的固定信息（逐字照业务样张）
 */

export interface AccountingInvoicePdfLine {
  description: string
  quantity: string
  unitPrice: string
  amount: string
}

export interface AccountingInvoicePdfPayload {
  company: string
  invoiceNumber: string
  invoiceDate: string // MM/DD/YYYY
  loadNumber: string // Load no. / Load #
  billTo: string
  invoicePrice: string // $925.00（合计，明细行金额之和）
  amount: string // 合计（与 invoicePrice 同值，YG Total/Balance Due 用）
  lines: AccountingInvoicePdfLine[] // 明细行（无明细时回退旧版单行字段）
  pickupDate: string
  pickupCompany: string
  pickupAddress: string
  dropDate: string
  dropCompany: string
  dropAddress: string
}

/** AA —— ALREADY ARRIVED LOGISTICS INC（橙色模版） */
export const AA_PDF_COMPANY_NAME = 'ALREADY ARRIVED LOGISTICS INC'
export const AA_PDF_ADDRESS_LINES = ['4011 Berdina Rd', 'Castro Valley CA 94546']
export const AA_PDF_PHONE = '510-330-9581'
export const AA_PDF_EMAIL = 'Alreadyarrivedlogistics@gmail.com'

/** YG —— YG Trucking LLC（粉色模版） */
export const YG_PDF_COMPANY_NAME = 'YG Trucking LLC'
export const YG_PDF_ADDRESS_LINES = ['PO Box 6213', 'Hayward CA 94545']
export const YG_PDF_PHONE = '(707) 293-4042'
export const YG_PDF_EMAIL = 'dispatch@ygtrucking.llc'

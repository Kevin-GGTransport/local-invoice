import { AccountingInvoiceDetailClient } from "./accounting-invoice-detail-client"

/**
 * 陆运账单详情页 —— 模版编辑器整页版：编辑保存（PUT），保存后可单独打印 PDF
 */
export default async function AccountingInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <AccountingInvoiceDetailClient id={id} />
}

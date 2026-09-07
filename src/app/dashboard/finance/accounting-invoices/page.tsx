import { AccountingInvoiceTable } from "./accounting-invoice-table"

/**
 * 陆运账单列表页：筛选/分页/批量打印导出/新建编辑入口
 */
export default function AccountingInvoicesPage() {
  const initialToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())

  return <AccountingInvoiceTable initialToday={initialToday} />
}

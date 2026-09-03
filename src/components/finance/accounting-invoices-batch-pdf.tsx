"use client"

import { Button } from "@/components/ui/button"
import { FileStack } from "lucide-react"
import { toast } from "sonner"
import { ACCOUNTING_PDF_TEMPLATE_COMPANIES } from "@/lib/finance/accounting-invoice-companies"
import { openPdf } from "@/lib/utils/open-pdf"

type AccountingInvoiceRow = {
  id?: string | number | bigint | null
  company?: string | null
}

/** 陆运账单：勾选后合并打开 PDF（GET /api/finance/accounting-invoices/batch-pdf） */
export function AccountingInvoicesBatchPdf({ selectedRows }: { selectedRows: AccountingInvoiceRow[] }) {
  const handleClick = () => {
    const rows = selectedRows.filter((row) => row.id != null && String(row.id) !== "")
    if (rows.length === 0) {
      toast.error("请先勾选要打印的记录")
      return
    }
    if (rows.length > 40) {
      toast.error("单次最多选择 40 条")
      return
    }

    const unsupported = [...new Set(rows.map((r) => r.company).filter((c): c is string => !!c && !ACCOUNTING_PDF_TEMPLATE_COMPANIES.includes(c)))]
    if (unsupported.length > 0) {
      toast.error(`以下公司暂无 PDF 模版：${unsupported.join("、")}`)
      return
    }

    const ids = [...new Set(rows.map((row) => String(row.id)))]
    openPdf(`/api/finance/accounting-invoices/batch-pdf?ids=${encodeURIComponent(ids.join(","))}`)
    toast.success(`已打开合并陆运账单 PDF（${ids.length} 张）`)
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={handleClick} className="min-w-[120px]">
      <FileStack className="mr-2 h-4 w-4" />
      生成账单 PDF
    </Button>
  )
}

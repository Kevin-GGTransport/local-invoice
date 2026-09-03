"use client"

import { Button } from "@/components/ui/button"
import { FileStack } from "lucide-react"
import { toast } from "sonner"
import { fetchJson } from "@/lib/api/client"
import { openPdf } from "@/lib/utils/open-pdf"

type AccountingInvoiceRow = {
  id?: string | number | bigint | null
  company?: string | null
}

/** 陆运账单：勾选后合并打开 PDF（GET /api/finance/accounting-invoices/batch-pdf） */
export function AccountingInvoicesBatchPdf({ selectedRows }: { selectedRows: AccountingInvoiceRow[] }) {
  const handleClick = async () => {
    const rows = selectedRows.filter((row) => row.id != null && String(row.id) !== "")
    if (rows.length === 0) {
      toast.error("请先勾选要打印的记录")
      return
    }
    if (rows.length > 40) {
      toast.error("单次最多选择 40 条")
      return
    }

    let companyOptions: { code: string; has_active_template: boolean }[] = []
    try {
      companyOptions = await fetchJson<{ code: string; has_active_template: boolean }[]>("/api/companies")
    } catch {
      // 拉取失败时放行，由后端做最终校验
    }
    const unsupported = [
      ...new Set(
        rows
          .map((r) => r.company)
          .filter((c): c is string => !!c)
          .filter((c) => !companyOptions.find((o) => o.code === c)?.has_active_template)
      ),
    ]
    if (companyOptions.length > 0 && unsupported.length > 0) {
      toast.error(`以下公司暂无 PDF 模版：${unsupported.join("、")}`)
      return
    }

    const ids = [...new Set(rows.map((row) => String(row.id)))]
    openPdf(`/api/finance/accounting-invoices/batch-pdf?ids=${encodeURIComponent(ids.join(","))}`)
    toast.success(`已打开合并陆运账单 PDF（${ids.length} 张）`)
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => void handleClick()} className="min-w-[120px]">
      <FileStack className="mr-2 h-4 w-4" />
      生成账单 PDF
    </Button>
  )
}

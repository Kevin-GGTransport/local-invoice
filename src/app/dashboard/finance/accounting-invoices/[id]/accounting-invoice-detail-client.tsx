"use client"

/**
 * 陆运账单详情页（客户端）—— 拉取记录后复用模版编辑表单：
 * 编辑 → 保存 → 保存后横幅/页头均可单独打印 PDF
 */

import React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { AccountingInvoiceForm } from "@/components/finance/accounting-invoice-form"
import { ACCOUNTING_PDF_TEMPLATE_COMPANIES } from "@/lib/finance/accounting-invoice-companies"
import { fetchJson } from "@/lib/api/client"

const LIST_URL = "/dashboard/finance/accounting-invoices"

export function AccountingInvoiceDetailClient({ id }: { id: string }) {
  const router = useRouter()
  const [record, setRecord] = React.useState<Record<string, unknown> | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchJson<Record<string, unknown>>(
          `/api/finance/accounting-invoices/${id}`
        )
        if (!cancelled) setRecord(data)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载失败")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const company = record?.company != null ? String(record.company) : ""
  const invoiceNumber = record?.invoice_number != null ? String(record.invoice_number) : ""
  const hasTemplate = ACCOUNTING_PDF_TEMPLATE_COMPANIES.includes(company)

  const handlePrint = () => {
    if (!hasTemplate) {
      toast.error(`公司「${company || "未知"}」暂无 PDF 模版`)
      return
    }
    window.open(
      `/api/finance/accounting-invoices/${id}/pdf?t=${Date.now()}`,
      "_blank",
      "noopener,noreferrer"
    )
  }

  if (error) {
    return (
      <div className="space-y-4 p-6">
        <Button variant="outline" size="sm" onClick={() => router.push(LIST_URL)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回列表
        </Button>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  if (!record) {
    return <div className="p-6 text-sm text-muted-foreground">正在加载陆运账单...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            title="返回列表"
            onClick={() => router.push(LIST_URL)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">陆运账单 {invoiceNumber}</h1>
            <p className="text-xs text-muted-foreground">编辑保存后可单独打印 PDF</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrint}
          disabled={!hasTemplate}
          title={hasTemplate ? "新标签页打开 PDF" : "该公司暂无 PDF 模版"}
        >
          <Printer className="mr-2 h-4 w-4" />
          打印 PDF
        </Button>
      </div>

      <div className="mx-auto w-full max-w-5xl">
        <AccountingInvoiceForm
          data={record}
          cancelLabel="返回列表"
          onSuccess={() => router.push(LIST_URL)}
          onCancel={() => router.push(LIST_URL)}
        />
      </div>
    </div>
  )
}

"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ReconciliationInvoiceList } from "../reconciliation/reconciliation-invoice-list"

export default function ReconciliationDifferencesPage() {
  const router = useRouter()
  return <div className="space-y-4">
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950 px-4 py-5 text-white sm:px-6">
        <div><h1 className="text-xl font-semibold sm:text-2xl">差额处理</h1><p className="mt-2 text-sm text-slate-300">复核超收与负数账单，追溯对应的账单及收款记录。</p></div>
        <Button asChild variant="outline" size="sm" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"><Link href="/dashboard/finance/reconciliation">返回出纳核销</Link></Button>
      </div>
      <p className="bg-muted/30 px-4 py-3 text-xs text-muted-foreground">差额为累计有效收款减去账单金额。负数账单需核对冲抵安排；扣款、RTS 暂不参与余额计算。</p>
    </section>
    <ReconciliationInvoiceList mode="exceptions" onViewRecords={(id) => router.push(`/dashboard/finance/reconciliation?invoice_id=${id}`)} />
  </div>
}

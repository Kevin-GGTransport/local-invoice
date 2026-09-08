"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { ReconciliationInvoiceList } from "./reconciliation-invoice-list"
import { ReconciliationTable } from "./reconciliation-table"

export function CashierReconciliationWorkspace({ isAdmin, initialInvoiceId = "" }: { isAdmin: boolean; initialInvoiceId?: string }) {
  const [view, setView] = React.useState<"pending" | "records">(initialInvoiceId ? "records" : "pending")
  const [recordInvoiceId, setRecordInvoiceId] = React.useState(initialInvoiceId)

  const openRecords = (invoiceId = "") => {
    setRecordInvoiceId(invoiceId)
    setView("records")
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-card px-4 py-5 text-card-foreground sm:px-6">
          <div><h1 className="text-xl font-semibold sm:text-2xl">出纳核销</h1>
          <p className="mt-2 text-sm text-muted-foreground">登记待收账单的收款，查询和管理已收记录。</p></div>
        </div>
        <div className="border-t border-border bg-card px-3 sm:px-4" role="tablist" aria-label="收款状态">
          {([ ["pending", "待收"], ["records", "已收"] ] as const).map(([value, label]) => (
            <button
              key={value}
              id={`reconciliation-tab-${value}`}
              type="button"
              role="tab"
              aria-selected={view === value}
              aria-controls="reconciliation-panel"
              tabIndex={view === value ? 0 : -1}
              onClick={() => value === "pending" ? setView("pending") : openRecords()}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
                event.preventDefault()
                const next = event.key === "Home" ? "pending" : event.key === "End" ? "records" : view === "pending" ? "records" : "pending"
                if (next === "records") openRecords()
                else setView("pending")
                document.getElementById(`reconciliation-tab-${next}`)?.focus()
              }}
              className={cn("relative px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", view === value ? "text-primary" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
              {view === value ? <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" /> : null}
            </button>
          ))}
        </div>
      </section>
      <div id="reconciliation-panel" role="tabpanel" aria-labelledby={`reconciliation-tab-${view}`} tabIndex={0}>
      {view === "pending" ? <ReconciliationInvoiceList onViewRecords={openRecords} /> : <ReconciliationTable key={recordInvoiceId || "all"} isAdmin={isAdmin} initialInvoiceId={recordInvoiceId} />}
      </div>
    </div>
  )
}

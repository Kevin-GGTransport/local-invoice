"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { useToolbarWorkspace } from "@/hooks/use-toolbar-workspace"
import { Workspace, ToolbarShell } from "@/components/table-workspace"
import { ReconciliationInvoiceList } from "./reconciliation-invoice-list"
import { ReconciliationTable } from "./reconciliation-table"

export function CashierReconciliationWorkspace({ isAdmin, initialInvoiceId = "" }: { isAdmin: boolean; initialInvoiceId?: string }) {
  const [view, setView] = React.useState<"pending" | "records">(initialInvoiceId ? "records" : "pending")
  const [recordInvoiceId, setRecordInvoiceId] = React.useState(initialInvoiceId)
  const { collapsed, toggleCollapsed, fullscreen, toggleFullscreen } =
    useToolbarWorkspace("reconciliation.toolbar-collapsed.v1")

  const openRecords = (invoiceId = "") => {
    setRecordInvoiceId(invoiceId)
    setView("records")
  }

  return (
    <Workspace fullscreen={fullscreen}>
      {/* 吸顶工具栏：标题 + 待收/已收 Tab + 折叠/全屏；折叠后只留细横条 */}
      <ToolbarShell
        fullscreen={fullscreen}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        onToggleFullscreen={toggleFullscreen}
        title="出纳核销"
        collapsedMeta={
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {view === "pending" ? "待收" : "已收"}
          </span>
        }
        headerLeft={
          <h1 className="shrink-0 text-sm font-semibold tracking-tight">出纳核销</h1>
        }
        tabs={
          <div className="flex flex-wrap" role="tablist" aria-label="收款状态">
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
        }
      />
      <div id="reconciliation-panel" role="tabpanel" aria-labelledby={`reconciliation-tab-${view}`} tabIndex={0}>
      {view === "pending" ? <ReconciliationInvoiceList hideToolbar={collapsed} onViewRecords={openRecords} /> : <ReconciliationTable key={recordInvoiceId || "all"} isAdmin={isAdmin} initialInvoiceId={recordInvoiceId} hideToolbar={collapsed} />}
      </div>
    </Workspace>
  )
}

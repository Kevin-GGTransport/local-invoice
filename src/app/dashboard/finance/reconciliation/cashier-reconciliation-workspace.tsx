"use client"

import React from "react"
import { AlertTriangle, ChevronLeft, ChevronRight, CircleDollarSign, History, Loader2, Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ReconciliationFormDialog, type ReconciliationInvoice } from "@/components/finance/reconciliation-form-dialog"
import { fetchJson } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { ReconciliationTable } from "./reconciliation-table"

type PendingInvoice = ReconciliationInvoice & {
  invoice_date: string | null
  invoice_price: string | null
  check_amount: string | null
  difference: string | null
}

type ListData = {
  rows: PendingInvoice[]
  pagination: { total: number; page: number; pageSize: number }
}

function money(value: string | null) {
  if (value == null) return "—"
  const amount = Number(value)
  if (!Number.isFinite(amount)) return "—"
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" })
}

function BalanceBadge({ difference }: { difference: string | null }) {
  const amount = Number(difference)
  const overpaid = Number.isFinite(amount) && amount > 0
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
      overpaid
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-rose-200 bg-rose-50 text-rose-800",
    )}>
      {overpaid ? "超收待复核" : "待收款"}
    </span>
  )
}

function PendingReconciliation({ onViewRecords }: { onViewRecords: (invoiceId: string) => void }) {
  const [rows, setRows] = React.useState<PendingInvoice[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [searchInput, setSearchInput] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [company, setCompany] = React.useState("all")
  const [companies, setCompanies] = React.useState<Array<{ code: string; name: string }>>([])
  const [loading, setLoading] = React.useState(true)
  const [reload, setReload] = React.useState(0)
  const [target, setTarget] = React.useState<PendingInvoice | null>(null)
  const pageSize = 50

  React.useEffect(() => {
    void fetchJson<Array<{ code: string; name: string }>>("/api/companies")
      .then(setCompanies)
      .catch(() => setCompanies([]))
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => { if (!cancelled) setLoading(true) })
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      invoice_status: "has_difference",
      sort: "invoice_date",
      order: "asc",
    })
    if (search) params.set("search", search)
    if (company !== "all") params.set("company", company)
    void fetchJson<ListData>(`/api/finance/accounting-invoices?${params}`)
      .then((data) => {
        if (!cancelled) {
          setRows(data.rows)
          setTotal(data.pagination.total)
        }
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "加载待核销账单失败")
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, search, company, reload])

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const applySearch = () => {
    setSearch(searchInput.trim())
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="bg-slate-950 px-4 py-5 text-white sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300">Cash application</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold sm:text-2xl">待核销账单</h1>
            <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs text-slate-200">{total} 条待处理</span>
          </div>
          <p className="mt-2 text-sm text-slate-300">登记支票收款，系统自动累计已收金额并计算待收余额。</p>
        </div>
        <div className="grid gap-2 border-t bg-white p-4 sm:grid-cols-[minmax(16rem,1fr)_12rem]">
          <div className="flex min-w-0 gap-2">
            <Input
              aria-label="搜索待核销账单"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") applySearch() }}
              placeholder="Invoice、货号、Load #、备注"
            />
            <Button variant="outline" onClick={applySearch} aria-label="搜索">
              <Search className="size-4" aria-hidden="true" />
            </Button>
          </div>
          <Select value={company} onValueChange={(value) => { setCompany(value); setPage(1) }}>
            <SelectTrigger aria-label="筛选公司"><SelectValue placeholder="全部公司" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部公司</SelectItem>
              {companies.map((item) => <SelectItem key={item.code} value={item.code}>{item.name}（{item.code}）</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {loading ? (
          <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" />正在加载...</div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground"><CircleDollarSign className="size-8" aria-hidden="true" /><p className="text-sm font-medium text-foreground">没有待核销账单</p><p className="text-xs">已发送账单全部结清后会显示在核销记录中。</p></div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader><TableRow className="bg-slate-100"><TableHead>Invoice</TableHead><TableHead>公司</TableHead><TableHead>Broker / Load #</TableHead><TableHead>Invoice 日期</TableHead><TableHead className="text-right">Invoice 金额</TableHead><TableHead className="text-right">已收</TableHead><TableHead className="text-right">待收 / 超收</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
                <TableBody>{rows.map((row) => {
                  const difference = Number(row.difference)
                  const overpaid = difference > 0
                  return <TableRow key={row.id}><TableCell><p className="font-medium">{row.invoice_number}</p><p className="text-xs text-muted-foreground">{row.master_order_number || "—"} · {row.order_number || "—"}</p></TableCell><TableCell>{row.company}</TableCell><TableCell><p>{row.bill_to || "—"}</p><p className="text-xs text-muted-foreground">Load # {row.broker_load_number || "—"}</p></TableCell><TableCell>{row.invoice_date?.slice(0, 10) || "—"}</TableCell><TableCell className="text-right tabular-nums">{money(row.invoice_price)}</TableCell><TableCell className="text-right tabular-nums">{money(row.check_amount)}</TableCell><TableCell className={cn("text-right font-semibold tabular-nums", overpaid ? "text-amber-700" : "text-rose-700")}>{money(String(Math.abs(difference)))}</TableCell><TableCell><BalanceBadge difference={row.difference} /></TableCell><TableCell><div className="flex justify-end gap-1">{!overpaid ? <Button size="sm" onClick={() => setTarget(row)}><CircleDollarSign className="mr-1 size-4" aria-hidden="true" />登记收款</Button> : null}<Button size="sm" variant="ghost" onClick={() => onViewRecords(row.id)}><History className="mr-1 size-4" aria-hidden="true" />记录</Button></div></TableCell></TableRow>
                })}</TableBody>
              </Table>
            </div>
            <div className="divide-y md:hidden">{rows.map((row) => {
              const difference = Number(row.difference)
              const overpaid = difference > 0
              return <article key={row.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{row.invoice_number}</p><p className="mt-1 text-xs text-muted-foreground">{row.company} · {row.bill_to || "—"}</p></div><BalanceBadge difference={row.difference} /></div><dl className="grid grid-cols-3 gap-2 text-sm"><div><dt className="text-xs text-muted-foreground">Invoice 金额</dt><dd className="tabular-nums">{money(row.invoice_price)}</dd></div><div><dt className="text-xs text-muted-foreground">已收</dt><dd className="tabular-nums">{money(row.check_amount)}</dd></div><div><dt className="text-xs text-muted-foreground">{overpaid ? "超收" : "待收"}</dt><dd className="font-semibold tabular-nums">{money(String(Math.abs(difference)))}</dd></div></dl><div className="flex gap-2">{!overpaid ? <Button className="min-h-11 flex-1" onClick={() => setTarget(row)}>登记收款</Button> : <div className="flex flex-1 items-center gap-2 rounded-md bg-amber-50 px-3 text-xs text-amber-800"><AlertTriangle className="size-4" aria-hidden="true" />请检查核销记录</div>}<Button variant="outline" className="min-h-11" onClick={() => onViewRecords(row.id)}>查看记录</Button></div></article>
            })}</div>
          </>
        )}
      </section>

      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>第 {page}/{pageCount} 页</span>
        <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="mr-1 size-4" aria-hidden="true" />上一页</Button><Button variant="outline" size="sm" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>下一页<ChevronRight className="ml-1 size-4" aria-hidden="true" /></Button></div>
      </div>

      <ReconciliationFormDialog invoice={target} open={target != null} onOpenChange={(open) => { if (!open) setTarget(null) }} onSuccess={() => setReload((value) => value + 1)} />
    </div>
  )
}

export function CashierReconciliationWorkspace({ isAdmin, initialInvoiceId = "" }: { isAdmin: boolean; initialInvoiceId?: string }) {
  const [view, setView] = React.useState<"pending" | "records">(initialInvoiceId ? "records" : "pending")
  const [recordInvoiceId, setRecordInvoiceId] = React.useState(initialInvoiceId)

  const openRecords = (invoiceId = "") => {
    setRecordInvoiceId(invoiceId)
    setView("records")
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex w-full rounded-xl border bg-card p-1 shadow-sm sm:w-auto" role="tablist" aria-label="出纳核销工作区">
        <button type="button" role="tab" aria-selected={view === "pending"} onClick={() => setView("pending")} className={cn("min-h-11 flex-1 rounded-lg px-5 text-sm font-medium transition-colors sm:flex-none", view === "pending" ? "bg-slate-950 text-amber-300" : "text-muted-foreground hover:bg-muted")}>待核销账单</button>
        <button type="button" role="tab" aria-selected={view === "records"} onClick={() => openRecords()} className={cn("min-h-11 flex-1 rounded-lg px-5 text-sm font-medium transition-colors sm:flex-none", view === "records" ? "bg-slate-950 text-amber-300" : "text-muted-foreground hover:bg-muted")}>核销记录</button>
      </div>
      {view === "pending" ? <PendingReconciliation onViewRecords={openRecords} /> : <ReconciliationTable key={recordInvoiceId || "all"} isAdmin={isAdmin} initialInvoiceId={recordInvoiceId} />}
    </div>
  )
}

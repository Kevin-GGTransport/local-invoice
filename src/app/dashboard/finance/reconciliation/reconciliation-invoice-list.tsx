"use client"

import React from "react"
import { ChevronLeft, ChevronRight, CircleDollarSign, History, Loader2, RefreshCcw, Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ReconciliationFormDialog, type ReconciliationInvoice } from "@/components/finance/reconciliation-form-dialog"
import { fetchJson } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { OverlayScroll } from "@/components/ui/overlay-scroll"
import { StickyFooter } from "@/components/table-workspace"

type Invoice = ReconciliationInvoice & {
  invoice_date: string | null
  check_amount: string | null
}
type ListData = { rows: Invoice[]; pagination: { total: number; page: number; pageSize: number } }

function StatusBadge({ row }: { row: Invoice }) {
  const label = Number(row.check_amount) > 0 ? "部分收款" : "未收款"
  return <span className="inline-flex rounded-full border border-rose-300/60 bg-rose-400/10 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300">{label}</span>
}

export function ReconciliationInvoiceList({ hideToolbar = false, onViewRecords }: {
  /** 工具栏整栏折叠时隐藏筛选工具卡 */
  hideToolbar?: boolean
  onViewRecords: (invoiceId: string) => void
}) {
  const [rows, setRows] = React.useState<Invoice[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [searchInput, setSearchInput] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [company, setCompany] = React.useState("all")
  const [companies, setCompanies] = React.useState<Array<{ code: string; name: string }>>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [reload, setReload] = React.useState(0)
  const [target, setTarget] = React.useState<Invoice | null>(null)
  const [selected, setSelected] = React.useState<Map<string, Invoice>>(new Map())
  const [batchOpen, setBatchOpen] = React.useState(false)
  const pageSize = 50
  const selectedRows = React.useMemo(() => [...selected.values()], [selected])
  const selectedCompany = selectedRows[0]?.company ?? null
  const compatibleRows = React.useMemo(
    () => rows.filter((row) => !selectedCompany || row.company === selectedCompany),
    [rows, selectedCompany],
  )
  const allCompatibleSelected = compatibleRows.length > 0 && compatibleRows.every((row) => selected.has(row.id))
  const someCompatibleSelected = compatibleRows.some((row) => selected.has(row.id))
  const dialogInvoices = React.useMemo(
    () => target ? [target] : selectedRows,
    [target, selectedRows],
  )

  React.useEffect(() => {
    void fetchJson<Array<{ code: string; name: string }>>("/api/companies").then(setCompanies).catch(() => setCompanies([]))
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => { if (!cancelled) { setLoading(true); setError(null) } })
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize),
      invoice_status: "pending_receipt", sort: "invoice_date", order: "asc" })
    if (search) params.set("search", search)
    if (company !== "all") params.set("company", company)
    void fetchJson<ListData>(`/api/finance/accounting-invoices?${params}`)
      .then((data) => {
        if (cancelled) return
        const lastPage = Math.max(1, Math.ceil(data.pagination.total / pageSize))
        if (page > lastPage) { setPage(lastPage); return }
        setRows(data.rows)
        setTotal(data.pagination.total)
      })
      .catch((reason) => {
        if (cancelled) return
        const message = reason instanceof Error ? reason.message : "加载账单失败"
        setError(message)
        toast.error(message)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, search, company, reload])

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const clearSelection = React.useCallback(() => {
    setSelected(new Map())
    setBatchOpen(false)
  }, [])
  const applySearch = () => { setSearch(searchInput.trim()); setPage(1); clearSelection() }
  const toggleRow = React.useCallback((row: Invoice) => {
    if (!selected.has(row.id) && selectedCompany && row.company !== selectedCompany) {
      toast.error("同一张支票只能核销同一公司的账单")
      return
    }
    if (!selected.has(row.id) && selected.size >= 100) {
      toast.error("一次最多核销 100 张账单")
      return
    }
    setSelected((current) => {
      const next = new Map(current)
      if (next.has(row.id)) {
        next.delete(row.id)
        return next
      }
      next.set(row.id, row)
      return next
    })
  }, [selected, selectedCompany])
  const toggleCurrentPage = React.useCallback(() => {
    if (!selectedCompany && new Set(rows.map((row) => row.company)).size > 1) {
      toast.error("请先选择一张账单锁定公司，或先按公司筛选")
      return
    }
    setSelected((current) => {
      const next = new Map(current)
      const lockedCompany = next.values().next().value?.company
      const pageCompany = lockedCompany ?? rows[0]?.company
      if (!pageCompany) return next
      const selectable = rows.filter((row) => row.company === pageCompany)
      const allSelected = selectable.length > 0 && selectable.every((row) => next.has(row.id))
      if (allSelected) {
        for (const row of selectable) next.delete(row.id)
        return next
      }
      for (const row of selectable) {
        if (next.size >= 100) break
        next.set(row.id, row)
      }
      return next
    })
  }, [rows, selectedCompany])
  const actions = (row: Invoice) => <>
    <Button size="sm" onClick={() => setTarget(row)}><CircleDollarSign className="mr-1 size-4" aria-hidden="true" />登记收款</Button>
    <Button size="sm" variant="ghost" onClick={() => onViewRecords(row.id)}><History className="mr-1 size-4" aria-hidden="true" />收款记录</Button>
  </>

  return <div className="space-y-4">
    {!hideToolbar && (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div><p className="text-sm font-medium">共 {total} 条待收账单</p>
          <p className="mt-1 text-xs text-muted-foreground">仅显示已开票且未收足的正数账单。{selected.size > 0 ? ` 已选 ${selected.size} 张（${selectedCompany}）。` : ""}</p></div>
        <div className="flex gap-2">
          {selected.size > 0 ? <Button size="sm" onClick={() => setBatchOpen(true)}><CircleDollarSign className="mr-1 size-4" aria-hidden="true" />批量核销（{selected.size}）</Button> : null}
          <Button variant="outline" size="sm" onClick={() => setReload((value) => value + 1)}><RefreshCcw className="mr-1 size-4" aria-hidden="true" />刷新</Button>
        </div>
      </div>
      <div className="grid gap-2 bg-muted/30 p-4 sm:grid-cols-[minmax(16rem,1fr)_12rem]">
        <div className="flex min-w-0 gap-2">
          <Input aria-label="搜索账单" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applySearch() }} placeholder="Invoice、货号、Load #、备注" />
          <Button variant="outline" onClick={applySearch} aria-label="搜索"><Search className="size-4" aria-hidden="true" /></Button>
        </div>
        <Select value={company} onValueChange={(value) => { setCompany(value); setPage(1); clearSelection() }}>
          <SelectTrigger className="w-full" aria-label="筛选公司"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">全部公司</SelectItem>{companies.map((item) => <SelectItem key={item.code} value={item.code}>{item.name}（{item.code}）</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </section>
    )}

    {hideToolbar && selected.size > 0 ? (
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
        <span>已选 {selected.size} 张（{selectedCompany}）</span>
        <Button size="sm" onClick={() => setBatchOpen(true)}><CircleDollarSign className="mr-1 size-4" aria-hidden="true" />批量核销</Button>
      </div>
    ) : null}

    <section className="overflow-hidden rounded-lg border bg-card">
      {loading ? <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" />正在加载...</div>
        : error ? <div role="alert" className="flex min-h-56 flex-col items-center justify-center gap-3 p-4 text-sm"><p>{error}</p><Button variant="outline" onClick={() => setReload((value) => value + 1)}>重新加载</Button></div>
        : rows.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground"><CircleDollarSign className="size-8" aria-hidden="true" /><p className="text-sm">没有符合条件的待收账单</p></div>
        : <>
          <OverlayScroll className="hidden md:block" refreshKey={`${loading}-${rows.length}`}><Table className="text-[13px]">
            <TableHeader><TableRow>
              <TableHead className="w-10" scope="col"><Checkbox checked={allCompatibleSelected ? true : someCompatibleSelected ? "indeterminate" : false} onCheckedChange={toggleCurrentPage} aria-label="选择当前页同公司账单" /></TableHead>
              {["Invoice", "公司", "Broker / Load #", "Invoice 日期", "状态", "操作"].map((label, index) => <TableHead key={label} scope="col" className={cn(index === 5 && "text-right")}>{label}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>{rows.map((row) => <TableRow key={row.id}>
              <TableCell><Checkbox checked={selected.has(row.id)} disabled={Boolean(selectedCompany && row.company !== selectedCompany)} onCheckedChange={() => toggleRow(row)} aria-label={`选择账单 ${row.invoice_number}`} title={selectedCompany && row.company !== selectedCompany ? `已锁定公司 ${selectedCompany}` : undefined} /></TableCell>
              <TableCell><p className="font-medium">{row.invoice_number}</p><p className="text-xs text-muted-foreground">{row.master_order_number || "—"} · {row.order_number || "—"}</p></TableCell>
              <TableCell>{row.company}</TableCell>
              <TableCell><p>{row.bill_to || "—"}</p><p className="text-xs text-muted-foreground">Load # {row.broker_load_number || "—"}</p></TableCell>
              <TableCell>{row.invoice_date?.slice(0, 10) || "—"}</TableCell>
              <TableCell><StatusBadge row={row} /></TableCell>
              <TableCell><div className="flex justify-end gap-1">{actions(row)}</div></TableCell>
            </TableRow>)}</TableBody>
          </Table></OverlayScroll>
          <div className="divide-y md:hidden">{rows.map((row) => <article key={row.id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><Checkbox className="mt-0.5" checked={selected.has(row.id)} disabled={Boolean(selectedCompany && row.company !== selectedCompany)} onCheckedChange={() => toggleRow(row)} aria-label={`选择账单 ${row.invoice_number}`} /><div><p className="font-semibold">{row.invoice_number}</p><p className="mt-1 text-xs text-muted-foreground">{row.company} · {row.bill_to || "—"}</p></div></div><StatusBadge row={row} /></div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">总货号 / 货号</dt><dd>{row.master_order_number || "—"} / {row.order_number || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Load #</dt><dd className="break-all">{row.broker_load_number || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Invoice 日期</dt><dd>{row.invoice_date?.slice(0, 10) || "—"}</dd></div>
            </dl><div className="flex flex-wrap justify-end gap-2 [&_button]:min-h-11 [&_a]:min-h-11">{actions(row)}</div>
          </article>)}</div>
        </>}
    </section>
    <StickyFooter>
      <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground"><span>第 {page}/{pageCount} 页</span><div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="mr-1 size-4" aria-hidden="true" />上一页</Button>
        <Button variant="outline" size="sm" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>下一页<ChevronRight className="ml-1 size-4" aria-hidden="true" /></Button>
      </div></div>
    </StickyFooter>
    <ReconciliationFormDialog invoices={dialogInvoices} open={target != null || batchOpen} onOpenChange={(open) => { if (!open) { setTarget(null); setBatchOpen(false) } }} onSuccess={() => { clearSelection(); setReload((value) => value + 1) }} />
  </div>
}

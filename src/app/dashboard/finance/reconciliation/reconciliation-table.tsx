"use client"

import React from "react"
import { ChevronLeft, ChevronRight, CircleDollarSign, Loader2, Pencil, RefreshCcw, Search, Undo2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { fetchJson } from "@/lib/api/client"
import { cn } from "@/lib/utils"

type ReconciliationRecord = {
  id: string; invoice_id: string; master_order_number: string | null; company: string
  order_number: string | null; bill_to: string | null; broker_load_number: string | null
  billing_category: string | null; invoice_number: string; check_date: string
  check_amount: string; check_number: string; notes: string | null; voided_at: string | null
  void_reason: string | null; created_at: string; created_by: string | null
}
type ListData = { rows: ReconciliationRecord[]; pagination: { total: number; page: number; pageSize: number } }
type EditValues = { checkDate: string; checkAmount: string; checkNumber: string; notes: string }

function date(value: string | null) { return value ? value.slice(0, 10) : "—" }
function money(value: string | number) { return Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" }) }

function StatusBadge({ voided }: { voided: boolean }) {
  return <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", voided ? "border-slate-200 bg-slate-100 text-slate-700" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>{voided ? "已撤销" : "有效"}</span>
}

function validateEdit(values: EditValues) {
  const errors: Partial<Record<keyof EditValues, string>> = {}
  if (!values.checkDate) errors.checkDate = "请选择支票日期"
  const amount = Number(values.checkAmount)
  if (!values.checkAmount || !Number.isFinite(amount) || amount <= 0) errors.checkAmount = "金额必须大于 0"
  else if (!/^\d+(?:\.\d{1,2})?$/.test(values.checkAmount)) errors.checkAmount = "金额最多保留两位小数"
  if (!values.checkNumber.trim()) errors.checkNumber = "请输入支票号码"
  else if (!/^[A-Za-z0-9]+$/.test(values.checkNumber.trim())) errors.checkNumber = "只能输入英文字母和数字"
  return errors
}

export function ReconciliationTable({ isAdmin, initialInvoiceId = "" }: { isAdmin: boolean; initialInvoiceId?: string }) {
  const [rows, setRows] = React.useState<ReconciliationRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [status, setStatus] = React.useState("active")
  const [searchInput, setSearchInput] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [company, setCompany] = React.useState("all")
  const [dateFrom, setDateFrom] = React.useState("")
  const [dateTo, setDateTo] = React.useState("")
  const [invoiceId, setInvoiceId] = React.useState(initialInvoiceId)
  const [companies, setCompanies] = React.useState<Array<{ code: string; name: string }>>([])
  const [reload, setReload] = React.useState(0)
  const [editing, setEditing] = React.useState<ReconciliationRecord | null>(null)
  const [editValues, setEditValues] = React.useState<EditValues>({ checkDate: "", checkAmount: "", checkNumber: "", notes: "" })
  const [editRequestId, setEditRequestId] = React.useState("")
  const [editErrors, setEditErrors] = React.useState<Partial<Record<keyof EditValues, string>>>({})
  const [voiding, setVoiding] = React.useState<ReconciliationRecord | null>(null)
  const [voidReason, setVoidReason] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const pageSize = 50

  React.useEffect(() => { void fetchJson<Array<{ code: string; name: string }>>("/api/companies").then(setCompanies).catch(() => setCompanies([])) }, [])
  React.useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => { if (!cancelled) setLoading(true) })
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status })
    if (search) params.set("search", search)
    if (company !== "all") params.set("company", company)
    if (dateFrom) params.set("check_date_from", dateFrom)
    if (dateTo) params.set("check_date_to", dateTo)
    if (invoiceId) params.set("invoice_id", invoiceId)
    void fetchJson<ListData>(`/api/finance/reconciliation?${params}`)
      .then((data) => { if (!cancelled) { setRows(data.rows); setTotal(data.pagination.total) } })
      .catch((error) => { if (!cancelled) toast.error(error instanceof Error ? error.message : "加载销账记录失败") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, status, search, company, dateFrom, dateTo, invoiceId, reload])

  const openEdit = (record: ReconciliationRecord) => {
    setEditing(record); setEditRequestId(crypto.randomUUID()); setEditErrors({})
    setEditValues({ checkDate: date(record.check_date), checkAmount: Number(record.check_amount).toFixed(2), checkNumber: record.check_number, notes: record.notes || "" })
  }
  const saveEdit = async () => {
    if (!editing) return
    const errors = validateEdit(editValues); setEditErrors(errors)
    if (Object.keys(errors).length > 0) return
    setSaving(true)
    try {
      await fetchJson(`/api/finance/reconciliation/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_id: editRequestId, check_date: editValues.checkDate, check_amount: editValues.checkAmount, check_number: editValues.checkNumber, notes: editValues.notes || null }) })
      toast.success("已保留原记录并生成替代记录"); setEditing(null); setReload((value) => value + 1)
    } catch (error) { toast.error(error instanceof Error ? error.message : "修改失败") } finally { setSaving(false) }
  }
  const confirmVoid = async () => {
    if (!voiding || !voidReason.trim()) return
    setSaving(true)
    try {
      await fetchJson(`/api/finance/reconciliation/${voiding.id}/void`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: voidReason.trim() }) })
      toast.success("销账记录已撤销"); setVoiding(null); setVoidReason(""); setReload((value) => value + 1)
    } catch (error) { toast.error(error instanceof Error ? error.message : "撤销失败") } finally { setSaving(false) }
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const filteredInvoiceNumber = rows[0]?.invoice_number
  return <div className="space-y-4">
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="bg-slate-950 px-4 py-5 text-white sm:px-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300">财务管理</p><div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-xl font-semibold sm:text-2xl">销账记录</h1><span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs text-slate-200">共 {total} 条</span></div><p className="mt-2 text-sm text-slate-300">查询和管理已登记的支票收款记录</p></div><Button variant="outline" size="sm" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => setReload((value) => value + 1)}><RefreshCcw className="mr-2 size-4" aria-hidden="true" />刷新</Button></div></div>
      <div className="space-y-3 border-t bg-white p-4">
        {invoiceId ? <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800"><span>仅显示当前账单{filteredInvoiceNumber ? `：${filteredInvoiceNumber}` : ""}</span><Button variant="ghost" size="sm" className="h-7 text-blue-800" onClick={() => { setInvoiceId(""); setPage(1) }}><X className="mr-1 size-3" aria-hidden="true" />清除</Button></div> : null}
        <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_11rem_11rem_10rem_10rem] lg:items-end">
          <div><Label htmlFor="reconciliation-search" className="text-xs">搜索记录</Label><div className="mt-1 flex gap-2"><Input id="reconciliation-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setSearch(searchInput.trim()); setPage(1) } }} placeholder="Invoice、总货号、货号、Load #、支票号" /><Button variant="outline" onClick={() => { setSearch(searchInput.trim()); setPage(1) }}><Search className="size-4" aria-hidden="true" /><span className="sr-only">搜索</span></Button></div></div>
          <div><Label className="text-xs">状态</Label><Select value={status} onValueChange={(value) => { setStatus(value); setPage(1) }}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">有效</SelectItem><SelectItem value="voided">已撤销</SelectItem><SelectItem value="all">全部</SelectItem></SelectContent></Select></div>
          <div><Label className="text-xs">公司</Label><Select value={company} onValueChange={(value) => { setCompany(value); setPage(1) }}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部公司</SelectItem>{companies.map((item) => <SelectItem key={item.code} value={item.code}>{item.code}</SelectItem>)}</SelectContent></Select></div>
          <div><Label htmlFor="check-date-from" className="text-xs">支票日期从</Label><Input id="check-date-from" className="mt-1" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1) }} /></div>
          <div><Label htmlFor="check-date-to" className="text-xs">到</Label><Input id="check-date-to" className="mt-1" type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1) }} /></div>
        </div>
      </div>
    </section>

    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      {loading ? <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" />正在加载...</div> : rows.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-muted-foreground"><CircleDollarSign className="size-8" aria-hidden="true" /><p className="text-sm">没有符合条件的销账记录</p></div> : <>
        <div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow className="bg-slate-100"><TableHead>总货号</TableHead><TableHead>公司</TableHead><TableHead>货号</TableHead><TableHead>Broker 公司</TableHead><TableHead>Load #</TableHead><TableHead>From-To</TableHead><TableHead>Invoice Number</TableHead><TableHead>支票日期</TableHead><TableHead className="text-right">金额</TableHead><TableHead>支票号码</TableHead><TableHead>备注</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{rows.map((record) => <TableRow key={record.id} className={cn(record.voided_at && "text-muted-foreground")}><TableCell>{record.master_order_number || "—"}</TableCell><TableCell className="font-medium">{record.company}</TableCell><TableCell>{record.order_number || "—"}</TableCell><TableCell>{record.bill_to || "—"}</TableCell><TableCell>{record.broker_load_number || "—"}</TableCell><TableCell>{record.billing_category || "—"}</TableCell><TableCell className="font-medium">{record.invoice_number}</TableCell><TableCell>{date(record.check_date)}</TableCell><TableCell className="text-right font-medium tabular-nums">{money(record.check_amount)}</TableCell><TableCell>{record.check_number}</TableCell><TableCell className="max-w-44 truncate" title={record.notes || ""}>{record.notes || "—"}</TableCell><TableCell><div className="space-y-1"><StatusBadge voided={record.voided_at != null} />{record.void_reason ? <p className="max-w-48 text-xs" title={record.void_reason}>原因：{record.void_reason}</p> : null}</div></TableCell><TableCell><div className="flex justify-end gap-1">{isAdmin && !record.voided_at ? <><Button variant="ghost" size="sm" onClick={() => openEdit(record)}><Pencil className="mr-1 size-4" aria-hidden="true" />修改</Button><Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => { setVoiding(record); setVoidReason("") }}><Undo2 className="mr-1 size-4" aria-hidden="true" />撤销</Button></> : "—"}</div></TableCell></TableRow>)}</TableBody></Table></div>
        <div className="divide-y md:hidden">{rows.map((record) => <article key={record.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{record.company} · {record.invoice_number}</p><p className="mt-1 text-xs text-muted-foreground">总货号 {record.master_order_number || "—"} · 货号 {record.order_number || "—"}</p></div><StatusBadge voided={record.voided_at != null} /></div><dl className="grid grid-cols-2 gap-2 text-sm"><div><dt className="text-xs text-muted-foreground">支票日期</dt><dd>{date(record.check_date)}</dd></div><div><dt className="text-xs text-muted-foreground">金额</dt><dd className="font-semibold tabular-nums">{money(record.check_amount)}</dd></div><div><dt className="text-xs text-muted-foreground">支票号码</dt><dd>{record.check_number}</dd></div><div><dt className="text-xs text-muted-foreground">From-To</dt><dd>{record.billing_category || "—"}</dd></div><div className="col-span-2"><dt className="text-xs text-muted-foreground">Broker / Load #</dt><dd>{record.bill_to || "—"} / {record.broker_load_number || "—"}</dd></div>{record.notes ? <div className="col-span-2"><dt className="text-xs text-muted-foreground">备注</dt><dd>{record.notes}</dd></div> : null}{record.void_reason ? <div className="col-span-2 rounded-md bg-slate-100 p-2"><dt className="text-xs text-muted-foreground">撤销原因</dt><dd>{record.void_reason}</dd></div> : null}</dl>{isAdmin && !record.voided_at ? <div className="flex gap-2"><Button variant="outline" className="min-h-11 flex-1" onClick={() => openEdit(record)}><Pencil className="mr-2 size-4" aria-hidden="true" />修改</Button><Button variant="outline" className="min-h-11 flex-1 text-destructive" onClick={() => { setVoiding(record); setVoidReason("") }}><Undo2 className="mr-2 size-4" aria-hidden="true" />撤销</Button></div> : null}</article>)}</div>
      </>}
      <div className="flex items-center justify-between border-t px-4 py-3 text-sm"><span className="text-muted-foreground">第 {page} / {pageCount} 页</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="size-4" aria-hidden="true" />上一页</Button><Button variant="outline" size="sm" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>下一页<ChevronRight className="size-4" aria-hidden="true" /></Button></div></div>
    </section>

    <Dialog open={editing != null} onOpenChange={(open) => { if (!open && !saving) setEditing(null) }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>修改销账记录</DialogTitle><DialogDescription>原记录将保留并标记为已撤销，系统会生成一条替代记录。</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-3"><div><Label htmlFor="edit-check-date">支票日期 *</Label><Input id="edit-check-date" type="date" value={editValues.checkDate} onChange={(event) => setEditValues((current) => ({ ...current, checkDate: event.target.value }))} aria-invalid={Boolean(editErrors.checkDate)} /><p className="min-h-5 text-xs text-destructive">{editErrors.checkDate}</p></div><div><Label htmlFor="edit-check-amount">金额 *</Label><Input id="edit-check-amount" inputMode="decimal" value={editValues.checkAmount} onChange={(event) => setEditValues((current) => ({ ...current, checkAmount: event.target.value }))} aria-invalid={Boolean(editErrors.checkAmount)} /><p className="min-h-5 text-xs text-destructive">{editErrors.checkAmount}</p></div><div><Label htmlFor="edit-check-number">支票号码 *</Label><Input id="edit-check-number" value={editValues.checkNumber} onChange={(event) => setEditValues((current) => ({ ...current, checkNumber: event.target.value.toUpperCase() }))} aria-invalid={Boolean(editErrors.checkNumber)} /><p className="min-h-5 text-xs text-destructive">{editErrors.checkNumber}</p></div></div><div><Label htmlFor="edit-notes">备注</Label><Textarea id="edit-notes" value={editValues.notes} onChange={(event) => setEditValues((current) => ({ ...current, notes: event.target.value }))} maxLength={500} /></div><DialogFooter><Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>取消</Button><Button onClick={() => void saveEdit()} disabled={saving}>{saving ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : <Pencil className="mr-2 size-4" aria-hidden="true" />}确认修改</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={voiding != null} onOpenChange={(open) => { if (!open && !saving) setVoiding(null) }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>撤销销账记录</DialogTitle><DialogDescription>该操作会保留原记录和撤销原因。</DialogDescription></DialogHeader>{voiding ? <div className="rounded-lg border bg-slate-50 p-3 text-sm"><p>{voiding.check_number} · {date(voiding.check_date)}</p><p className="mt-1 font-semibold tabular-nums">{money(voiding.check_amount)}</p></div> : null}<div><Label htmlFor="void-reason">撤销原因 *</Label><Textarea id="void-reason" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} maxLength={500} /></div><DialogFooter><Button variant="outline" onClick={() => setVoiding(null)} disabled={saving}>取消</Button><Button variant="destructive" onClick={() => void confirmVoid()} disabled={saving || !voidReason.trim()}>{saving ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : <Undo2 className="mr-2 size-4" aria-hidden="true" />}确认撤销</Button></DialogFooter></DialogContent></Dialog>
  </div>
}

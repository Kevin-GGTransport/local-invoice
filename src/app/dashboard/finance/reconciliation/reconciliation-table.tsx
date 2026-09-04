"use client"

import React from "react"
import {
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  History,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Undo2,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { fetchJson } from "@/lib/api/client"
import { cn } from "@/lib/utils"

type Reconciliation = {
  id: string
  check_date: string
  check_amount: string
  check_number: string
  notes: string | null
  voided_at: string | null
  void_reason: string | null
  created_at: string
}

type Row = {
  id: string
  company: string
  master_order_number: string | null
  order_number: string | null
  bill_to: string | null
  broker_load_number: string | null
  billing_category: string | null
  invoice_number: string
  invoice_date: string | null
  invoice_price: string | null
  invoice_amount: string
  paid_amount: string
  difference: string
  status: "unreconciled" | "partial" | "settled" | "overpaid"
  accounting_invoice_reconciliations: Reconciliation[]
}

type ListData = {
  rows: Row[]
  pagination: { total: number; page: number; pageSize: number }
}

type FormValues = {
  checkDate: string
  checkAmount: string
  checkNumber: string
  notes: string
}

const STATUS_META = {
  unreconciled: { label: "未销账", className: "border-slate-200 bg-slate-100 text-slate-700" },
  partial: { label: "部分销账", className: "border-amber-200 bg-amber-50 text-amber-800" },
  settled: { label: "已结清", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  overpaid: { label: "超额销账", className: "border-rose-200 bg-rose-50 text-rose-800" },
} as const

function localToday() {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function money(value: string | number | null) {
  const amount = Number(value ?? 0)
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" })
}

function date(value: string | null) {
  return value ? value.slice(0, 10) : "—"
}

function StatusBadge({ status }: { status: Row["status"] }) {
  const meta = STATUS_META[status]
  return <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", meta.className)}>{meta.label}</span>
}

function InvoiceSummary({ row }: { row: Row }) {
  return (
    <div className="grid grid-cols-3 gap-2 rounded-lg border bg-slate-50 p-3 text-sm">
      <div><p className="text-xs text-muted-foreground">Invoice 金额</p><p className="font-semibold tabular-nums">{money(row.invoice_amount)}</p></div>
      <div><p className="text-xs text-muted-foreground">累计销账</p><p className="font-semibold tabular-nums text-blue-700">{money(row.paid_amount)}</p></div>
      <div><p className="text-xs text-muted-foreground">差额</p><p className={cn("font-semibold tabular-nums", Number(row.difference) < 0 && "text-rose-700")}>{money(row.difference)}</p></div>
    </div>
  )
}

export function ReconciliationTable({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = React.useState<Row[]>([])
  const [loading, setLoading] = React.useState(true)
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [status, setStatus] = React.useState("unreconciled")
  const [searchInput, setSearchInput] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [company, setCompany] = React.useState("all")
  const [companies, setCompanies] = React.useState<Array<{ code: string; name: string }>>([])
  const [reload, setReload] = React.useState(0)
  const [activeRow, setActiveRow] = React.useState<Row | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingItem, setEditingItem] = React.useState<Reconciliation | null>(null)
  const [requestId, setRequestId] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormValues, string>>>({})
  const [values, setValues] = React.useState<FormValues>({
    checkDate: localToday(), checkAmount: "", checkNumber: "", notes: "",
  })
  const pageSize = 50

  React.useEffect(() => {
    void fetchJson<Array<{ code: string; name: string }>>("/api/companies")
      .then(setCompanies)
      .catch(() => setCompanies([]))
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) setLoading(true)
    })
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status })
    if (search) params.set("search", search)
    if (company !== "all") params.set("company", company)
    void fetchJson<ListData>(`/api/finance/reconciliation?${params}`)
      .then((data) => {
        if (cancelled) return
        setRows(data.rows)
        setTotal(data.pagination.total)
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "加载销账列表失败")
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, status, search, company, reload])

  const openDialog = (row: Row) => {
    setActiveRow(row)
    setEditingItem(null)
    setRequestId(crypto.randomUUID())
    setErrors({})
    setValues({
      checkDate: localToday(),
      checkAmount: Number(row.difference) > 0 ? Number(row.difference).toFixed(2) : "",
      checkNumber: "",
      notes: "",
    })
    setDialogOpen(true)
  }

  const startEdit = (item: Reconciliation) => {
    setEditingItem(item)
    setRequestId(crypto.randomUUID())
    setErrors({})
    setValues({
      checkDate: date(item.check_date) === "—" ? localToday() : date(item.check_date),
      checkAmount: Number(item.check_amount).toFixed(2),
      checkNumber: item.check_number,
      notes: item.notes || "",
    })
  }

  const validate = () => {
    const next: typeof errors = {}
    if (!values.checkDate) next.checkDate = "请选择支票日期"
    const amount = Number(values.checkAmount)
    if (!values.checkAmount || !Number.isFinite(amount) || amount <= 0) next.checkAmount = "销账金额必须大于 0"
    else if (!/^\d+(\.\d{1,2})?$/.test(values.checkAmount)) next.checkAmount = "金额最多保留两位小数"
    if (!values.checkNumber.trim()) next.checkNumber = "请输入支票号码"
    else if (!/^[A-Za-z0-9]+$/.test(values.checkNumber.trim())) next.checkNumber = "只能输入英文字母和数字"
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async () => {
    if (!activeRow || !validate()) return
    setSaving(true)
    try {
      await fetchJson(editingItem ? `/api/finance/reconciliation/${editingItem.id}` : "/api/finance/reconciliation", {
        method: editingItem ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingItem ? {
          request_id: requestId,
          check_date: values.checkDate,
          check_amount: values.checkAmount,
          check_number: values.checkNumber,
          notes: values.notes || null,
        } : { items: [{
          invoice_id: activeRow.id,
          request_id: requestId,
          check_date: values.checkDate,
          check_amount: values.checkAmount,
          check_number: values.checkNumber,
          notes: values.notes || null,
        }] }),
      })
      toast.success(editingItem ? "已保留原记录并生成替代记录" : "销账记录已保存")
      setDialogOpen(false)
      setReload((value) => value + 1)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "销账失败")
    } finally {
      setSaving(false)
    }
  }

  const voidItem = async (item: Reconciliation) => {
    const reason = window.prompt("请输入撤销原因")?.trim()
    if (!reason) return
    try {
      await fetchJson(`/api/finance/reconciliation/${item.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      })
      toast.success("销账记录已撤销")
      setDialogOpen(false)
      setReload((value) => value + 1)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "撤销失败")
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const projectedDifference = activeRow
    ? Number(activeRow.difference) + (editingItem ? Number(editingItem.check_amount) : 0) - (Number(values.checkAmount) || 0)
    : 0

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="relative bg-slate-950 px-4 py-5 text-white sm:px-6">
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300">财务管理</p>
              <div className="mt-2 flex items-center gap-3">
                <h1 className="text-xl font-semibold sm:text-2xl">销账</h1>
                <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs text-slate-200">共 {total} 条账单</span>
              </div>
              <p className="mt-2 text-sm text-slate-300">记录每次支票收款，自动计算累计销账和差额</p>
            </div>
            <Button variant="outline" size="sm" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => setReload((value) => value + 1)}>
              <RefreshCcw className="mr-2 size-4" />刷新
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t bg-white p-4 lg:flex-row lg:items-end">
          <div className="flex-1">
            <Label htmlFor="reconciliation-search" className="text-xs">搜索账单</Label>
            <div className="mt-1 flex gap-2">
              <Input id="reconciliation-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setPage(1); setSearch(searchInput.trim()) } }} placeholder="Invoice、总货号、货号、Load #" />
              <Button variant="outline" onClick={() => { setPage(1); setSearch(searchInput.trim()) }}><Search className="size-4" /><span className="sr-only">搜索</span></Button>
            </div>
          </div>
          <div className="w-full lg:w-44"><Label className="text-xs">销账状态</Label><Select value={status} onValueChange={(value) => { setStatus(value); setPage(1) }}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unreconciled">未销账</SelectItem><SelectItem value="reconciled">有销账记录</SelectItem><SelectItem value="all">全部</SelectItem></SelectContent></Select></div>
          <div className="w-full lg:w-44"><Label className="text-xs">公司</Label><Select value={company} onValueChange={(value) => { setCompany(value); setPage(1) }}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部公司</SelectItem>{companies.map((item) => <SelectItem key={item.code} value={item.code}>{item.code}</SelectItem>)}</SelectContent></Select></div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {loading ? <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />正在加载...</div> : rows.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-muted-foreground"><CircleDollarSign className="size-8" /><p className="text-sm">没有符合条件的账单</p></div> : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader><TableRow className="bg-slate-100"><TableHead>总货号</TableHead><TableHead>公司</TableHead><TableHead>货号</TableHead><TableHead>Broker 公司</TableHead><TableHead>Load #</TableHead><TableHead>From-To</TableHead><TableHead>Invoice Number</TableHead><TableHead className="text-right">Invoice 金额</TableHead><TableHead className="text-right">累计销账</TableHead><TableHead className="text-right">差额</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
                <TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{row.master_order_number || "—"}</TableCell><TableCell className="font-medium">{row.company}</TableCell><TableCell>{row.order_number || "—"}</TableCell><TableCell>{row.bill_to || "—"}</TableCell><TableCell>{row.broker_load_number || "—"}</TableCell><TableCell>{row.billing_category || "—"}</TableCell><TableCell className="font-medium">{row.invoice_number}</TableCell><TableCell className="text-right tabular-nums">{money(row.invoice_amount)}</TableCell><TableCell className="text-right tabular-nums text-blue-700">{money(row.paid_amount)}</TableCell><TableCell className={cn("text-right tabular-nums", Number(row.difference) < 0 && "font-medium text-rose-700")}>{money(row.difference)}</TableCell><TableCell><StatusBadge status={row.status} /></TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => openDialog(row)}><Plus className="mr-1 size-4" />新增</Button>{row.accounting_invoice_reconciliations.length > 0 && <Button variant="ghost" size="icon" title="查看销账明细" onClick={() => openDialog(row)}><History className="size-4" /><span className="sr-only">查看明细</span></Button>}</div></TableCell></TableRow>)}</TableBody>
              </Table>
            </div>
            <div className="divide-y md:hidden">{rows.map((row) => <article key={row.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{row.company} · {row.invoice_number}</p><p className="mt-1 text-xs text-muted-foreground">总货号 {row.master_order_number || "—"} · 货号 {row.order_number || "—"}</p></div><StatusBadge status={row.status} /></div><div className="grid grid-cols-2 gap-2 text-sm"><div><p className="text-xs text-muted-foreground">Broker 公司</p>{row.bill_to || "—"}</div><div><p className="text-xs text-muted-foreground">From-To</p>{row.billing_category || "—"}</div><div><p className="text-xs text-muted-foreground">Load #</p>{row.broker_load_number || "—"}</div><div><p className="text-xs text-muted-foreground">Invoice 日期</p>{date(row.invoice_date)}</div></div><InvoiceSummary row={row} /><Button className="min-h-11 w-full" onClick={() => openDialog(row)}><Plus className="mr-2 size-4" />新增销账 / 查看明细</Button></article>)}</div>
          </>
        )}
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm"><span className="text-muted-foreground">第 {page} / {pageCount} 页</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="size-4" />上一页</Button><Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>下一页<ChevronRight className="size-4" /></Button></div></div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>销账 · {activeRow?.invoice_number}</DialogTitle><DialogDescription>可多次记录支票收款；超过当前差额时会标记为超额销账。</DialogDescription></DialogHeader>
          {activeRow && <div className="space-y-5"><InvoiceSummary row={activeRow} /><section className="space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{editingItem ? "修改销账（保留原记录）" : "新增销账"}</h3>{editingItem && <Button variant="ghost" size="sm" onClick={() => { setEditingItem(null); setRequestId(crypto.randomUUID()); setValues({ checkDate: localToday(), checkAmount: Number(activeRow.difference) > 0 ? Number(activeRow.difference).toFixed(2) : "", checkNumber: "", notes: "" }) }}>取消修改</Button>}</div><div className="grid gap-4 sm:grid-cols-3"><div><Label htmlFor="check-date">支票日期 *</Label><Input id="check-date" type="date" value={values.checkDate} onChange={(event) => setValues((current) => ({ ...current, checkDate: event.target.value }))} aria-invalid={Boolean(errors.checkDate)} /><p className="min-h-5 text-xs text-destructive">{errors.checkDate}</p></div><div><Label htmlFor="check-amount">销账金额 *</Label><Input id="check-amount" inputMode="decimal" value={values.checkAmount} onChange={(event) => setValues((current) => ({ ...current, checkAmount: event.target.value }))} aria-invalid={Boolean(errors.checkAmount)} /><p className="min-h-5 text-xs text-destructive">{errors.checkAmount}</p></div><div><Label htmlFor="check-number">支票号码 *</Label><Input id="check-number" value={values.checkNumber} onChange={(event) => setValues((current) => ({ ...current, checkNumber: event.target.value.toUpperCase() }))} placeholder="ACH090426" aria-invalid={Boolean(errors.checkNumber)} /><p className="min-h-5 text-xs text-destructive">{errors.checkNumber}</p></div></div><div><Label htmlFor="reconciliation-notes">备注</Label><Textarea id="reconciliation-notes" value={values.notes} onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))} maxLength={500} /></div><div className={cn("rounded-lg border px-3 py-2 text-sm", projectedDifference < 0 ? "border-rose-200 bg-rose-50 text-rose-800" : "border-blue-200 bg-blue-50 text-blue-800")}>提交后差额：<strong className="tabular-nums">{money(projectedDifference)}</strong>{projectedDifference < 0 && "，该账单将变为超额销账"}</div></section><section className="space-y-3"><h3 className="text-sm font-semibold">销账明细</h3>{activeRow.accounting_invoice_reconciliations.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">暂无销账记录</p> : <div className="space-y-2">{activeRow.accounting_invoice_reconciliations.map((item) => <div key={item.id} className={cn("flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between", item.voided_at && "bg-slate-50 text-muted-foreground line-through")}><div><p className="font-medium">{date(item.check_date)} · {item.check_number}</p><p className="mt-1 text-xs">{item.notes || "无备注"}{item.voided_at && ` · 已撤销：${item.void_reason || "—"}`}</p></div><div className="flex items-center gap-2"><span className="font-semibold tabular-nums">{money(item.check_amount)}</span>{isAdmin && !item.voided_at && <><Button variant="ghost" size="sm" onClick={() => startEdit(item)}><Pencil className="mr-1 size-4" />修改</Button><Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void voidItem(item)}><Undo2 className="mr-1 size-4" />撤销</Button></>}</div></div>)}</div>}</section></div>}
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button><Button onClick={() => void submit()} disabled={saving}>{saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : editingItem ? <Pencil className="mr-2 size-4" /> : <Plus className="mr-2 size-4" />}{editingItem ? "确认修改" : "确认销账"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

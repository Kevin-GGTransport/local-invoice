"use client"

/**
 * 陆运账单列表（本模块专用表格，替代源项目通用 EntityTable）
 * 服务端分页/排序/筛选 + 勾选批量（合并打印 PDF / 导出 Excel / 批量删除）
 * + 新建/编辑弹窗复用模版编辑表单（AccountingInvoiceForm）
 */

import React from "react"
import { useRouter } from "next/navigation"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { AccountingInvoiceForm } from "@/components/finance/accounting-invoice-form"
import { AccountingInvoicesBatchPdf } from "@/components/finance/accounting-invoices-batch-pdf"
import { fetchJson, getApiErrorMessage } from "@/lib/api/client"
import type { PaginatedData } from "@/lib/api/types"
import {
  ACCOUNTING_COMPANY_OPTIONS,
  ACCOUNTING_FROM_TO_OPTIONS,
  ACCOUNTING_PDF_TEMPLATE_COMPANIES,
} from "@/lib/finance/accounting-invoice-companies"

/** 列表行（API 返回 JSON：BigInt id 已转 string，Decimal 为 string） */
type Row = {
  id: string
  company: string
  master_order_number: string | null
  order_number: string | null
  contract_date: string | null
  contract_price: string | null
  broker_company: string | null
  broker_load_number: string | null
  from_to: string | null
  invoice_number: string
  invoice_date: string | null
  invoice_price: string | null
  check_date: string | null
  check_amount: string | null
  check_number: string | null
  deduction: string | null
  rts: string | null
  difference: string | null
  notes: string | null
}

type ListData = PaginatedData<Row>

type DateFilterType = "invoice" | "check"

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function fmtDate(value: string | null) {
  return value ? value.slice(0, 10) : ""
}

function fmtMoney(value: string | null) {
  if (value == null || value === "") return ""
  const n = Number(value)
  if (Number.isNaN(n)) return ""
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtText(value: string | null) {
  return value == null || value === "" ? "—" : value
}

function CardField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm" title={value}>
        {value}
      </dd>
    </div>
  )
}

async function downloadExport(url: string, filename: string, successToast: string) {
  try {
    toast.loading("正在生成 Excel 文件，请稍候...")
    const response = await fetch(url)
    if (!response.ok) {
      const errorMsg = await getApiErrorMessage(response, `导出失败 (${response.status})`)
      throw new Error(errorMsg)
    }
    const blob = await response.blob()
    const objectUrl = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = objectUrl
    a.download = filename
    a.click()
    window.URL.revokeObjectURL(objectUrl)
    toast.dismiss()
    toast.success(successToast)
  } catch (error: unknown) {
    console.error("导出陆运账单失败:", error)
    toast.dismiss()
    toast.error(getErrorMessage(error, "导出失败，请重试"))
  }
}

const columnHelper = createColumnHelper<Row>()

/** 排序图标（服务端排序，点击表头在 desc/asc 间切换） */
function SortIcon({ id, sorting }: { id: string; sorting: SortingState }) {
  const sorted = sorting.find((s) => s.id === id)
  if (!sorted) return <ArrowUpDown className="ml-1 h-3 w-3 text-slate-400" />
  return sorted.desc ? (
    <ArrowDown className="ml-1 h-3 w-3 text-amber-300" />
  ) : (
    <ArrowUp className="ml-1 h-3 w-3 text-amber-300" />
  )
}

export function AccountingInvoiceTable() {
  const router = useRouter()

  // 数据与分页/排序
  const [rows, setRows] = React.useState<Row[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(100)
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "invoice_date", desc: true }])
  const [loading, setLoading] = React.useState(true)
  const [reloadFlag, setReloadFlag] = React.useState(0)

  // 筛选条件（变更即回第一页）
  const [searchInput, setSearchInput] = React.useState("")
  const [appliedSearch, setAppliedSearch] = React.useState("")
  const [companies, setCompanies] = React.useState<string[]>([])
  const [fromTo, setFromTo] = React.useState("")
  const [dateType, setDateType] = React.useState<DateFilterType>("invoice")
  const [dateFrom, setDateFrom] = React.useState("")
  const [dateTo, setDateTo] = React.useState("")

  // 勾选与新建/编辑弹窗
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingRecord, setEditingRecord] = React.useState<Record<string, unknown> | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)

  const refresh = React.useCallback(() => setReloadFlag((f) => f + 1), [])

  const buildQueryParams = React.useCallback((): string => {
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("pageSize", String(pageSize))
    if (sorting[0]) {
      params.set("sort", sorting[0].id)
      params.set("order", sorting[0].desc ? "desc" : "asc")
    }
    if (appliedSearch) params.set("search", appliedSearch)
    if (companies.length > 0) params.set("company", companies.join(","))
    if (fromTo) params.set("from_to", fromTo)
    if (dateFrom) {
      params.set(
        dateType === "invoice" ? "invoice_date_from" : "check_date_from",
        dateFrom
      )
    }
    if (dateTo) {
      params.set(dateType === "invoice" ? "invoice_date_to" : "check_date_to", dateTo)
    }
    return params.toString()
  }, [page, pageSize, sorting, appliedSearch, companies, fromTo, dateType, dateFrom, dateTo])

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        if (cancelled) return
        const data = await fetchJson<ListData>(
          `/api/finance/accounting-invoices?${buildQueryParams()}`
        )
        if (cancelled) return
        setRows(data.rows)
        setTotal(data.pagination.total)
        // 删除后落在空页时回退到最后一页
        if (data.rows.length === 0 && page > 1 && data.pagination.total > 0) {
          setPage(Math.max(1, Math.ceil(data.pagination.total / pageSize)))
        }
      } catch (error) {
        if (!cancelled) toast.error(getErrorMessage(error, "加载陆运账单失败"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [buildQueryParams, reloadFlag, page, pageSize])

  const toggleSort = React.useCallback((id: string) => {
    setSorting((prev) => {
      const current = prev[0]
      if (current?.id === id) return [{ id, desc: !current.desc }]
      return [{ id, desc: true }]
    })
    setPage(1)
  }, [])

  // —— 勾选 ——
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const toggleAll = React.useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (rows.every((r) => next.has(r.id))) rows.forEach((r) => next.delete(r.id))
      else rows.forEach((r) => next.add(r.id))
      return next
    })
  }, [rows])
  const toggleRow = React.useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const selectedRows = React.useMemo(
    () => rows.filter((r) => selected.has(r.id)).map((r) => ({ id: r.id, company: r.company })),
    [rows, selected]
  )

  // —— 行操作 ——
  const handleRowDelete = React.useCallback(
    async (row: Row) => {
      if (!window.confirm(`确定删除账单「${row.invoice_number}」？`)) return
      try {
        await fetchJson<{ id: string }>(`/api/finance/accounting-invoices/${row.id}`, {
          method: "DELETE",
        })
        toast.success("已删除")
        setSelected((prev) => {
          const next = new Set(prev)
          next.delete(row.id)
          return next
        })
        refresh()
      } catch (error) {
        toast.error(getErrorMessage(error, "删除失败"))
      }
    },
    [refresh]
  )

  const handleBatchDelete = React.useCallback(async () => {
    if (selected.size === 0) return
    if (!window.confirm(`确定删除选中的 ${selected.size} 条账单？`)) return
    try {
      await fetchJson<{ count: number }>(
        `/api/finance/accounting-invoices/batch-delete?ids=${encodeURIComponent([...selected].join(","))}`,
        { method: "DELETE" }
      )
      toast.success(`已删除 ${selected.size} 条账单`)
      setSelected(new Set())
      refresh()
    } catch (error) {
      toast.error(getErrorMessage(error, "批量删除失败"))
    }
  }, [selected, refresh])

  const openCreate = React.useCallback(() => {
    setEditingRecord(null)
    setDialogOpen(true)
  }, [])

  const openEdit = React.useCallback(async (row: Row) => {
    setDetailLoading(true)
    try {
      const data = await fetchJson<Record<string, unknown>>(
        `/api/finance/accounting-invoices/${row.id}`
      )
      setEditingRecord(data)
      setDialogOpen(true)
    } catch (error) {
      toast.error(getErrorMessage(error, "加载账单失败"))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const closeDialog = React.useCallback(() => {
    setDialogOpen(false)
    setEditingRecord(null)
  }, [])

  const handleRowPrint = React.useCallback((row: Row) => {
    if (!row.company || !ACCOUNTING_PDF_TEMPLATE_COMPANIES.includes(row.company)) {
      toast.error(`公司「${row.company || "未知"}」暂无 PDF 模版`)
      return
    }
    window.open(
      `/api/finance/accounting-invoices/${row.id}/pdf?t=${Date.now()}`,
      "_blank",
      "noopener,noreferrer"
    )
  }, [])

  const renderRowActions = React.useCallback(
    (r: Row) => (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="查看详情"
          aria-label={`查看 ${r.invoice_number}`}
          onClick={() => router.push(`/dashboard/finance/accounting-invoices/${r.id}`)}
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="打印PDF"
          aria-label={`打印 ${r.invoice_number}`}
          onClick={() => handleRowPrint(r)}
        >
          <FileText className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="编辑"
          aria-label={`编辑 ${r.invoice_number}`}
          onClick={() => openEdit(r)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          title="删除"
          aria-label={`删除 ${r.invoice_number}`}
          onClick={() => handleRowDelete(r)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    ),
    [router, handleRowPrint, openEdit, handleRowDelete]
  )

  // —— 导出 ——
  const handleExportFiltered = React.useCallback(async () => {
    const params = new URLSearchParams(buildQueryParams())
    params.delete("page")
    params.delete("pageSize")
    await downloadExport(
      `/api/finance/accounting-invoices/export?${params.toString()}`,
      `陆运账单_筛选_${new Date().toISOString().slice(0, 10)}.xlsx`,
      `成功导出 ${total} 条数据`
    )
  }, [buildQueryParams, total])

  const handleExportAll = React.useCallback(async () => {
    await downloadExport(
      "/api/finance/accounting-invoices/export",
      `陆运账单_全部_${new Date().toISOString().slice(0, 10)}.xlsx`,
      `成功导出全部 ${total} 条数据`
    )
  }, [total])

  const handleExportSelected = React.useCallback(async () => {
    if (selected.size === 0) {
      toast.error("请先勾选要导出的记录")
      return
    }
    await downloadExport(
      `/api/finance/accounting-invoices/export?ids=${encodeURIComponent([...selected].join(","))}`,
      `陆运账单_选中_${new Date().toISOString().slice(0, 10)}.xlsx`,
      `成功导出 ${selected.size} 条数据`
    )
  }, [selected])

  // —— 筛选交互 ——
  const toggleCompany = React.useCallback((value: string, checked: boolean) => {
    setCompanies((prev) => {
      const next = checked ? [...new Set([...prev, value])] : prev.filter((c) => c !== value)
      return next
    })
    setPage(1)
  }, [])

  const resetFilters = React.useCallback(() => {
    setSearchInput("")
    setAppliedSearch("")
    setCompanies([])
    setFromTo("")
    setDateType("invoice")
    setDateFrom("")
    setDateTo("")
    setPage(1)
  }, [])

  const applySearch = React.useCallback(() => {
    setAppliedSearch(searchInput.trim())
    setPage(1)
  }, [searchInput])

  // —— 列定义（sortable 与源 config 一致） ——
  const columns = React.useMemo(
    () => [
      columnHelper.display({
        id: "select",
        size: 36,
        header: () => (
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            aria-label="全选本页"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selected.has(row.original.id)}
            onCheckedChange={() => toggleRow(row.original.id)}
            aria-label="选择该行"
          />
        ),
      }),
      columnHelper.accessor("company", {
        header: ({ column }) => (
          <button type="button" className="inline-flex items-center hover:text-foreground" onClick={() => toggleSort(column.id)}>
            公司
            <SortIcon id={column.id} sorting={sorting} />
          </button>
        ),
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("master_order_number", { header: "总货号", cell: (info) => info.getValue() ?? "" }),
      columnHelper.accessor("order_number", { header: "货号", cell: (info) => info.getValue() ?? "" }),
      columnHelper.accessor("contract_date", {
        header: ({ column }) => (
          <button type="button" className="inline-flex items-center hover:text-foreground" onClick={() => toggleSort(column.id)}>
            合同日期
            <SortIcon id={column.id} sorting={sorting} />
          </button>
        ),
        cell: (info) => fmtDate(info.getValue()),
      }),
      columnHelper.accessor("contract_price", {
        header: ({ column }) => (
          <button type="button" className="inline-flex items-center hover:text-foreground" onClick={() => toggleSort(column.id)}>
            合同价格
            <SortIcon id={column.id} sorting={sorting} />
          </button>
        ),
        cell: (info) => fmtMoney(info.getValue()),
      }),
      columnHelper.accessor("broker_company", { header: "Broker公司", cell: (info) => info.getValue() ?? "" }),
      columnHelper.accessor("broker_load_number", { header: "Load #", cell: (info) => info.getValue() ?? "" }),
      columnHelper.accessor("from_to", { header: "From - To", cell: (info) => info.getValue() ?? "" }),
      columnHelper.accessor("invoice_number", {
        header: ({ column }) => (
          <button type="button" className="inline-flex items-center hover:text-foreground" onClick={() => toggleSort(column.id)}>
            Invoice Number
            <SortIcon id={column.id} sorting={sorting} />
          </button>
        ),
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("invoice_date", {
        header: ({ column }) => (
          <button type="button" className="inline-flex items-center hover:text-foreground" onClick={() => toggleSort(column.id)}>
            Invoice 日期
            <SortIcon id={column.id} sorting={sorting} />
          </button>
        ),
        cell: (info) => fmtDate(info.getValue()),
      }),
      columnHelper.accessor("invoice_price", {
        header: ({ column }) => (
          <button type="button" className="inline-flex items-center hover:text-foreground" onClick={() => toggleSort(column.id)}>
            Invoice 价格
            <SortIcon id={column.id} sorting={sorting} />
          </button>
        ),
        cell: (info) => fmtMoney(info.getValue()),
      }),
      columnHelper.accessor("check_date", {
        header: ({ column }) => (
          <button type="button" className="inline-flex items-center hover:text-foreground" onClick={() => toggleSort(column.id)}>
            支票日期
            <SortIcon id={column.id} sorting={sorting} />
          </button>
        ),
        cell: (info) => fmtDate(info.getValue()),
      }),
      columnHelper.accessor("check_amount", {
        header: ({ column }) => (
          <button type="button" className="inline-flex items-center hover:text-foreground" onClick={() => toggleSort(column.id)}>
            支票金额
            <SortIcon id={column.id} sorting={sorting} />
          </button>
        ),
        cell: (info) => fmtMoney(info.getValue()),
      }),
      columnHelper.accessor("check_number", { header: "支票号", cell: (info) => info.getValue() ?? "" }),
      columnHelper.accessor("deduction", { header: "扣", cell: (info) => info.getValue() ?? "" }),
      columnHelper.accessor("rts", { header: "RTS", cell: (info) => info.getValue() ?? "" }),
      columnHelper.accessor("difference", { header: "差额", cell: (info) => info.getValue() ?? "" }),
      columnHelper.accessor("notes", { header: "备注", cell: (info) => info.getValue() ?? "" }),
      columnHelper.display({
        id: "actions",
        size: 140,
        header: "操作",
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex items-center justify-center">
              {renderRowActions(r)}
            </div>
          )
        },
      }),
    ],
    [allSelected, toggleAll, selected, toggleRow, sorting, toggleSort, renderRowActions]
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    enableSortingRemoval: false,
  })

  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4">
      {/* 页面头部 + 操作工具栏 */}
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="relative overflow-hidden bg-slate-950 px-4 py-5 text-white sm:px-6">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-70"
            style={{
              backgroundImage:
                "radial-gradient(circle at 82% 20%, rgba(245, 158, 11, 0.20), transparent 34%), radial-gradient(circle at 15% 100%, rgba(56, 189, 248, 0.16), transparent 30%)",
            }}
          />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300">
                财务管理
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">陆运账单</h1>
                <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs text-slate-200">
                  共 {total} 条
                </span>
                {selected.size > 0 && (
                  <span className="rounded-full border border-amber-300/40 bg-amber-400/15 px-2.5 py-1 text-xs font-medium text-amber-200">
                    已选 {selected.size} 条
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-300">
                承运商对 Broker 开票 + 会计对账
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="bg-amber-500 text-slate-950 hover:bg-amber-400 focus-visible:ring-amber-300/50"
                onClick={openCreate}
              >
                <Plus className="mr-2 h-4 w-4" />
                新建账单
              </Button>
              <AccountingInvoicesBatchPdf selectedRows={selectedRows} />
              {selected.size > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  onClick={handleBatchDelete}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  批量删除
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    批量导出
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportFiltered}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    导出筛选结果（{total}条）
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportAll}>
                    <Database className="mr-2 h-4 w-4" />
                    导出全部数据（{total}条）
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportSelected}>
                    <Download className="mr-2 h-4 w-4" />
                    导出选中（{selected.size}条）
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* 统一筛选与搜索工具栏 */}
        <div className="border-t bg-muted/30 px-3 py-3 sm:px-4">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 w-full justify-between bg-background sm:w-[136px]"
                  >
                    {companies.length > 0 ? `公司 ${companies.length}` : "全部公司"}
                    <ChevronDown className="ml-1 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {ACCOUNTING_COMPANY_OPTIONS.map((opt) => (
                    <DropdownMenuCheckboxItem
                      key={opt.value}
                      checked={companies.includes(opt.value)}
                      onCheckedChange={(checked) => toggleCompany(opt.value, checked === true)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {opt.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Select
                value={fromTo || "__all__"}
                onValueChange={(v) => {
                  setFromTo(v === "__all__" ? "" : v)
                  setPage(1)
                }}
              >
                <SelectTrigger
                  className="h-9 w-full bg-background sm:w-[150px]"
                  aria-label="运输线路"
                >
                  <SelectValue placeholder="运输线路" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">全部线路</SelectItem>
                  {ACCOUNTING_FROM_TO_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div
                aria-label="时间筛选"
                className="flex w-full min-w-0 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 shadow-xs sm:w-auto"
              >
                <div
                  role="tablist"
                  aria-label="时间类型"
                  className="flex shrink-0 items-center rounded-md bg-muted p-0.5"
                >
                  {(
                    [
                      ["invoice", "Invoice日期"],
                      ["check", "支票日期"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={dateType === value}
                      onClick={() => {
                        setDateType(value)
                        setPage(1)
                      }}
                      className={
                        dateType === value
                          ? "rounded-[5px] bg-background px-2 py-1 text-xs font-medium text-foreground shadow-xs"
                          : "rounded-[5px] px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <Input
                  type="date"
                  aria-label="开始日期"
                  className="h-7 min-w-24 flex-1 border-0 px-1 text-xs shadow-none focus-visible:border-transparent focus-visible:ring-0 sm:w-32"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    setPage(1)
                  }}
                />
                <span className="text-xs text-muted-foreground">至</span>
                <Input
                  type="date"
                  aria-label="结束日期"
                  className="h-7 min-w-24 flex-1 border-0 px-1 text-xs shadow-none focus-visible:border-transparent focus-visible:ring-0 sm:w-32"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    setPage(1)
                  }}
                />
              </div>
            </div>

            <div className="flex h-10 w-full min-w-0 items-center gap-1 rounded-lg border border-input bg-background p-1 shadow-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30 xl:ml-auto xl:max-w-md">
              <Search
                className="ml-1.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                aria-label="搜索账单"
                className="h-8 min-w-0 flex-1 rounded-none border-0 px-1 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0"
                placeholder="发票号 / 货号 / Load# / 支票号 / 备注"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applySearch()
                }}
              />
              <Button size="sm" className="h-8 shrink-0" onClick={applySearch}>
                搜索
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground"
                onClick={resetFilters}
                title="清空筛选条件"
                aria-label="清空筛选条件"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* 宽屏表格；低于 2xl 分辨率切换为卡片视图 */}
      <div className="hidden overflow-x-auto rounded-lg border bg-card 2xl:block">
        <Table className="text-[13px]">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="h-10 whitespace-nowrap border-slate-800 bg-slate-950 px-3 text-[12px] font-semibold text-slate-100 [&_button]:text-slate-100 [&_button:hover]:text-white"
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  正在加载...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  暂无账单数据
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="h-8 px-2 py-1.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div
        aria-label="陆运账单卡片列表"
        className="grid gap-3 2xl:hidden min-[560px]:grid-cols-2 min-[900px]:grid-cols-3"
      >
        {loading ? (
          <div className="flex min-h-32 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground min-[560px]:col-span-2 min-[900px]:col-span-3">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            正在加载...
          </div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-32 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground min-[560px]:col-span-2 min-[900px]:col-span-3">
            暂无账单数据
          </div>
        ) : (
          rows.map((row) => (
            <article
              key={row.id}
              className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-xs"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-amber-300/60 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      {fmtText(row.company)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fmtDate(row.invoice_date) || "—"}
                    </span>
                  </div>
                  <h2 className="mt-2 break-words text-sm font-semibold" title={row.invoice_number}>
                    {fmtText(row.invoice_number)}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmtText(row.from_to)}
                  </p>
                </div>
                <Checkbox
                  checked={selected.has(row.id)}
                  onCheckedChange={() => toggleRow(row.id)}
                  aria-label={`选择 ${row.invoice_number}`}
                  className="mt-1"
                />
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
                <CardField label="Invoice 金额" value={fmtMoney(row.invoice_price) || "—"} />
                <CardField label="Load #" value={fmtText(row.broker_load_number)} />
                <CardField label="总货号" value={fmtText(row.master_order_number)} />
                <CardField label="货号" value={fmtText(row.order_number)} />
                <CardField label="合同日期" value={fmtDate(row.contract_date) || "—"} />
                <CardField label="合同价格" value={fmtMoney(row.contract_price) || "—"} />
                <CardField label="支票日期" value={fmtDate(row.check_date) || "—"} />
                <CardField label="支票金额" value={fmtMoney(row.check_amount) || "—"} />
                <CardField label="支票号" value={fmtText(row.check_number)} />
                <CardField label="Broker公司" value={fmtText(row.broker_company)} />
              </dl>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <span className="text-xs text-muted-foreground">
                  扣 {fmtText(row.deduction)} · RTS {fmtText(row.rts)} · 差额{" "}
                  {fmtText(row.difference)}
                </span>
                {renderRowActions(row)}
              </div>
            </article>
          ))
        )}
      </div>

      {/* 分页 */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          共 {total} 条 · 第 {page}/{pageCount} 页
        </span>
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v))
              setPage(1)
            }}
          >
            <SelectTrigger className="h-8 w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[20, 50, 100, 200].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} 条/页
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount || loading}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            下一页
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 新建/编辑弹窗：复用模版编辑表单 */}
      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRecord ? "编辑陆运账单" : "新建陆运账单"}</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在加载账单...
            </div>
          ) : (
            <AccountingInvoiceForm
              key={String(editingRecord?.id ?? "new")}
              data={editingRecord}
              onSuccess={() => {
                closeDialog()
                refresh()
              }}
              onCancel={closeDialog}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

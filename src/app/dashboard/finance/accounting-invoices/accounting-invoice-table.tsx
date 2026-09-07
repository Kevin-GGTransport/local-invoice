"use client"

/**
 * 陆运账单列表（本模块专用表格，替代源项目通用 EntityTable）
 * 服务端分页/排序/筛选 + 勾选批量（合并打印 PDF / 导出 Excel / 批量删除）
 * + 新建/编辑弹窗复用模版编辑表单（AccountingInvoiceForm）
 */

import { invoiceMonthRange, selectedInvoiceMonth } from "@/lib/finance/accounting-invoice-month"
import React from "react"
import { useRouter } from "next/navigation"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import { cn } from "@/lib/utils"
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
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
  Send,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { AccountingInvoiceForm } from "@/components/finance/accounting-invoice-form"
import { AccountingInvoicesBatchPdf } from "@/components/finance/accounting-invoices-batch-pdf"
import { fetchJson, getApiErrorMessage } from "@/lib/api/client"
import type { PaginatedData } from "@/lib/api/types"
import { openPdf, reservePdfWindow } from "@/lib/utils/open-pdf"
import { MAX_NEGATIVE_INVOICE_DATE_BATCH } from "@/lib/finance/accounting-invoice-negative-date"
import { MAX_INVOICE_DEDUCTION_BATCH } from "@/lib/finance/accounting-invoice-deduction"
import { MAX_ACCOUNTING_INVOICE_SEND } from "@/lib/finance/accounting-invoice-send"
import {
  AccountingInvoiceToolbar,
  type CompanyOption,
  type InvoiceTab,
} from "./accounting-invoice-toolbar"

/** 列表行（API 返回 JSON：BigInt id 已转 string，Decimal 为 string） */
type Row = {
  id: string
  company: string
  master_order_number: string | null
  order_number: string | null
  contract_date: string | null
  contract_price: string | null
  bill_to: string | null
  broker_load_number: string | null
  billing_category: string | null
  tonu: boolean
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
type SelectedRow = Pick<Row, "id" | "company" | "invoice_number" | "invoice_date" | "invoice_price" | "deduction">

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

function localToday(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

type SendTarget = {
  ids: string[]
  label: string
  isBatch: boolean
}

function TonuIcon({ value }: { value: boolean }) {
  return value ? (
    <Check className="mx-auto size-4 text-emerald-600" aria-label="TONU：是" />
  ) : (
    <X className="mx-auto size-4 text-rose-600" aria-label="TONU：否" />
  )
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

// —— 分组拖拽排序：拖动分组表头整组移动，组内列顺序不变 ——
const GROUP_ORDER_STORAGE_KEY = "accounting-invoices.group-column-order.v1"
const DEFAULT_GROUP_ORDER = ["business", "contract", "broker", "invoice", "other"] as const
/** 各分组包含的叶子列 id（与 columns 定义保持一致），用于生成 TanStack columnOrder */
const GROUP_LEAF_COLUMN_IDS: Record<string, string[]> = {
  business: ["select", "company", "master_order_number", "order_number"],
  contract: ["contract_date", "contract_price"],
  broker: ["bill_to", "broker_load_number", "billing_category", "tonu"],
  invoice: ["invoice_number", "invoice_date", "invoice_price", "difference"],
  other: ["deduction", "notes", "actions"],
}

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const copy = [...list]
  const [moved] = copy.splice(from, 1)
  copy.splice(to, 0, moved)
  return copy
}

/** 读取持久化的分组顺序，容忍脏数据/新增分组（缺失的补到末尾） */
function loadGroupOrder(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_GROUP_ORDER]
  try {
    const raw = window.localStorage.getItem(GROUP_ORDER_STORAGE_KEY)
    if (!raw) return [...DEFAULT_GROUP_ORDER]
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...DEFAULT_GROUP_ORDER]
    const saved = parsed.filter(
      (id): id is string => typeof id === "string" && (DEFAULT_GROUP_ORDER as readonly string[]).includes(id)
    )
    const missing = DEFAULT_GROUP_ORDER.filter((id) => !saved.includes(id))
    return [...new Set(saved), ...missing]
  } catch {
    return [...DEFAULT_GROUP_ORDER]
  }
}

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

export function AccountingInvoiceTable({ initialToday }: { initialToday: string }) {
  const router = useRouter()
  const initialYear = Number(initialToday.slice(0, 4))

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
  const [brokerInput, setBrokerInput] = React.useState("")
  const [appliedBroker, setAppliedBroker] = React.useState("")
  const [companies, setCompanies] = React.useState<string[]>([])
  const [companyOptions, setCompanyOptions] = React.useState<CompanyOption[]>([])
  const [billingCategory, setBillingCategory] = React.useState("")
  const [invoiceTab, setInvoiceTab] = React.useState<InvoiceTab>("all")
  const [dateFrom, setDateFrom] = React.useState("")
  const [dateTo, setDateTo] = React.useState("")
  const [filterYear, setFilterYear] = React.useState(initialYear)
  const activeMonth = selectedInvoiceMonth(filterYear, dateFrom, dateTo)
  const selectMonth = React.useCallback((year: number, month: number) => {
    const range = invoiceMonthRange(year, month)
    setDateFrom(range.from)
    setDateTo(range.to)
    setPage(1)
  }, [])

  // 吸顶工具栏高度（用于计算表格滚动容器 max-height）与分组列顺序
  const [toolbarHeight, setToolbarHeight] = React.useState(0)
  const [groupOrder, setGroupOrder] = React.useState<string[]>([...DEFAULT_GROUP_ORDER])
  const [draggingGroup, setDraggingGroup] = React.useState<string | null>(null)

  React.useEffect(() => {
    setGroupOrder(loadGroupOrder())
  }, [])

  const persistGroupOrder = React.useCallback((order: string[]) => {
    try {
      window.localStorage.setItem(GROUP_ORDER_STORAGE_KEY, JSON.stringify(order))
    } catch {
      // localStorage 不可用（隐私模式等）时仅本次会话生效
    }
  }, [])

  // 勾选与新建/编辑弹窗
  const [selected, setSelected] = React.useState<Map<string, SelectedRow>>(new Map())
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingRecord, setEditingRecord] = React.useState<Record<string, unknown> | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [sendTarget, setSendTarget] = React.useState<SendTarget | null>(null)
  const [sendDate, setSendDate] = React.useState(initialToday)
  const [sending, setSending] = React.useState(false)
  const [dateEditIds, setDateEditIds] = React.useState<string[] | null>(null)
  const [negativeDate, setNegativeDate] = React.useState(initialToday)
  const [savingNegativeDate, setSavingNegativeDate] = React.useState(false)
  const [deductionEditIds, setDeductionEditIds] = React.useState<string[] | null>(null)
  const [deductionText, setDeductionText] = React.useState("")
  const [deductionInit, setDeductionInit] = React.useState("")
  const [savingDeduction, setSavingDeduction] = React.useState(false)

  React.useEffect(() => {
    void fetchJson<{ code: string; name: string; has_active_template: boolean }[]>("/api/companies")
      .then(setCompanyOptions)
      .catch(() => setCompanyOptions([]))
  }, [])

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
    if (appliedBroker) params.set("bill_to", appliedBroker)
    if (companies.length > 0) params.set("company", companies.join(","))
    if (billingCategory) params.set("billing_category", billingCategory)
    if (invoiceTab !== "all") params.set("invoice_status", invoiceTab)
    if (dateFrom) params.set("invoice_date_from", dateFrom)
    if (dateTo) params.set("invoice_date_to", dateTo)
    return params.toString()
  }, [page, pageSize, sorting, appliedSearch, appliedBroker, companies, billingCategory, invoiceTab, dateFrom, dateTo])

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
        setSelected((prev) => {
          const next = new Map(prev)
          for (const row of data.rows) {
            if (next.has(row.id)) next.set(row.id, row)
          }
          return next
        })
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
      const next = new Map(prev)
      if (rows.every((r) => next.has(r.id))) rows.forEach((r) => next.delete(r.id))
      else rows.forEach((r) => next.set(r.id, r))
      return next
    })
  }, [rows])
  const toggleRow = React.useCallback((row: Row) => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(row.id)) next.delete(row.id)
      else next.set(row.id, row)
      return next
    })
  }, [])
  const selectedRows = React.useMemo(
    () => [...selected.values()],
    [selected]
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
          const next = new Map(prev)
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
        `/api/finance/accounting-invoices/batch-delete?ids=${encodeURIComponent([...selected.keys()].join(","))}`,
        { method: "DELETE" }
      )
      toast.success(`已删除 ${selected.size} 条账单`)
      setSelected(new Map())
      refresh()
    } catch (error) {
      toast.error(getErrorMessage(error, "批量删除失败"))
    }
  }, [selected, refresh])

  const openSendDialog = React.useCallback((target: SendTarget) => {
    setSendDate(localToday())
    setSendTarget(target)
  }, [])

  const openSingleSend = React.useCallback((row: Row) => {
    if (row.invoice_date) {
      toast.error(`账单「${row.invoice_number}」已于 ${fmtDate(row.invoice_date)} 发送`)
      return
    }
    openSendDialog({ ids: [row.id], label: row.invoice_number, isBatch: false })
  }, [openSendDialog])

  const openBatchSend = React.useCallback(() => {
    if (selected.size === 0) {
      toast.error("请先勾选要发送的账单")
      return
    }
    if (selected.size > MAX_ACCOUNTING_INVOICE_SEND) {
      toast.error(`一次最多发送 ${MAX_ACCOUNTING_INVOICE_SEND} 条`)
      return
    }
    const alreadySent = [...selected.values()].filter((row) => row.invoice_date != null)
    if (alreadySent.length > 0) {
      toast.error(`以下账单已发送：${alreadySent.map((row) => row.invoice_number).join("、")}`)
      return
    }
    openSendDialog({
      ids: [...selected.keys()],
      label: `${selected.size} 条账单`,
      isBatch: true,
    })
  }, [selected, openSendDialog])

  const handleSend = React.useCallback(async () => {
    if (!sendTarget || !sendDate) return
    const popup = reservePdfWindow()
    if (!popup) {
      toast.error("浏览器拦截了弹出窗口，请允许后重试")
      return
    }

    setSending(true)
    try {
      const result = await fetchJson<{ count: number; ids: string[]; invoice_date: string }>(
        "/api/finance/accounting-invoices/send",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: sendTarget.ids, invoice_date: sendDate }),
        }
      )
      const pdfUrl = result.ids.length === 1
        ? `/api/finance/accounting-invoices/${result.ids[0]}/pdf`
        : `/api/finance/accounting-invoices/batch-pdf?ids=${encodeURIComponent(result.ids.join(","))}`
      popup.location.assign(pdfUrl)
      toast.success(`已发送 ${result.count} 条账单`)
      if (sendTarget.isBatch) {
        setSelected(new Map())
      } else {
        setSelected((prev) => {
          const next = new Map(prev)
          result.ids.forEach((id) => next.delete(id))
          return next
        })
      }
      setSendTarget(null)
      refresh()
    } catch (error) {
      popup.close()
      toast.error(getErrorMessage(error, "发账单失败"))
    } finally {
      setSending(false)
    }
  }, [sendTarget, sendDate, refresh])

  const openNegativeDateDialog = React.useCallback(() => {
    if (!selected.size || selected.size > MAX_NEGATIVE_INVOICE_DATE_BATCH) {
      toast.error(`请选择 1 至 ${MAX_NEGATIVE_INVOICE_DATE_BATCH} 条负数账单`)
      return
    }
    if ([...selected.values()].some((row) => row.invoice_price == null || !(Number(row.invoice_price) < 0))) {
      toast.error("选中记录包含非负数账单，请重新选择")
      return
    }
    setDateEditIds([...selected.keys()])
    setNegativeDate(localToday())
  }, [selected])

  const saveNegativeDate = React.useCallback(async () => {
    if (!dateEditIds || !negativeDate || savingNegativeDate) return
    setSavingNegativeDate(true)
    try {
      const result = await fetchJson<{ count: number }>(
        "/api/finance/accounting-invoices/negative-date",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: dateEditIds, invoice_date: negativeDate }),
        },
      )
      toast.success(`已修改 ${result.count} 条负数账单的 Invoice 日期`)
      setDateEditIds(null)
      setSelected(new Map())
      refresh()
    } catch (error) {
      toast.error(getErrorMessage(error, "修改 Invoice 日期失败"))
    } finally {
      setSavingNegativeDate(false)
    }
  }, [dateEditIds, negativeDate, savingNegativeDate, refresh])

  // 已收未平 / 有扣钱视图：批量填写或清除扣钱说明（单选一条即为快捷修改）
  const openDeductionDialog = React.useCallback(() => {
    if (!selected.size || selected.size > MAX_INVOICE_DEDUCTION_BATCH) {
      toast.error(`请选择 1 至 ${MAX_INVOICE_DEDUCTION_BATCH} 条账单`)
      return
    }
    const rows = [...selected.values()]
    const firstDeduction = rows.find((row) => row.deduction)?.deduction ?? ""
    setDeductionEditIds([...selected.keys()])
    setDeductionText(firstDeduction)
    setDeductionInit(firstDeduction)
  }, [selected])

  const saveDeduction = React.useCallback(async () => {
    if (!deductionEditIds || savingDeduction) return
    if (deductionText.length > 200) {
      toast.error("扣钱说明最长 200 字")
      return
    }
    setSavingDeduction(true)
    try {
      const result = await fetchJson<{ count: number }>(
        "/api/finance/accounting-invoices/deduction",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: deductionEditIds,
            deduction: deductionText.trim() === "" ? null : deductionText.trim(),
          }),
        },
      )
      toast.success(`已更新 ${result.count} 条账单的扣钱说明`)
      setDeductionEditIds(null)
      setSelected(new Map())
      refresh()
    } catch (error) {
      toast.error(getErrorMessage(error, "修改扣钱失败"))
    } finally {
      setSavingDeduction(false)
    }
  }, [deductionEditIds, deductionText, savingDeduction, refresh])

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
    const hasTemplate =
      companyOptions.find((c) => c.code === row.company)?.has_active_template ?? false
    if (!row.company || !hasTemplate) {
      toast.error(`公司「${row.company || "未知"}」暂无 PDF 模版`)
      return
    }
    openPdf(`/api/finance/accounting-invoices/${row.id}/pdf`)
  }, [companyOptions])

  const renderRowActions = React.useCallback(
    (r: Row) => (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={r.invoice_date ? `已于 ${fmtDate(r.invoice_date)} 发送` : "发账单"}
          aria-label={r.invoice_date ? `${r.invoice_number} 已发送` : `发送 ${r.invoice_number}`}
          disabled={r.invoice_date != null}
          onClick={() => openSingleSend(r)}
        >
          <Send className="h-4 w-4" />
        </Button>
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
    [router, openSingleSend, handleRowPrint, openEdit, handleRowDelete]
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
      `/api/finance/accounting-invoices/export?ids=${encodeURIComponent([...selected.keys()].join(","))}`,
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
    setBrokerInput("")
    setAppliedBroker("")
    setCompanies([])
    setBillingCategory("")
    setInvoiceTab("all")
    setFilterYear(initialYear)
    setDateFrom("")
    setDateTo("")
    setPage(1)
  }, [initialYear])

  const applySearch = React.useCallback(() => {
    setAppliedSearch(searchInput.trim())
    setAppliedBroker(brokerInput.trim())
    setPage(1)
  }, [searchInput, brokerInput])

  // —— 工具栏交互（吸顶工具栏组件的回调） ——
  const handleInvoiceTabChange = React.useCallback((tab: InvoiceTab) => {
    setInvoiceTab(tab)
    setSelected(new Map())
    setPage(1)
  }, [])

  const handleBillingCategoryChange = React.useCallback((value: string) => {
    setBillingCategory(value)
    setPage(1)
  }, [])

  const handleDateFromChange = React.useCallback((value: string) => {
    setDateFrom(value)
    if (value) setFilterYear(Number(value.slice(0, 4)))
    setPage(1)
  }, [])

  const handleDateToChange = React.useCallback((value: string) => {
    setDateTo(value)
    setPage(1)
  }, [])

  const handleFilterYearCommit = React.useCallback(
    (year: number) => {
      setFilterYear(year)
      if (activeMonth != null) selectMonth(year, activeMonth)
    },
    [activeMonth, selectMonth]
  )

  const handleClearMonth = React.useCallback(() => {
    setDateFrom("")
    setDateTo("")
    setPage(1)
  }, [])

  // —— 分组拖拽排序（原生 HTML5 DnD，拖第一行分组表头实时换位） ——
  const handleGroupDragStart = React.useCallback(
    (event: React.DragEvent<HTMLTableCellElement>, groupId: string) => {
      setDraggingGroup(groupId)
      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer.setData("text/plain", groupId)
    },
    []
  )

  const handleGroupDragOver = React.useCallback(
    (event: React.DragEvent<HTMLTableCellElement>, groupId: string) => {
      if (draggingGroup == null || draggingGroup === groupId) return
      event.preventDefault()
      event.dataTransfer.dropEffect = "move"
      const from = groupOrder.indexOf(draggingGroup)
      const to = groupOrder.indexOf(groupId)
      if (from < 0 || to < 0 || from === to) return
      const next = arrayMove(groupOrder, from, to)
      setGroupOrder(next)
      persistGroupOrder(next)
    },
    [draggingGroup, groupOrder, persistGroupOrder]
  )

  const clearDraggingGroup = React.useCallback(() => setDraggingGroup(null), [])

  // —— 列定义（sortable 与源 config 一致） ——
  const columns = React.useMemo(
    () => [
      columnHelper.group({ id: "business", header: "业务信息", columns: [
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
              onCheckedChange={() => toggleRow(row.original)}
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
      ] }),
      columnHelper.group({ id: "contract", header: "合同", columns: [
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
              合同金额
              <SortIcon id={column.id} sorting={sorting} />
            </button>
          ),
          cell: (info) => fmtMoney(info.getValue()),
        }),
      ] }),
      columnHelper.group({ id: "broker", header: "Broker", columns: [
        columnHelper.accessor("bill_to", { header: "Broker公司", cell: (info) => info.getValue() ?? "" }),
        columnHelper.accessor("broker_load_number", { header: "Load #", cell: (info) => info.getValue() ?? "" }),
        columnHelper.accessor("billing_category", { header: "账单分类", cell: (info) => info.getValue() ?? "" }),
        columnHelper.accessor("tonu", {
          header: "TONU",
          size: 56,
          cell: (info) => <TonuIcon value={info.getValue()} />,
        }),
      ] }),
      columnHelper.group({ id: "invoice", header: "Invoice", columns: [
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
        columnHelper.accessor("difference", {
          header: "差额",
          cell: (info) => {
            const value = info.getValue()
            if (value == null || value === "") return ""
            const n = Number(value)
            if (Number.isNaN(n) || n === 0) return ""
            return (
              <span className={n > 0 ? "font-medium text-rose-600 dark:text-rose-400" : "text-muted-foreground"} title={n > 0 ? "超收" : "未收足"}>
                {fmtMoney(value)}
              </span>
            )
          },
        }),
      ] }),
      columnHelper.group({ id: "other", header: "备注与操作", columns: [
        columnHelper.accessor("deduction", {
          header: "扣钱",
          cell: (info) => {
            const value = info.getValue()
            return value ? (
              <span className="text-rose-600 dark:text-rose-400" title={value}>{value}</span>
            ) : ""
          },
        }),
        columnHelper.accessor("notes", { header: "备注", cell: (info) => info.getValue() ?? "" }),
        columnHelper.display({
          id: "actions",
          size: 176,
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
      ] }),
    ],
    [allSelected, toggleAll, selected, toggleRow, sorting, toggleSort, renderRowActions]
  )

  // 视图：全部/未发账单不显示差额与扣钱列；负数、已收未平、有扣钱按需展示
  const showSettlementColumns =
    invoiceTab === "negative" || invoiceTab === "unmatched_paid" || invoiceTab === "with_deduction"
  const columnVisibility: VisibilityState = showSettlementColumns
    ? {}
    : { difference: false, deduction: false }

  const columnOrder = React.useMemo(
    () => groupOrder.flatMap((groupId) => GROUP_LEAF_COLUMN_IDS[groupId] ?? []),
    [groupOrder]
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnVisibility, columnOrder },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    enableSortingRemoval: false,
  })

  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  // 表格滚动容器高度：视口高 − 顶栏(64px) − 吸顶工具栏高 − 底部留白（分页条 + 间距 + 页边距，
  // 略小于实际值，保证页面可滚出足够距离让工具栏吸顶）
  const tableMaxHeight =
    toolbarHeight > 0 ? `calc(100dvh - ${Math.round(toolbarHeight) + 64 + 80}px)` : undefined

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
                承运商对 Broker 开票与账单管理
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
              {invoiceTab === "negative" && (
                <Button variant="outline" size="sm"
                  className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  disabled={selected.size === 0 || loading} onClick={openNegativeDateDialog}>
                  <Pencil className="mr-2 h-4 w-4" />
                  批量修改 Invoice 日期
                </Button>
              )}
              {(invoiceTab === "unmatched_paid" || invoiceTab === "with_deduction") && (
                <Button variant="outline" size="sm"
                  className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  disabled={selected.size === 0 || loading} onClick={openDeductionDialog}>
                  <Pencil className="mr-2 h-4 w-4" />
                  修改扣钱
                </Button>
              )}
              {selected.size > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                    onClick={openBatchSend}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    批量发账单
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                    onClick={handleBatchDelete}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    批量删除
                  </Button>
                </>
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

      </section>

      {/* 吸顶工具栏：状态 Tab + 筛选/搜索区（sticky 于顶部导航栏下方） */}
      <AccountingInvoiceToolbar
        invoiceTab={invoiceTab}
        onInvoiceTabChange={handleInvoiceTabChange}
        companies={companies}
        companyOptions={companyOptions}
        onToggleCompany={toggleCompany}
        billingCategory={billingCategory}
        onBillingCategoryChange={handleBillingCategoryChange}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={handleDateFromChange}
        onDateToChange={handleDateToChange}
        filterYear={filterYear}
        onFilterYearCommit={handleFilterYearCommit}
        activeMonth={activeMonth}
        onSelectMonth={selectMonth}
        onClearMonth={handleClearMonth}
        brokerInput={brokerInput}
        onBrokerInputChange={setBrokerInput}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onApplySearch={applySearch}
        onResetFilters={resetFilters}
        onHeightChange={setToolbarHeight}
      />

      {/* 宽屏表格；低于 2xl 分辨率切换为卡片视图。表格内部滚动，两行表头吸顶 */}
      <div
        className="hidden overflow-auto rounded-lg border bg-card 2xl:block"
        style={{ maxHeight: tableMaxHeight }}
      >
        <Table noWrapper className="text-[13px]">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => {
              const isGroupRow = headerGroup.depth === 0
              return (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      scope={header.subHeaders.length ? "colgroup" : "col"}
                      draggable={isGroupRow}
                      title={isGroupRow ? "拖动调整分组顺序" : undefined}
                      onDragStart={
                        isGroupRow
                          ? (event) => handleGroupDragStart(event, header.column.id)
                          : undefined
                      }
                      onDragOver={
                        isGroupRow
                          ? (event) => handleGroupDragOver(event, header.column.id)
                          : undefined
                      }
                      onDrop={isGroupRow ? (event) => event.preventDefault() : undefined}
                      onDragEnd={isGroupRow ? clearDraggingGroup : undefined}
                      className={cn(
                        "sticky h-10 whitespace-nowrap border-slate-800 bg-slate-950 px-3 text-[12px] font-semibold text-slate-100 [&_button]:text-slate-100 [&_button:hover]:text-white",
                        isGroupRow
                          ? "top-0 z-20 cursor-grab select-none active:cursor-grabbing"
                          : "top-10 z-10",
                        isGroupRow && draggingGroup === header.column.id ? "opacity-60" : ""
                      )}
                      style={{ width: header.subHeaders.length === 0 && header.getSize() !== 150 ? header.getSize() : undefined }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              )
            })}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-24 text-center text-muted-foreground">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  正在加载...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-24 text-center text-muted-foreground">
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
                    {fmtText(row.billing_category)}
                  </p>
                </div>
                <Checkbox
                  checked={selected.has(row.id)}
                  onCheckedChange={() => toggleRow(row)}
                  aria-label={`选择 ${row.invoice_number}`}
                  className="mt-1"
                />
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
                <CardField label="Invoice 金额" value={fmtMoney(row.invoice_price) || "—"} />
                {showSettlementColumns && (
                  <CardField label="差额" value={fmtMoney(row.difference) || "—"} />
                )}
                <CardField label="Load #" value={fmtText(row.broker_load_number)} />
                <CardField label="总货号" value={fmtText(row.master_order_number)} />
                <CardField label="货号" value={fmtText(row.order_number)} />
                <CardField label="合同日期" value={fmtDate(row.contract_date) || "—"} />
                <CardField label="合同金额" value={fmtMoney(row.contract_price) || "—"} />
                <CardField label="Broker公司" value={fmtText(row.bill_to)} />
                <div className="min-w-0">
                  <dt className="text-[11px] text-muted-foreground">TONU</dt>
                  <dd className="mt-0.5 flex h-5 items-center justify-start">
                    <TonuIcon value={row.tonu} />
                  </dd>
                </div>
                {showSettlementColumns && (
                  <CardField label="扣钱" value={fmtText(row.deduction)} />
                )}
              </dl>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
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
        <DialogContent className="max-h-[92vh] w-[min(96vw,80rem)] max-w-7xl overflow-y-auto">
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
              inDialog
              onSuccess={() => {
                closeDialog()
                refresh()
              }}
              onCancel={closeDialog}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={sendTarget != null}
        onOpenChange={(open) => {
          if (!open && !sending) setSendTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{sendTarget?.isBatch ? "批量发账单" : "发账单"}</DialogTitle>
            <DialogDescription>
              确认后将为 {sendTarget?.label ?? "选中账单"} 设置 Invoice 日期并打开 PDF。
              普通账单日期设置后不可修改；负数账单可在“负数账单”中批量修改日期。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label htmlFor="send-invoice-date" className="text-sm font-medium">
              Invoice 日期
            </label>
            <Input
              id="send-invoice-date"
              type="date"
              value={sendDate}
              onChange={(event) => setSendDate(event.target.value)}
              disabled={sending}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendTarget(null)} disabled={sending}>
              取消
            </Button>
            <Button onClick={() => void handleSend()} disabled={sending || !sendDate}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {sending ? "正在发送..." : "确认发送"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dateEditIds != null}
        onOpenChange={(open) => { if (!open && !savingNegativeDate) setDateEditIds(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>批量修改 Invoice 日期</DialogTitle>
            <DialogDescription>
              将为选中的 {dateEditIds?.length ?? 0} 条负数账单统一设置 Invoice 日期，覆盖已有日期。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label htmlFor="negative-invoice-date" className="text-sm font-medium">Invoice 日期</label>
            <Input id="negative-invoice-date" type="date" value={negativeDate}
              onChange={(event) => setNegativeDate(event.target.value)} disabled={savingNegativeDate} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDateEditIds(null)} disabled={savingNegativeDate}>取消</Button>
            <Button onClick={() => void saveNegativeDate()} disabled={savingNegativeDate || !negativeDate}>
              {savingNegativeDate && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {savingNegativeDate ? "正在保存..." : "确认修改"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deductionEditIds != null}
        onOpenChange={(open) => { if (!open && !savingDeduction) setDeductionEditIds(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>修改扣钱</DialogTitle>
            <DialogDescription>
              为选中的 {deductionEditIds?.length ?? 0} 条账单填写统一的扣钱说明，留空并保存即清除扣钱；扣钱不参与差额计算。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label htmlFor="invoice-deduction-input" className="text-sm font-medium">扣钱说明</label>
            <Input id="invoice-deduction-input" value={deductionText} maxLength={200}
              placeholder="如 RTS、扣款原因（最长 200 字）"
              onChange={(event) => setDeductionText(event.target.value)} disabled={savingDeduction}
              onKeyDown={(event) => { if (event.key === "Enter") void saveDeduction() }} />
            {deductionInit && deductionText === deductionInit && (
              <p className="text-xs text-muted-foreground">已带入选中账单中首个非空扣钱说明，可直接修改或清空。</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeductionEditIds(null)} disabled={savingDeduction}>取消</Button>
            <Button onClick={() => void saveDeduction()} disabled={savingDeduction}>
              {savingDeduction && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {savingDeduction ? "正在保存..." : "确认修改"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

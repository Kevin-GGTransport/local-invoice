"use client"

/**
 * 陆运账单列表编排器
 * 数据/分页/排序由 useServerTable 驱动，表格渲染复用通用 DataTable / TablePagination，
 * 列定义见 accounting-invoice-columns，弹窗见 accounting-invoice-dialogs，
 * 视图预设（筛选 + 排序 + 列显隐 + 分组顺序，按用户存库）见 accounting-invoice-view
 */

import { invoiceMonthRange, selectedInvoiceMonth } from "@/lib/finance/accounting-invoice-month"
import React from "react"
import { useRouter } from "next/navigation"
import {
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Database,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FileUp,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { AccountingInvoicesBatchPdf } from "@/components/finance/accounting-invoices-batch-pdf"
import { fetchJson, getApiErrorMessage } from "@/lib/api/client"
import { openPdf, reservePdfWindow } from "@/lib/utils/open-pdf"
import { MAX_NEGATIVE_INVOICE_DATE_BATCH } from "@/lib/finance/accounting-invoice-negative-date"
import { MAX_INVOICE_DEDUCTION_BATCH } from "@/lib/finance/accounting-invoice-deduction"
import { MAX_ACCOUNTING_INVOICE_SEND } from "@/lib/finance/accounting-invoice-send"
import type {
  ImportRowError,
  ImportSummary,
} from "@/lib/finance/accounting-invoice-import"
import { useServerTable } from "@/components/data-table/use-server-table"
import { DataTable } from "@/components/data-table/data-table"
import { TablePagination } from "@/components/data-table/table-pagination"
import {
  TableViewMenu,
  type TableViewItem,
} from "@/components/data-table/table-view-menu"
import { ColumnSettingsMenu } from "@/components/data-table/column-settings-menu"
import { useToolbarWorkspace } from "@/hooks/use-toolbar-workspace"
import { Workspace, StickyFooter } from "@/components/table-workspace"
import {
  AccountingInvoiceToolbar,
  type CompanyOption,
  type InvoiceTab,
} from "./accounting-invoice-toolbar"
import {
  useInvoiceColumns,
  fmtDate,
  fmtMoney,
  fmtText,
  TonuIcon,
  type AccountingInvoiceRow,
  type SelectedInvoiceRow,
} from "./accounting-invoice-columns"
import {
  InvoiceFormDialog,
  ImportInvoicesDialog,
  SendInvoiceDialog,
  NegativeDateDialog,
  DeductionDialog,
  type SendTarget,
} from "./accounting-invoice-dialogs"
import {
  INVOICE_TABLE_KEY,
  DEFAULT_GROUP_ORDER,
  GROUP_LEAF_COLUMN_IDS,
  INVOICE_COLUMN_SETTINGS_GROUPS,
  buildInvoiceViewConfig,
  parseInvoiceViewConfig,
  type InvoiceViewConfig,
} from "./accounting-invoice-view"

/** API 返回的已保存视图（BigInt id 已转 string） */
type ApiTableView = {
  id: string
  table_key: string
  name: string
  config: unknown
  is_default: boolean
}

const GROUP_ORDER_STORAGE_KEY = "accounting-invoices.group-column-order.v1"

/** 读取持久化的分组顺序，容忍脏数据/新增分组 */
function loadGroupOrder(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_GROUP_ORDER]
  try {
    const raw = window.localStorage.getItem(GROUP_ORDER_STORAGE_KEY)
    if (!raw) return [...DEFAULT_GROUP_ORDER]
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...DEFAULT_GROUP_ORDER]
    const defaults = DEFAULT_GROUP_ORDER as readonly string[]
    const saved = parsed.filter((id): id is string => typeof id === "string" && defaults.includes(id))
    const missing = defaults.filter((id) => !saved.includes(id))
    return [...new Set(saved), ...missing]
  } catch {
    return [...DEFAULT_GROUP_ORDER]
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function localToday(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
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

export function AccountingInvoiceTable({ initialToday }: { initialToday: string }) {
  const router = useRouter()
  const initialYear = Number(initialToday.slice(0, 4))

  // —— 筛选条件（变更即回第一页） ——
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

  // —— 列显隐：手动/视图覆盖优先于按 Tab 的自动规则 ——
  // （负数、已收未平、有扣钱视图默认展示差额与扣钱列，其余 Tab 默认隐藏）
  const [columnOverrides, setColumnOverrides] = React.useState<VisibilityState>({})
  const showSettlementColumns =
    invoiceTab === "negative" || invoiceTab === "unmatched_paid" || invoiceTab === "with_deduction"
  const columnVisibility: VisibilityState = React.useMemo(
    () => ({
      ...(showSettlementColumns ? {} : { difference: false, deduction: false }),
      ...columnOverrides,
    }),
    [showSettlementColumns, columnOverrides]
  )
  const handleToggleColumn = React.useCallback((id: string, visible: boolean) => {
    setColumnOverrides((prev) => ({ ...prev, [id]: visible }))
  }, [])

  // —— 分组列顺序（localStorage 持久化；应用视图时覆盖并回写） ——
  const [groupOrder, setGroupOrder] = React.useState<string[]>([...DEFAULT_GROUP_ORDER])

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

  const handleGroupOrderChange = React.useCallback(
    (next: string[]) => {
      setGroupOrder(next)
      persistGroupOrder(next)
    },
    [persistGroupOrder]
  )

  // —— 数据（服务端分页/排序） ——
  const buildParams = React.useCallback(
    ({ page, pageSize, sorting }: { page: number; pageSize: number; sorting: { id: string; desc: boolean }[] }) => {
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
      return params
    },
    [appliedSearch, appliedBroker, companies, billingCategory, invoiceTab, dateFrom, dateTo]
  )

  const handleLoadError = React.useCallback(
    (message: string) => toast.error(`加载陆运账单失败：${message}`),
    []
  )

  const {
    rows,
    total,
    page,
    setPage,
    pageSize,
    changePageSize,
    sorting,
    setSorting,
    toggleSort,
    loading,
    refresh,
  } = useServerTable<AccountingInvoiceRow>({
    endpoint: "/api/finance/accounting-invoices",
    buildParams,
    initialSorting: [{ id: "master_order_number", desc: true }],
    initialPageSize: 100,
    onError: handleLoadError,
  })

  const selectMonth = React.useCallback(
    (year: number, month: number) => {
      const range = invoiceMonthRange(year, month)
      setDateFrom(range.from)
      setDateTo(range.to)
      setPage(1)
    },
    [setPage]
  )

  // —— 勾选与新建/编辑弹窗 ——
  const [selected, setSelected] = React.useState<Map<string, SelectedInvoiceRow>>(new Map())
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

  // 数据刷新后同步勾选行的最新数据
  React.useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const next = new Map(prev)
      let changed = false
      for (const row of rows) {
        if (next.has(row.id) && next.get(row.id) !== row) {
          next.set(row.id, row)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [rows])

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const toggleAll = React.useCallback(() => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (rows.every((r) => next.has(r.id))) rows.forEach((r) => next.delete(r.id))
      else rows.forEach((r) => next.set(r.id, r))
      return next
    })
  }, [rows])
  const toggleRow = React.useCallback((row: AccountingInvoiceRow) => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(row.id)) next.delete(row.id)
      else next.set(row.id, row)
      return next
    })
  }, [])
  const isSelected = React.useCallback((id: string) => selected.has(id), [selected])
  const selectedRows = React.useMemo(() => [...selected.values()], [selected])

  // —— 视图预设（按用户存库，进页面应用默认视图） ——
  const [views, setViews] = React.useState<ApiTableView[]>([])
  const [activeViewId, setActiveViewId] = React.useState<string | null>(null)

  const viewItems: TableViewItem[] = React.useMemo(
    () => views.map((v) => ({ id: String(v.id), name: v.name, isDefault: v.is_default })),
    [views]
  )

  const applyView = React.useCallback(
    (config: InvoiceViewConfig, viewId: string | null) => {
      setInvoiceTab(config.filters.invoiceTab)
      setSelected(new Map())
      setAppliedSearch(config.filters.search)
      setSearchInput(config.filters.search)
      setAppliedBroker(config.filters.broker)
      setBrokerInput(config.filters.broker)
      setCompanies(config.filters.companies)
      setBillingCategory(config.filters.billingCategory)
      setDateFrom(config.filters.dateFrom)
      setDateTo(config.filters.dateTo)
      const year =
        config.filters.filterYear > 0
          ? config.filters.filterYear
          : config.filters.dateFrom
            ? Number(config.filters.dateFrom.slice(0, 4))
            : initialYear
      setFilterYear(Number.isInteger(year) && year > 1900 ? year : initialYear)
      setSorting(
        config.sorting.length > 0 ? config.sorting : [{ id: "master_order_number", desc: true }]
      )
      setColumnOverrides(config.columnVisibility)
      setGroupOrder(config.groupOrder)
      persistGroupOrder(config.groupOrder)
      setPage(1)
      setActiveViewId(viewId)
    },
    [initialYear, persistGroupOrder, setPage, setSorting]
  )

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchJson<{ views: ApiTableView[] }>(
          `/api/table-views?table=${INVOICE_TABLE_KEY}`
        )
        if (cancelled) return
        setViews(data.views)
        const def = data.views.find((v) => v.is_default)
        if (def) {
          const config = parseInvoiceViewConfig(def.config)
          if (config) applyView(config, String(def.id))
        }
      } catch {
        // 视图加载失败不阻塞列表使用
      }
    })()
    return () => {
      cancelled = true
    }
  }, [applyView])

  const buildCurrentViewConfig = React.useCallback(
    () =>
      buildInvoiceViewConfig({
        filters: {
          invoiceTab,
          search: appliedSearch,
          broker: appliedBroker,
          companies,
          billingCategory,
          dateFrom,
          dateTo,
          filterYear,
        },
        sorting,
        columnVisibility,
        groupOrder,
      }),
    [
      invoiceTab,
      appliedSearch,
      appliedBroker,
      companies,
      billingCategory,
      dateFrom,
      dateTo,
      filterYear,
      sorting,
      columnVisibility,
      groupOrder,
    ]
  )

  /** 保存成功后本地并入列表；设为默认时同步取消其他视图的默认标记 */
  const upsertView = React.useCallback((view: ApiTableView) => {
    setViews((prev) => {
      const exists = prev.some((v) => String(v.id) === String(view.id))
      const next = exists
        ? prev.map((v) => (String(v.id) === String(view.id) ? view : v))
        : [...prev, view]
      return view.is_default ? next.map((v) => (String(v.id) === String(view.id) ? v : { ...v, is_default: false })) : next
    })
  }, [])

  const saveView = React.useCallback(
    async (name: string, isDefault: boolean) => {
      try {
        const view = await fetchJson<ApiTableView>("/api/table-views", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            table_key: INVOICE_TABLE_KEY,
            name,
            config: buildCurrentViewConfig(),
            is_default: isDefault,
          }),
        })
        upsertView(view)
        setActiveViewId(String(view.id))
        toast.success(`已保存视图「${name}」`)
      } catch (error) {
        toast.error(getErrorMessage(error, "保存视图失败"))
        throw error // 交回菜单组件：保存失败时弹窗保持打开
      }
    },
    [buildCurrentViewConfig, upsertView]
  )

  const updateActiveView = React.useCallback(async () => {
    if (!activeViewId) return
    try {
      const view = await fetchJson<ApiTableView>(`/api/table-views/${activeViewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: buildCurrentViewConfig() }),
      })
      upsertView(view)
      toast.success("已更新当前视图")
    } catch (error) {
      toast.error(getErrorMessage(error, "更新视图失败"))
    }
  }, [activeViewId, buildCurrentViewConfig, upsertView])

  const renameView = React.useCallback(
    async (view: TableViewItem, name: string) => {
      try {
        const updated = await fetchJson<ApiTableView>(`/api/table-views/${view.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        })
        upsertView(updated)
      } catch (error) {
        toast.error(getErrorMessage(error, "重命名视图失败"))
        throw error
      }
    },
    [upsertView]
  )

  const setViewDefault = React.useCallback(
    async (view: TableViewItem, isDefault: boolean) => {
      try {
        const updated = await fetchJson<ApiTableView>(`/api/table-views/${view.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_default: isDefault }),
        })
        upsertView(updated)
        toast.success(
          isDefault ? `已将「${view.name}」设为默认视图` : `已取消「${view.name}」的默认`
        )
      } catch (error) {
        toast.error(getErrorMessage(error, "设置默认视图失败"))
      }
    },
    [upsertView]
  )

  const deleteView = React.useCallback(
    (view: TableViewItem) => {
      if (!window.confirm(`确定删除视图「${view.name}」？`)) return
      ;(async () => {
        try {
          await fetchJson(`/api/table-views/${view.id}`, { method: "DELETE" })
          setViews((prev) => prev.filter((v) => String(v.id) !== view.id))
          if (activeViewId === view.id) setActiveViewId(null)
          toast.success("已删除视图")
        } catch (error) {
          toast.error(getErrorMessage(error, "删除视图失败"))
        }
      })()
    },
    [activeViewId]
  )

  const handleApplyView = React.useCallback(
    (view: TableViewItem) => {
      const full = views.find((v) => String(v.id) === view.id)
      if (!full) return
      const config = parseInvoiceViewConfig(full.config)
      if (!config) {
        toast.error("视图数据已损坏，无法应用")
        return
      }
      applyView(config, view.id)
      toast.success(`已应用视图「${view.name}」`)
    },
    [views, applyView]
  )

  // —— 行操作 ——
  const handleRowDelete = React.useCallback(
    async (row: AccountingInvoiceRow) => {
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

  const openSingleSend = React.useCallback(
    (row: AccountingInvoiceRow) => {
      if (row.invoice_date) {
        toast.error(`账单「${row.invoice_number}」已于 ${fmtDate(row.invoice_date)} 发送`)
        return
      }
      openSendDialog({ ids: [row.id], label: row.invoice_number, isBatch: false })
    },
    [openSendDialog]
  )

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

  const openEdit = React.useCallback(async (row: AccountingInvoiceRow) => {
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

  // —— Excel 批量导入（按账单编号 upsert） ——
  const [importOpen, setImportOpen] = React.useState(false)
  const [importFile, setImportFile] = React.useState<File | null>(null)
  const [importing, setImporting] = React.useState(false)
  const [importRowErrors, setImportRowErrors] = React.useState<ImportRowError[] | null>(null)
  const [importIgnoredColumns, setImportIgnoredColumns] = React.useState<string[] | null>(null)

  const openImportDialog = React.useCallback(() => {
    setImportFile(null)
    setImportRowErrors(null)
    setImportIgnoredColumns(null)
    setImportOpen(true)
  }, [])

  // 换文件即清除上一次的校验错误（错误属于上一个文件）
  const handleImportFileChange = React.useCallback((file: File | null) => {
    setImportFile(file)
    setImportRowErrors(null)
    setImportIgnoredColumns(null)
  }, [])

  const handleDownloadImportTemplate = React.useCallback(() => {
    void downloadExport(
      "/api/finance/accounting-invoices/import-template",
      "账单导入模板.xlsx",
      "导入模板已下载"
    )
  }, [])

  const handleImportConfirm = React.useCallback(async () => {
    if (!importFile || importing) return
    setImporting(true)
    try {
      // 裸 fetch（不走 fetchJson）：错误响应需读取 details.rowErrors 展示行级明细
      const form = new FormData()
      form.set("file", importFile)
      const res = await fetch("/api/finance/accounting-invoices/import", {
        method: "POST",
        body: form,
      })
      // 平台/代理错误（413、502 等）可能返回非 JSON，解析失败按无明细处理
      const payload = (await res.json().catch(() => null)) as
        | { success: true; data: ImportSummary }
        | {
            success: false
            error: string
            details?: { rowErrors?: ImportRowError[]; ignoredColumns?: string[] }
          }
        | null
      if (!res.ok || !payload || !payload.success) {
        if (payload?.success === false && payload.details?.rowErrors?.length) {
          setImportRowErrors(payload.details.rowErrors)
          setImportIgnoredColumns(payload.details.ignoredColumns ?? null)
        }
        throw new Error(
          payload?.success === false && payload.error ? payload.error : "导入失败，请重试"
        )
      }
      const { total, created, updated } = payload.data
      toast.success(`导入完成：共 ${total} 行，新增 ${created} 条，更新 ${updated} 条`)
      setImportOpen(false)
      setImportFile(null)
      setImportRowErrors(null)
      setImportIgnoredColumns(null)
      refresh()
    } catch (error) {
      toast.error(getErrorMessage(error, "导入失败，请重试"))
    } finally {
      setImporting(false)
    }
  }, [importFile, importing, refresh])

  const handleRowPrint = React.useCallback(
    (row: AccountingInvoiceRow) => {
      const hasTemplate =
        companyOptions.find((c) => c.code === row.company)?.has_active_template ?? false
      if (!row.company || !hasTemplate) {
        toast.error(`公司「${row.company || "未知"}」暂无 PDF 模版`)
        return
      }
      openPdf(`/api/finance/accounting-invoices/${row.id}/pdf`)
    },
    [companyOptions]
  )

  const renderRowActions = React.useCallback(
    (r: AccountingInvoiceRow) => (
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
    const params = buildParams({ page, pageSize, sorting })
    params.delete("page")
    params.delete("pageSize")
    await downloadExport(
      `/api/finance/accounting-invoices/export?${params.toString()}`,
      `陆运账单_筛选_${new Date().toISOString().slice(0, 10)}.xlsx`,
      `成功导出 ${total} 条数据`
    )
  }, [buildParams, page, pageSize, sorting, total])

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
  }, [setPage])

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
  }, [initialYear, setPage])

  const applySearch = React.useCallback(() => {
    setAppliedSearch(searchInput.trim())
    setAppliedBroker(brokerInput.trim())
    setPage(1)
  }, [searchInput, brokerInput, setPage])

  // —— 工具栏交互（吸顶工具栏组件的回调） ——
  const handleInvoiceTabChange = React.useCallback((tab: InvoiceTab) => {
    setInvoiceTab(tab)
    setSelected(new Map())
    setPage(1)
  }, [setPage])

  const handleBillingCategoryChange = React.useCallback((value: string) => {
    setBillingCategory(value)
    setPage(1)
  }, [setPage])

  const handleDateFromChange = React.useCallback((value: string) => {
    setDateFrom(value)
    if (value) setFilterYear(Number(value.slice(0, 4)))
    setPage(1)
  }, [setPage])

  const handleDateToChange = React.useCallback((value: string) => {
    setDateTo(value)
    setPage(1)
  }, [setPage])

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
  }, [setPage])

  // —— 列定义与表格实例 ——
  const columns = useInvoiceColumns({
    allSelected,
    toggleAll,
    isSelected,
    toggleRow,
    sorting,
    toggleSort,
    renderRowActions,
  })

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
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 72 },
  })

  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  // 吸顶工具栏高度（用于计算表格滚动容器 max-height）
  const [toolbarHeight, setToolbarHeight] = React.useState(0)

  // 工具栏整栏折叠（localStorage 持久化）+ 应用内全屏
  const {
    collapsed: toolbarCollapsed,
    toggleCollapsed: toggleToolbarCollapsed,
    fullscreen,
    toggleFullscreen,
  } = useToolbarWorkspace("accounting-invoices.toolbar-collapsed.v1")

  // 折叠细条角标：生效中的筛选数量（unsent Tab 下日期仍随请求发送，如实计数）
  const activeFilterCount = React.useMemo(
    () =>
      [
        companies.length > 0,
        billingCategory !== "",
        dateFrom !== "" || dateTo !== "",
        appliedBroker !== "",
        appliedSearch !== "",
      ].filter(Boolean).length,
    [companies, billingCategory, dateFrom, dateTo, appliedBroker, appliedSearch]
  )

  // 经验调校：常态顶栏 64px + 底部预留 80（沿旧值）；全屏时容器 p-3 sm:p-4 竖向
  // 内边距 32（≥sm 为 16×2）+ 底部预留 90（分页条 58 + 上下两个 gap 16×2）
  const shellOffset = fullscreen ? 32 : 64
  const bottomAllowance = fullscreen ? 90 : 80
  const tableMaxHeight =
    toolbarHeight > 0
      ? `calc(100dvh - ${Math.round(toolbarHeight) + shellOffset + bottomAllowance}px)`
      : undefined

  // 卡片视图的差额/扣钱字段跟随有效列显隐
  const showDifferenceColumn = columnVisibility.difference !== false
  const showDeductionColumn = columnVisibility.deduction !== false

  return (
    <Workspace fullscreen={fullscreen}>
      {/* 吸顶工具栏：标题/计数 + 状态 Tab + 操作按钮 + 视图/列设置 + 筛选/搜索区；支持整栏折叠与应用内全屏 */}
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
        totalCount={total}
        selectedCount={selected.size}
        actionsSlot={
          <>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={openCreate}
            >
              <Plus className="mr-2 h-4 w-4" />
              新建账单
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={openImportDialog}
            >
              <FileUp className="mr-2 h-4 w-4" />
              导入账单
            </Button>
            <AccountingInvoicesBatchPdf selectedRows={selectedRows} />
            {invoiceTab === "negative" && (
              <Button variant="outline" size="sm"
                className="border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                disabled={selected.size === 0 || loading} onClick={openNegativeDateDialog}>
                <Pencil className="mr-2 h-4 w-4" />
                批量修改 Invoice 日期
              </Button>
            )}
            {(invoiceTab === "unmatched_paid" || invoiceTab === "with_deduction") && (
              <Button variant="outline" size="sm"
                className="border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
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
                  className="border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={openBatchSend}
                >
                  <Send className="mr-2 h-4 w-4" />
                  批量发账单
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
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
                  className="border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
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
          </>
        }
        collapsed={toolbarCollapsed}
        onToggleCollapsed={toggleToolbarCollapsed}
        activeFilterCount={activeFilterCount}
        fullscreen={fullscreen}
        onToggleFullscreen={toggleFullscreen}
        rightSlot={
          <>
            <TableViewMenu
              views={viewItems}
              activeViewId={activeViewId}
              buttonClassName="border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
              onApply={handleApplyView}
              onSaveAs={saveView}
              onUpdateActive={updateActiveView}
              onRename={renameView}
              onSetDefault={setViewDefault}
              onDelete={deleteView}
            />
            <ColumnSettingsMenu
              groups={INVOICE_COLUMN_SETTINGS_GROUPS}
              columnVisibility={columnVisibility}
              onToggleColumn={handleToggleColumn}
              onResetColumns={() => setColumnOverrides({})}
              buttonClassName="border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
            />
          </>
        }
      />

      {/* 宽屏表格；低于 2xl 分辨率切换为卡片视图。表格内部滚动，两行表头吸顶 */}
      <DataTable
        table={table}
        loading={loading}
        maxHeight={tableMaxHeight}
        className="hidden 2xl:block"
        emptyText="暂无账单数据"
        loadingText="正在加载..."
        groupOrder={groupOrder}
        onGroupOrderChange={handleGroupOrderChange}
      />

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
                    <span className="rounded-full border border-amber-300/60 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-primary">
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
                {showDifferenceColumn && (
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
                {showDeductionColumn && (
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

      {/* 分页：吸底浮动——卡片视图/全屏下滚动长列表时也能随时翻页 */}
      <StickyFooter>
        <TablePagination
          total={total}
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          loading={loading}
          onPageChange={setPage}
          onPageSizeChange={changePageSize}
        />
      </StickyFooter>

      {/* 新建/编辑弹窗：复用模版编辑表单 */}
      <InvoiceFormDialog
        open={dialogOpen}
        detailLoading={detailLoading}
        editingRecord={editingRecord}
        onClose={closeDialog}
        onSaved={refresh}
      />

      <ImportInvoicesDialog
        open={importOpen}
        importing={importing}
        file={importFile}
        rowErrors={importRowErrors}
        ignoredColumns={importIgnoredColumns}
        onFileChange={handleImportFileChange}
        onDownloadTemplate={handleDownloadImportTemplate}
        onConfirm={() => void handleImportConfirm()}
        onClose={() => setImportOpen(false)}
      />

      <SendInvoiceDialog
        target={sendTarget}
        sending={sending}
        sendDate={sendDate}
        onSendDateChange={setSendDate}
        onConfirm={() => void handleSend()}
        onClose={() => setSendTarget(null)}
      />

      <NegativeDateDialog
        ids={dateEditIds}
        saving={savingNegativeDate}
        date={negativeDate}
        onDateChange={setNegativeDate}
        onConfirm={() => void saveNegativeDate()}
        onClose={() => setDateEditIds(null)}
      />

      <DeductionDialog
        ids={deductionEditIds}
        saving={savingDeduction}
        text={deductionText}
        initText={deductionInit}
        onTextChange={setDeductionText}
        onConfirm={() => void saveDeduction()}
        onClose={() => setDeductionEditIds(null)}
      />
    </Workspace>
  )
}

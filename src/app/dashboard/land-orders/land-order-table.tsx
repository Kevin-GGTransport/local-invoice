"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { getCoreRowModel, useReactTable, type VisibilityState } from "@tanstack/react-table"
import { Download, Loader2, Plus, RotateCcw, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { fetchJson, fetchResponse, getApiError, getRequestErrorMessage } from "@/lib/api/client"
import { useServerTable } from "@/components/data-table/use-server-table"
import { DataTable } from "@/components/data-table/data-table"
import { TablePagination } from "@/components/data-table/table-pagination"
import { TableViewMenu, type TableViewItem } from "@/components/data-table/table-view-menu"
import { ColumnSettingsMenu } from "@/components/data-table/column-settings-menu"
import { useToolbarWorkspace } from "@/hooks/use-toolbar-workspace"
import { Workspace, ToolbarShell, StickyFooter } from "@/components/table-workspace"
import {
  DEFAULT_LAND_ORDER_GROUP_ORDER,
  LAND_ORDER_COLUMN_SETTINGS_GROUPS,
  LAND_ORDER_GROUP_LEAF_COLUMN_IDS,
  LAND_ORDER_TABLE_KEY,
  buildLandOrderViewConfig,
  parseLandOrderViewConfig,
  type LandOrderViewConfig,
} from "./land-order-view"
import {
  useLandOrderColumns,
  type LandOrderRow,
  type SelectedLandOrderRow,
} from "./land-order-columns"

type ApiTableView = {
  id: string
  table_key: string
  name: string
  config: unknown
  is_default: boolean
}

const GROUP_ORDER_STORAGE_KEY = "land-orders.group-column-order.v1"

function loadGroupOrder(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_LAND_ORDER_GROUP_ORDER]
  try {
    const raw = window.localStorage.getItem(GROUP_ORDER_STORAGE_KEY)
    if (!raw) return [...DEFAULT_LAND_ORDER_GROUP_ORDER]
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...DEFAULT_LAND_ORDER_GROUP_ORDER]
    const saved = parsed.filter(
      (id): id is string =>
        typeof id === "string" &&
        (DEFAULT_LAND_ORDER_GROUP_ORDER as readonly string[]).includes(id)
    )
    const missing = DEFAULT_LAND_ORDER_GROUP_ORDER.filter((id) => !saved.includes(id))
    return [...new Set(saved), ...missing]
  } catch {
    return [...DEFAULT_LAND_ORDER_GROUP_ORDER]
  }
}

function persistGroupOrder(order: string[]) {
  try {
    window.localStorage.setItem(GROUP_ORDER_STORAGE_KEY, JSON.stringify(order))
  } catch {
    // Local storage can be unavailable; the active table remains usable.
  }
}

async function downloadExport(url: string, filename: string) {
  const loadingToast = toast.loading("正在生成陆运订单清单...")
  try {
    const response = await fetchResponse(url)
    if (!response.ok) throw await getApiError(response, `导出失败 (${response.status})`)
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = objectUrl
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(objectUrl)
    toast.dismiss(loadingToast)
    toast.success("陆运订单清单已导出")
  } catch (error) {
    toast.dismiss(loadingToast)
    toast.error(getRequestErrorMessage(error, "导出失败，请重试"))
  }
}

export function LandOrderTable() {
  const router = useRouter()
  const [searchInput, setSearchInput] = React.useState("")
  const [appliedSearch, setAppliedSearch] = React.useState("")
  const [operatingCompanyInput, setOperatingCompanyInput] = React.useState("")
  const [appliedOperatingCompany, setAppliedOperatingCompany] = React.useState("")
  const [status, setStatus] = React.useState("all")
  const [dateFrom, setDateFrom] = React.useState("")
  const [dateTo, setDateTo] = React.useState("")
  const [columnOverrides, setColumnOverrides] = React.useState<VisibilityState>({})
  const [groupOrder, setGroupOrder] = React.useState<string[]>([...DEFAULT_LAND_ORDER_GROUP_ORDER])
  const [views, setViews] = React.useState<ApiTableView[]>([])
  const [activeViewId, setActiveViewId] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<Map<string, SelectedLandOrderRow>>(new Map())
  const [deleting, setDeleting] = React.useState(false)
  const [tableMaxHeight, setTableMaxHeight] = React.useState("calc(100dvh - 330px)")
  const { collapsed, toggleCollapsed, fullscreen, toggleFullscreen } = useToolbarWorkspace(
    "land-orders.toolbar-collapsed.v1"
  )

  React.useEffect(() => {
    setGroupOrder(loadGroupOrder())
  }, [])

  const buildParams = React.useCallback(
    ({
      page,
      pageSize,
      sorting,
    }: {
      page: number
      pageSize: number
      sorting: Array<{ id: string; desc: boolean }>
    }) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      })
      const sort = sorting[0]
      if (sort) {
        params.set("sort", sort.id)
        params.set("order", sort.desc ? "desc" : "asc")
      } else {
        params.set("sort", "pickup_date")
        params.set("order", "asc")
      }
      if (appliedSearch) params.set("q", appliedSearch)
      if (appliedOperatingCompany) {
        params.set("operatingCompany", appliedOperatingCompany)
      }
      if (status !== "all") params.set("status", status)
      if (dateFrom) params.set("dateFrom", dateFrom)
      if (dateTo) params.set("dateTo", dateTo)
      return params
    },
    [appliedOperatingCompany, appliedSearch, dateFrom, dateTo, status]
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
  } = useServerTable<LandOrderRow>({
    endpoint: "/api/land-orders",
    buildParams,
    initialSorting: [{ id: "pickup_date", desc: false }],
    initialPageSize: 100,
    onError: (message) => toast.error(`加载陆运订单失败：${message}`),
  })

  const columnVisibility = React.useMemo(() => ({ ...columnOverrides }), [columnOverrides])
  const columnOrder = React.useMemo(
    () => groupOrder.flatMap((groupId) => LAND_ORDER_GROUP_LEAF_COLUMN_IDS[groupId] ?? []),
    [groupOrder]
  )

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id))
  const toggleAll = React.useCallback(() => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (rows.every((row) => next.has(row.id))) rows.forEach((row) => next.delete(row.id))
      else {
        for (const row of rows) {
          next.set(row.id, {
            id: row.id,
            identifier: row.identifier,
            load_number: row.load_number,
          })
        }
      }
      return next
    })
  }, [rows])

  const toggleRow = React.useCallback((row: LandOrderRow) => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(row.id)) next.delete(row.id)
      else {
        next.set(row.id, {
          id: row.id,
          identifier: row.identifier,
          load_number: row.load_number,
        })
      }
      return next
    })
  }, [])
  const isSelected = React.useCallback((id: string) => selected.has(id), [selected])

  const editRow = React.useCallback(
    (row: LandOrderRow) => router.push(`/dashboard/land-orders/${row.id}/edit`),
    [router]
  )

  const deleteRow = React.useCallback(
    async (row: LandOrderRow) => {
      if (!window.confirm(`确定删除订单 ${row.load_number || row.identifier || row.id} 吗？`)) return
      try {
        await fetchJson(`/api/land-orders/${row.id}`, { method: "DELETE" })
        toast.success("订单已删除")
        setSelected((prev) => {
          const next = new Map(prev)
          next.delete(row.id)
          return next
        })
        refresh()
      } catch (error) {
        toast.error(getRequestErrorMessage(error, "删除订单失败"))
      }
    },
    [refresh]
  )

  const columns = useLandOrderColumns({
    allSelected,
    toggleAll,
    isSelected,
    toggleRow,
    sorting,
    toggleSort,
    onDelete: deleteRow,
    onEdit: editRow,
    onDispatch: (row: LandOrderRow) =>
      router.push(`/dashboard/land-dispatches/new?orderId=${row.id}`),
  })

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnVisibility, columnOrder },
    getCoreRowModel: getCoreRowModel(),
  })

  const currentConfig = React.useCallback(
    (): LandOrderViewConfig => ({
      filters: {
        search: appliedSearch,
        operatingCompany: appliedOperatingCompany,
        status: status === "all" ? "" : status,
        dateFrom,
        dateTo,
      },
      sorting,
      columnVisibility,
      groupOrder,
    }),
    [
      appliedOperatingCompany,
      appliedSearch,
      dateFrom,
      dateTo,
      groupOrder,
      sorting,
      status,
      columnVisibility,
    ]
  )

  const applyView = React.useCallback(
    (config: LandOrderViewConfig, viewId: string | null) => {
      setSearchInput(config.filters.search)
      setAppliedSearch(config.filters.search)
      setOperatingCompanyInput(config.filters.operatingCompany)
      setAppliedOperatingCompany(config.filters.operatingCompany)
      setStatus(config.filters.status || "all")
      setDateFrom(config.filters.dateFrom)
      setDateTo(config.filters.dateTo)
      setSorting(
        config.sorting.length ? config.sorting : [{ id: "pickup_date", desc: false }]
      )
      setColumnOverrides(config.columnVisibility)
      setGroupOrder(config.groupOrder)
      persistGroupOrder(config.groupOrder)
      setPage(1)
      setActiveViewId(viewId)
      setSelected(new Map())
    },
    [setPage, setSorting]
  )

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await fetchJson<{ views: ApiTableView[] }>(
          `/api/table-views?table=${LAND_ORDER_TABLE_KEY}`
        )
        if (cancelled) return
        setViews(data.views)
        const defaultView = data.views.find((view) => view.is_default)
        if (defaultView) {
          const config = parseLandOrderViewConfig(defaultView.config)
          if (config) applyView(config, String(defaultView.id))
        }
      } catch {
        // Saved views are optional and should not block the operational list.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [applyView])

  const viewItems: TableViewItem[] = React.useMemo(
    () =>
      views.map((view) => ({
        id: String(view.id),
        name: view.name,
        isDefault: view.is_default,
      })),
    [views]
  )

  const saveView = React.useCallback(
    async (name: string, isDefault: boolean) => {
      const created = await fetchJson<ApiTableView>("/api/table-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_key: LAND_ORDER_TABLE_KEY,
          name,
          config: buildLandOrderViewConfig(currentConfig()),
          is_default: isDefault,
        }),
      })
      setViews((prev) => [...prev, created])
      setActiveViewId(String(created.id))
      toast.success("视图已保存")
    },
    [currentConfig]
  )

  const updateActiveView = React.useCallback(async () => {
    if (!activeViewId) return
    const config = buildLandOrderViewConfig(currentConfig())
    await fetchJson(`/api/table-views/${activeViewId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    })
    setViews((prev) =>
      prev.map((view) => (String(view.id) === activeViewId ? { ...view, config } : view))
    )
    toast.success("视图已更新")
  }, [activeViewId, currentConfig])

  const renameView = React.useCallback(async (view: TableViewItem, name: string) => {
    await fetchJson(`/api/table-views/${view.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    setViews((prev) =>
      prev.map((item) => (String(item.id) === view.id ? { ...item, name } : item))
    )
    toast.success("视图已重命名")
  }, [])

  const setViewDefault = React.useCallback(async (view: TableViewItem, isDefault: boolean) => {
    await fetchJson(`/api/table-views/${view.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_default: isDefault }),
    })
    setViews((prev) =>
      prev.map((item) =>
        String(item.id) === view.id
          ? { ...item, is_default: isDefault }
          : { ...item, is_default: isDefault ? false : item.is_default }
      )
    )
    toast.success(isDefault ? "已设为默认视图" : "已取消默认视图")
  }, [])

  const deleteView = React.useCallback(
    async (view: TableViewItem) => {
      await fetchJson(`/api/table-views/${view.id}`, { method: "DELETE" })
      setViews((prev) => prev.filter((item) => String(item.id) !== view.id))
      if (activeViewId === view.id) setActiveViewId(null)
      toast.success("视图已删除")
    },
    [activeViewId]
  )

  const handleApplyView = React.useCallback(
    (view: TableViewItem) => {
      const full = views.find((item) => String(item.id) === view.id)
      if (!full) return
      const config = parseLandOrderViewConfig(full.config)
      if (config) applyView(config, view.id)
      else toast.error("视图配置无效，无法应用")
    },
    [applyView, views]
  )

  const handleToggleColumn = React.useCallback((id: string, visible: boolean) => {
    setColumnOverrides((prev) => ({ ...prev, [id]: visible }))
  }, [])

  const handleGroupOrderChange = React.useCallback((next: string[]) => {
    setGroupOrder(next)
    persistGroupOrder(next)
  }, [])

  const resetFilters = React.useCallback(() => {
    setSearchInput("")
    setAppliedSearch("")
    setOperatingCompanyInput("")
    setAppliedOperatingCompany("")
    setStatus("all")
    setDateFrom("")
    setDateTo("")
    setPage(1)
  }, [setPage])

  const exportUrl = React.useCallback(() => {
    const params = buildParams({ page: 1, pageSize: 10_000, sorting })
    if (selected.size) params.set("ids", [...selected.keys()].join(","))
    return `/api/land-orders/export?${params.toString()}`
  }, [buildParams, selected, sorting])

  const batchDelete = React.useCallback(async () => {
    if (selected.size === 0) return
    if (!window.confirm(`确定删除选中的 ${selected.size} 条订单吗？`)) return
    setDeleting(true)
    try {
      const result = await fetchJson<{ count: number }>(
        `/api/land-orders?ids=${encodeURIComponent([...selected.keys()].join(","))}`,
        { method: "DELETE" }
      )
      toast.success(`已删除 ${result.count} 条订单`)
      setSelected(new Map())
      refresh()
    } catch (error) {
      toast.error(getRequestErrorMessage(error, "批量删除失败"))
    } finally {
      setDeleting(false)
    }
  }, [refresh, selected])

  const activeFilterCount = [
    appliedSearch,
    appliedOperatingCompany,
    status !== "all" ? status : "",
    dateFrom,
    dateTo,
  ].filter(Boolean).length

  return (
    <Workspace fullscreen={fullscreen}>
      <ToolbarShell
        title="陆运订单"
        fullscreen={fullscreen}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        onToggleFullscreen={toggleFullscreen}
        onHeightChange={(height) => setTableMaxHeight(`calc(100dvh - ${height + 92}px)`)}
        activeFilterCount={activeFilterCount}
        collapsedMeta={<span className="text-xs text-muted-foreground">共 {total} 条</span>}
        headerLeft={
          <div className="min-w-0 py-2">
            <h1 className="text-sm font-semibold tracking-tight">陆运订单</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">共 {total} 条订单</p>
          </div>
        }
        actions={
          <>
            <Button size="sm" onClick={() => router.push("/dashboard/land-orders/new")}>
              <Plus className="mr-2 h-4 w-4" /> 新建订单
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void downloadExport(
                  exportUrl(),
                  `陆运订单清单_${new Date().toISOString().slice(0, 10)}.xlsx`
                )
              }
            >
              <Download className="mr-2 h-4 w-4" /> 导出{selected.size ? ` ${selected.size} 条` : ""}
            </Button>
            {selected.size > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                disabled={deleting}
                onClick={() => void batchDelete()}
              >
                {deleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                批量删除
              </Button>
            )}
            <TableViewMenu
              views={viewItems}
              activeViewId={activeViewId}
              onApply={handleApplyView}
              onSaveAs={saveView}
              onUpdateActive={updateActiveView}
              onRename={renameView}
              onSetDefault={setViewDefault}
              onDelete={deleteView}
            />
            <ColumnSettingsMenu
              groups={LAND_ORDER_COLUMN_SETTINGS_GROUPS}
              columnVisibility={columnVisibility}
              onToggleColumn={handleToggleColumn}
              onResetColumns={() => setColumnOverrides({})}
            />
          </>
        }
      >
        <div className="grid gap-2 px-3 py-3 sm:px-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex h-10 items-center gap-1 rounded-lg border border-input bg-background p-1 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
            <Search className="ml-1.5 size-4 shrink-0 text-muted-foreground" />
            <Input
              aria-label="搜索陆运订单"
              className="h-8 min-w-0 flex-1 rounded-none border-0 px-1 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0"
              placeholder="标识 / Load# / Broker / 司机 / 站点 / PU#"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setAppliedSearch(searchInput)
                  setPage(1)
                }
              }}
            />
            <Button
              size="sm"
              className="h-8"
              onClick={() => {
                setAppliedSearch(searchInput)
                setPage(1)
              }}
            >
              搜索
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Input
              aria-label="运营公司"
              placeholder="运营公司"
              className="h-10"
              value={operatingCompanyInput}
              onChange={(event) => setOperatingCompanyInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setAppliedOperatingCompany(operatingCompanyInput)
                  setPage(1)
                }
              }}
              onBlur={() => {
                setAppliedOperatingCompany(operatingCompanyInput)
                setPage(1)
              }}
            />
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value)
                setPage(1)
              }}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="draft">草稿</SelectItem>
                <SelectItem value="confirmed">已确认</SelectItem>
                <SelectItem value="completed">已完成</SelectItem>
                <SelectItem value="cancelled">已取消</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex h-10 items-center gap-1 rounded-lg border border-input bg-background px-2">
              <Input
                aria-label="开始日期"
                type="date"
                className="h-8 border-0 px-1 shadow-none focus-visible:ring-0"
                value={dateFrom}
                onChange={(event) => {
                  setDateFrom(event.target.value)
                  setPage(1)
                }}
              />
              <span className="text-xs text-muted-foreground">至</span>
              <Input
                aria-label="结束日期"
                type="date"
                className="h-8 border-0 px-1 shadow-none focus-visible:ring-0"
                value={dateTo}
                onChange={(event) => {
                  setDateTo(event.target.value)
                  setPage(1)
                }}
              />
            </div>
          </div>
          <div className="flex justify-end 2xl:col-span-2">
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw className="mr-2 h-4 w-4" /> 清空筛选
            </Button>
          </div>
        </div>
      </ToolbarShell>

      <DataTable
        table={table}
        loading={loading}
        maxHeight={tableMaxHeight}
        emptyText="暂无陆运订单"
        loadingText="正在加载陆运订单..."
        groupOrder={groupOrder}
        onGroupOrderChange={handleGroupOrderChange}
      />

      <TablePagination
        total={total}
        page={page}
        pageCount={Math.max(1, Math.ceil(total / pageSize))}
        pageSize={pageSize}
        loading={loading}
        onPageChange={setPage}
        onPageSizeChange={changePageSize}
      />

      <StickyFooter>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-2 text-xs text-muted-foreground">
          <span>已选择 {selected.size} 条 · 可导出勾选订单或当前筛选结果</span>
          <label className="flex items-center gap-2">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="全选本页" />
            全选本页
          </label>
        </div>
      </StickyFooter>
    </Workspace>
  )
}

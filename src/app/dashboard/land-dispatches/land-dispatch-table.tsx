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
  useLandDispatchColumns,
  type LandDispatchRow,
  type SelectedLandDispatchRow,
} from "./land-dispatch-columns"
import {
  DEFAULT_LAND_DISPATCH_GROUP_ORDER,
  LAND_DISPATCH_COLUMN_SETTINGS_GROUPS,
  LAND_DISPATCH_GROUP_LEAF_COLUMN_IDS,
  LAND_DISPATCH_TABLE_KEY,
  buildLandDispatchViewConfig,
  parseLandDispatchViewConfig,
  type LandDispatchViewConfig,
} from "./land-dispatch-view"

type ApiTableView = {
  id: string
  name: string
  config: unknown
  is_default: boolean
}

const GROUP_ORDER_STORAGE_KEY = "land-dispatches.group-column-order.v1"

function persistGroupOrder(order: string[]) {
  try {
    window.localStorage.setItem(GROUP_ORDER_STORAGE_KEY, JSON.stringify(order))
  } catch {
    // ignore storage restrictions
  }
}

function loadGroupOrder(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_LAND_DISPATCH_GROUP_ORDER]
  try {
    const raw = window.localStorage.getItem(GROUP_ORDER_STORAGE_KEY)
    if (!raw) return [...DEFAULT_LAND_DISPATCH_GROUP_ORDER]
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...DEFAULT_LAND_DISPATCH_GROUP_ORDER]
    const valid = parsed.filter(
      (id): id is string =>
        typeof id === "string" &&
        (DEFAULT_LAND_DISPATCH_GROUP_ORDER as readonly string[]).includes(id)
    )
    const missing = DEFAULT_LAND_DISPATCH_GROUP_ORDER.filter((id) => !valid.includes(id))
    return [...new Set(valid), ...missing]
  } catch {
    return [...DEFAULT_LAND_DISPATCH_GROUP_ORDER]
  }
}

async function downloadExport(url: string, filename: string) {
  const loadingToast = toast.loading("正在生成排车表...")
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
    toast.success("排车表已导出")
  } catch (error) {
    toast.dismiss(loadingToast)
    toast.error(getRequestErrorMessage(error, "导出失败，请重试"))
  }
}

export function LandDispatchTable() {
  const router = useRouter()
  const [searchInput, setSearchInput] = React.useState("")
  const [appliedSearch, setAppliedSearch] = React.useState("")
  const [truckInput, setTruckInput] = React.useState("")
  const [appliedTruck, setAppliedTruck] = React.useState("")
  const [driverInput, setDriverInput] = React.useState("")
  const [appliedDriver, setAppliedDriver] = React.useState("")
  const [haulType, setHaulType] = React.useState("all")
  const [status, setStatus] = React.useState("all")
  const [todoDone, setTodoDone] = React.useState("all")
  const [dateFrom, setDateFrom] = React.useState("")
  const [dateTo, setDateTo] = React.useState("")
  const [columnOverrides, setColumnOverrides] = React.useState<VisibilityState>({})
  const [groupOrder, setGroupOrder] = React.useState<string[]>([...DEFAULT_LAND_DISPATCH_GROUP_ORDER])
  const [views, setViews] = React.useState<ApiTableView[]>([])
  const [activeViewId, setActiveViewId] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<Map<string, SelectedLandDispatchRow>>(new Map())
  const [deleting, setDeleting] = React.useState(false)
  const [tableMaxHeight, setTableMaxHeight] = React.useState("calc(100dvh - 330px)")
  const { collapsed, toggleCollapsed, fullscreen, toggleFullscreen } = useToolbarWorkspace(
    "land-dispatches.toolbar-collapsed.v1"
  )

  React.useEffect(() => setGroupOrder(loadGroupOrder()), [])

  const buildParams = React.useCallback(
    ({
      page,
      pageSize,
      sorting,
    }: { page: number; pageSize: number; sorting: Array<{ id: string; desc: boolean }> }) => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      const sort = sorting[0]
      params.set("sort", sort?.id ?? "dispatch_date")
      params.set("order", sort ? (sort.desc ? "desc" : "asc") : "asc")
      if (appliedSearch) params.set("q", appliedSearch)
      if (appliedTruck) params.set("truck", appliedTruck)
      if (appliedDriver) params.set("driver", appliedDriver)
      if (haulType !== "all") params.set("haulType", haulType)
      if (status !== "all") params.set("status", status)
      if (todoDone !== "all") params.set("todoDone", todoDone)
      if (dateFrom) params.set("dateFrom", dateFrom)
      if (dateTo) params.set("dateTo", dateTo)
      return params
    },
    [appliedDriver, appliedSearch, appliedTruck, dateFrom, dateTo, haulType, status, todoDone]
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
  } = useServerTable<LandDispatchRow>({
    endpoint: "/api/land-dispatches",
    buildParams,
    initialSorting: [{ id: "dispatch_date", desc: false }],
    initialPageSize: 100,
    onError: (message) => toast.error(`加载排车表失败：${message}`),
  })

  const columnVisibility = React.useMemo(() => ({ ...columnOverrides }), [columnOverrides])
  const columnOrder = React.useMemo(
    () => groupOrder.flatMap((groupId) => LAND_DISPATCH_GROUP_LEAF_COLUMN_IDS[groupId] ?? []),
    [groupOrder]
  )
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id))

  const toggleAll = React.useCallback(() => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (rows.every((row) => next.has(row.id))) rows.forEach((row) => next.delete(row.id))
      else rows.forEach((row) => next.set(row.id, { id: row.id, truck: row.truck, load_number: row.load_number }))
      return next
    })
  }, [rows])

  const toggleRow = React.useCallback((row: LandDispatchRow) => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(row.id)) next.delete(row.id)
      else next.set(row.id, { id: row.id, truck: row.truck, load_number: row.load_number })
      return next
    })
  }, [])
  const isSelected = React.useCallback((id: string) => selected.has(id), [selected])

  const toggleTodo = React.useCallback(
    async (row: LandDispatchRow, checked: boolean) => {
      try {
        await fetchJson(`/api/land-dispatches/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ todo_done: checked }),
        })
        toast.success(checked ? "Todo 已完成" : "Todo 未完成")
        refresh()
      } catch (error) {
        toast.error(getRequestErrorMessage(error, "更新 Todo 失败"))
      }
    },
    [refresh]
  )

  const columns = useLandDispatchColumns({
    allSelected,
    toggleAll,
    isSelected,
    toggleRow,
    toggleTodo,
    sorting,
    toggleSort,
    onEdit: (row) => router.push(`/dashboard/land-dispatches/${row.id}/edit`),
    onDelete: async (row) => {
      if (!window.confirm("确定删除这条排车记录吗？")) return
      try {
        await fetchJson(`/api/land-dispatches/${row.id}`, { method: "DELETE" })
        toast.success("排车记录已删除")
        refresh()
      } catch (error) {
        toast.error(getRequestErrorMessage(error, "删除排车记录失败"))
      }
    },
  })

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnVisibility, columnOrder },
    getCoreRowModel: getCoreRowModel(),
  })

  const currentConfig = React.useCallback(
    (): LandDispatchViewConfig => ({
      filters: {
        search: appliedSearch,
        truck: appliedTruck,
        driver: appliedDriver,
        haulType: haulType === "all" ? "" : haulType,
        status: status === "all" ? "" : status,
        todoDone: todoDone === "all" ? "" : todoDone,
        dateFrom,
        dateTo,
      },
      sorting,
      columnVisibility,
      groupOrder,
    }),
    [appliedDriver, appliedSearch, appliedTruck, columnVisibility, dateFrom, dateTo, groupOrder, haulType, sorting, status, todoDone]
  )

  const applyView = React.useCallback(
    (config: LandDispatchViewConfig, viewId: string | null) => {
      setSearchInput(config.filters.search)
      setAppliedSearch(config.filters.search)
      setTruckInput(config.filters.truck)
      setAppliedTruck(config.filters.truck)
      setDriverInput(config.filters.driver)
      setAppliedDriver(config.filters.driver)
      setHaulType(config.filters.haulType || "all")
      setStatus(config.filters.status || "all")
      setTodoDone(config.filters.todoDone || "all")
      setDateFrom(config.filters.dateFrom)
      setDateTo(config.filters.dateTo)
      setSorting(config.sorting.length ? config.sorting : [{ id: "dispatch_date", desc: false }])
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
          `/api/table-views?table=${LAND_DISPATCH_TABLE_KEY}`
        )
        if (cancelled) return
        setViews(data.views)
        const defaultView = data.views.find((view) => view.is_default)
        if (defaultView) {
          const config = parseLandDispatchViewConfig(defaultView.config)
          if (config) applyView(config, String(defaultView.id))
        }
      } catch {
        // optional saved views
      }
    })()
    return () => {
      cancelled = true
    }
  }, [applyView])

  const viewItems = React.useMemo(
    () => views.map((view) => ({ id: String(view.id), name: view.name, isDefault: view.is_default })),
    [views]
  )

  const saveView = React.useCallback(
    async (name: string, isDefault: boolean) => {
      const created = await fetchJson<ApiTableView>("/api/table-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_key: LAND_DISPATCH_TABLE_KEY,
          name,
          config: buildLandDispatchViewConfig(currentConfig()),
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
    const config = buildLandDispatchViewConfig(currentConfig())
    await fetchJson(`/api/table-views/${activeViewId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    })
    setViews((prev) => prev.map((view) => (String(view.id) === activeViewId ? { ...view, config } : view)))
    toast.success("视图已更新")
  }, [activeViewId, currentConfig])

  const renameView = React.useCallback(async (view: TableViewItem, name: string) => {
    await fetchJson(`/api/table-views/${view.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    setViews((prev) => prev.map((item) => (String(item.id) === view.id ? { ...item, name } : item)))
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
  }, [])

  const deleteView = React.useCallback(
    async (view: TableViewItem) => {
      await fetchJson(`/api/table-views/${view.id}`, { method: "DELETE" })
      setViews((prev) => prev.filter((item) => String(item.id) !== view.id))
      if (activeViewId === view.id) setActiveViewId(null)
    },
    [activeViewId]
  )

  const handleApplyView = React.useCallback(
    (view: TableViewItem) => {
      const full = views.find((item) => String(item.id) === view.id)
      if (!full) return
      const config = parseLandDispatchViewConfig(full.config)
      if (config) applyView(config, view.id)
      else toast.error("视图配置无效")
    },
    [applyView, views]
  )

  const exportUrl = React.useCallback(() => {
    const params = buildParams({ page: 1, pageSize: 10_000, sorting })
    if (selected.size) params.set("ids", [...selected.keys()].join(","))
    return `/api/land-dispatches/export?${params.toString()}`
  }, [buildParams, selected, sorting])

  const batchDelete = React.useCallback(async () => {
    if (!selected.size || !window.confirm(`确定删除 ${selected.size} 条排车记录吗？`)) return
    setDeleting(true)
    try {
      const result = await fetchJson<{ count: number }>(
        `/api/land-dispatches?ids=${encodeURIComponent([...selected.keys()].join(","))}`,
        { method: "DELETE" }
      )
      toast.success(`已删除 ${result.count} 条排车记录`)
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
    appliedTruck,
    appliedDriver,
    haulType !== "all" ? haulType : "",
    status !== "all" ? status : "",
    todoDone !== "all" ? todoDone : "",
    dateFrom,
    dateTo,
  ].filter(Boolean).length

  return (
    <Workspace fullscreen={fullscreen}>
      <ToolbarShell
        title="长途排车表"
        fullscreen={fullscreen}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        onToggleFullscreen={toggleFullscreen}
        onHeightChange={(height) => setTableMaxHeight(`calc(100dvh - ${height + 92}px)`)}
        activeFilterCount={activeFilterCount}
        collapsedMeta={<span className="text-xs text-muted-foreground">共 {total} 条</span>}
        headerLeft={
          <div className="py-2">
            <h1 className="text-sm font-semibold">长途排车表</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">调度日期、车辆、司机与订单关联</p>
          </div>
        }
        actions={
          <>
            <Button size="sm" onClick={() => router.push("/dashboard/land-dispatches/new")}>
              <Plus className="mr-2 h-4 w-4" /> 新增排车
            </Button>
            <Button variant="outline" size="sm" onClick={() => void downloadExport(exportUrl(), `长途排车表_${new Date().toISOString().slice(0, 10)}.xlsx`)}>
              <Download className="mr-2 h-4 w-4" /> 导出{selected.size ? ` ${selected.size} 条` : ""}
            </Button>
            {selected.size > 0 && (
              <Button variant="outline" size="sm" className="text-destructive" disabled={deleting} onClick={() => void batchDelete()}>
                {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} 删除
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
              groups={LAND_DISPATCH_COLUMN_SETTINGS_GROUPS}
              columnVisibility={columnVisibility}
              onToggleColumn={(id, visible) => setColumnOverrides((prev) => ({ ...prev, [id]: visible }))}
              onResetColumns={() => setColumnOverrides({})}
            />
          </>
        }
      >
        <div className="grid gap-2 px-3 py-3 sm:px-4 2xl:grid-cols-[minmax(0,1fr)_560px]">
          <div className="flex h-10 items-center gap-1 rounded-lg border bg-background p-1">
            <Search className="ml-1.5 size-4 text-muted-foreground" />
            <Input
              aria-label="搜索排车表"
              className="h-8 min-w-0 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
              placeholder="车辆 / 司机 / Load# / 站点"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setAppliedSearch(searchInput)
                  setPage(1)
                }
              }}
            />
            <Button size="sm" className="h-8" onClick={() => { setAppliedSearch(searchInput); setPage(1) }}>搜索</Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Input aria-label="车牌/标识" placeholder="车牌/标识" className="h-10" value={truckInput}
              onChange={(event) => setTruckInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { setAppliedTruck(truckInput); setPage(1) } }}
              onBlur={() => { setAppliedTruck(truckInput); setPage(1) }} />
            <Input aria-label="司机" placeholder="司机" className="h-10" value={driverInput}
              onChange={(event) => setDriverInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { setAppliedDriver(driverInput); setPage(1) } }}
              onBlur={() => { setAppliedDriver(driverInput); setPage(1) }} />
            <Select value={haulType} onValueChange={(value) => { setHaulType(value); setPage(1) }}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部运输</SelectItem>
                <SelectItem value="long_haul">长途</SelectItem>
                <SelectItem value="local">本地</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1) }}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="planned">已排车</SelectItem>
                <SelectItem value="dispatched">已出车</SelectItem>
                <SelectItem value="completed">已完成</SelectItem>
                <SelectItem value="cancelled">已取消</SelectItem>
              </SelectContent>
            </Select>
            <Select value={todoDone} onValueChange={(value) => { setTodoDone(value); setPage(1) }}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部 Todo</SelectItem>
                <SelectItem value="undone">未完成</SelectItem>
                <SelectItem value="done">已完成</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex h-10 items-center gap-1 rounded-lg border bg-background px-2">
              <Input aria-label="开始日期" type="date" className="h-8 border-0 px-1 shadow-none focus-visible:ring-0" value={dateFrom}
                onChange={(event) => { setDateFrom(event.target.value); setPage(1) }} />
              <span className="text-xs text-muted-foreground">至</span>
              <Input aria-label="结束日期" type="date" className="h-8 border-0 px-1 shadow-none focus-visible:ring-0" value={dateTo}
                onChange={(event) => { setDateTo(event.target.value); setPage(1) }} />
            </div>
            <Button variant="ghost" size="sm" onClick={() => {
              setSearchInput(""); setAppliedSearch(""); setTruckInput(""); setAppliedTruck("");
              setDriverInput(""); setAppliedDriver(""); setHaulType("all"); setStatus("all");
              setTodoDone("all"); setDateFrom(""); setDateTo(""); setPage(1)
            }}>
              <RotateCcw className="mr-2 h-4 w-4" /> 清空
            </Button>
          </div>
        </div>
      </ToolbarShell>

      <DataTable table={table} loading={loading} maxHeight={tableMaxHeight} emptyText="暂无排车记录"
        groupOrder={groupOrder} onGroupOrderChange={(next) => { setGroupOrder(next); persistGroupOrder(next) }} />
      <TablePagination total={total} page={page} pageCount={Math.max(1, Math.ceil(total / pageSize))}
        pageSize={pageSize} loading={loading} onPageChange={setPage} onPageSizeChange={changePageSize} />
      <StickyFooter>
        <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-2 text-xs text-muted-foreground">
          <span>已选择 {selected.size} 条</span>
          <label className="flex items-center gap-2">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="全选本页" /> 全选本页
          </label>
        </div>
      </StickyFooter>
    </Workspace>
  )
}

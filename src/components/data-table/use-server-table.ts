"use client"

/**
 * 服务端分页/排序表格状态机（配合 TanStack Table manualPagination/manualSorting 使用）
 * 管理 page/pageSize/sorting/rows/total/loading；筛选参数变化自动重新请求；
 * 删除后落在空页时自动回退到最后一页
 */

import React from "react"
import type { SortingState } from "@tanstack/react-table"
import { fetchJson } from "@/lib/api/client"
import type { PaginatedData } from "@/lib/api/types"

type BuildParamsArgs = {
  page: number
  pageSize: number
  sorting: SortingState
}

type UseServerTableOptions = {
  /** 列表接口地址（GET，不带查询串） */
  endpoint: string
  /** 由筛选状态 + 分页排序生成查询参数（含 page/pageSize/sort/order） */
  buildParams: (args: BuildParamsArgs) => URLSearchParams
  initialSorting?: SortingState
  initialPageSize?: number
  onError?: (message: string) => void
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function useServerTable<TRow>({
  endpoint,
  buildParams,
  initialSorting = [],
  initialPageSize = 100,
  onError,
}: UseServerTableOptions) {
  const [rows, setRows] = React.useState<TRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(initialPageSize)
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting)
  const [loading, setLoading] = React.useState(true)
  const [reloadFlag, setReloadFlag] = React.useState(0)

  // 参数串做 effect 依赖：筛选/翻页/排序任一变化都会改变 paramsKey
  const paramsKey = React.useMemo(
    () => buildParams({ page, pageSize, sorting }).toString(),
    [buildParams, page, pageSize, sorting]
  )

  // onError 可能每次渲染都是新引用（内联箭头函数），用 ref 转交避免请求 effect 反复触发
  const onErrorRef = React.useRef(onError)
  React.useEffect(() => {
    onErrorRef.current = onError
  })

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const data = await fetchJson<PaginatedData<TRow>>(`${endpoint}?${paramsKey}`)
        if (cancelled) return
        setRows(data.rows)
        setTotal(data.pagination.total)
        // 删除后落在空页时回退到最后一页
        if (data.rows.length === 0 && page > 1 && data.pagination.total > 0) {
          setPage(Math.max(1, Math.ceil(data.pagination.total / pageSize)))
        }
      } catch (error) {
        if (!cancelled) {
          onErrorRef.current?.(getErrorMessage(error, "加载数据失败"))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [endpoint, paramsKey, reloadFlag, page, pageSize])

  /** 重新请求当前页（增删改后调用） */
  const refresh = React.useCallback(() => setReloadFlag((f) => f + 1), [])

  /** 点击表头：同列 desc/asc 切换，换列默认 desc，并回第一页 */
  const toggleSort = React.useCallback((id: string) => {
    setSorting((prev) => {
      const current = prev[0]
      if (current?.id === id) return [{ id, desc: !current.desc }]
      return [{ id, desc: true }]
    })
    setPage(1)
  }, [])

  /** 切换每页条数并回第一页 */
  const changePageSize = React.useCallback((next: number) => {
    setPageSize(next)
    setPage(1)
  }, [])

  return {
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
  }
}

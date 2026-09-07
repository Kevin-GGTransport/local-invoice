"use client"

/**
 * 通用表格分页条：总数/页码信息 + 每页条数选择 + 上/下一页
 */

import React from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronLeft, ChevronRight } from "lucide-react"

type TablePaginationProps = {
  total: number
  page: number
  pageCount: number
  pageSize: number
  loading?: boolean
  pageSizeOptions?: number[]
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export function TablePagination({
  total,
  page,
  pageCount,
  pageSize,
  loading = false,
  pageSizeOptions = [20, 50, 100, 200],
  onPageChange,
  onPageSizeChange,
}: TablePaginationProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>
        共 {total} 条 · 第 {page}/{pageCount} 页
      </span>
      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-8 w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((n) => (
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
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount || loading}
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
        >
          下一页
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

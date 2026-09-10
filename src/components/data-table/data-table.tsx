"use client"

/**
 * 通用数据表格外壳（配合 TanStack Table 实例渲染）
 * - 双行表头（分组行 + 叶子行）sticky 吸顶；传入受控 groupOrder 后分组表头可拖拽整组换位
 * - 叶子表头右侧可拖拽调整列宽，双击分隔线恢复该列默认宽度
 * - 滚动区用 OverlayScroll：原生滚动条隐藏，浮层滑块替代（表头背景/圆角延伸到边缘）
 * - 滚动容器 maxHeight 由外部按吸顶工具栏高度计算传入
 * - 响应式显隐（如 2xl:block 配卡片视图）由调用方通过 className 控制
 */

import React from "react"
import { flexRender, type Table as TanStackTable } from "@tanstack/react-table"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { OverlayScroll } from "@/components/ui/overlay-scroll"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type DataTableProps<TData> = {
  table: TanStackTable<TData>
  loading?: boolean
  /** 滚动容器 max-height（CSS 值，如 calc(100dvh - 320px)） */
  maxHeight?: string
  /** 追加到滚动容器的类名（如响应式显隐 hidden 2xl:block） */
  className?: string
  emptyText?: string
  loadingText?: string
  /** 分组顺序（分组 id 数组）；与 onGroupOrderChange 同传即启用分组拖拽 */
  groupOrder?: string[]
  onGroupOrderChange?: (next: string[]) => void
}

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const copy = [...list]
  const [moved] = copy.splice(from, 1)
  copy.splice(to, 0, moved)
  return copy
}

export function DataTable<TData>({
  table,
  loading = false,
  maxHeight,
  className,
  emptyText = "暂无数据",
  loadingText = "正在加载...",
  groupOrder,
  onGroupOrderChange,
}: DataTableProps<TData>) {
  const [draggingGroup, setDraggingGroup] = React.useState<string | null>(null)
  const dragEnabled = groupOrder != null && onGroupOrderChange != null

  // —— 分组拖拽排序（原生 HTML5 DnD，拖第一行分组表头实时换位，组内列顺序不变） ——
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
      if (!dragEnabled || !groupOrder) return
      if (draggingGroup == null || draggingGroup === groupId) return
      event.preventDefault()
      event.dataTransfer.dropEffect = "move"
      const from = groupOrder.indexOf(draggingGroup)
      const to = groupOrder.indexOf(groupId)
      if (from < 0 || to < 0 || from === to) return
      onGroupOrderChange?.(arrayMove(groupOrder, from, to))
    },
    [dragEnabled, draggingGroup, groupOrder, onGroupOrderChange]
  )

  const clearDraggingGroup = React.useCallback(() => setDraggingGroup(null), [])

  const handleResizeKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, columnId: string) => {
      const column = table.getColumn(columnId)
      if (!column) return
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        column.resetSize()
        return
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
      event.preventDefault()
      const step = event.shiftKey ? 24 : 8
      const delta = event.key === "ArrowRight" ? step : -step
      const minSize = column.columnDef.minSize ?? 20
      const maxSize = column.columnDef.maxSize ?? Number.MAX_SAFE_INTEGER
      const nextSize = Math.min(maxSize, Math.max(minSize, column.getSize() + delta))
      table.setColumnSizing((current) => ({ ...current, [columnId]: nextSize }))
    },
    [table]
  )

  return (
    <OverlayScroll
      className={cn("rounded-xl border bg-card shadow-sm", className)}
      maxHeight={maxHeight}
      refreshKey={`${loading}-${table.getRowModel().rows.length}`}
    >
      <Table noWrapper style={{ width: table.getTotalSize() }}>
        <colgroup>
          {table.getVisibleLeafColumns().map((column) => (
            <col key={column.id} style={{ width: column.getSize() }} />
          ))}
        </colgroup>
        <TableHeader className="sticky top-0 z-20">
          {table.getHeaderGroups().map((headerGroup) => {
            // depth 0 为分组行；仅在启用拖拽且该表头确实是分组（含子列）时可拖
            const isGroupRow =
              headerGroup.depth === 0 &&
              headerGroup.headers.some((h) => h.subHeaders.length > 0)
            return (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isDraggableHead = dragEnabled && isGroupRow && header.subHeaders.length > 0
                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      scope={header.subHeaders.length ? "colgroup" : "col"}
                      draggable={isDraggableHead}
                      title={isDraggableHead ? "拖动调整分组顺序" : undefined}
                      onDragStart={
                        isDraggableHead
                          ? (event) => handleGroupDragStart(event, header.column.id)
                          : undefined
                      }
                      onDragOver={
                        isDraggableHead
                          ? (event) => handleGroupDragOver(event, header.column.id)
                          : undefined
                      }
                      onDrop={isDraggableHead ? (event) => event.preventDefault() : undefined}
                      onDragEnd={isDraggableHead ? clearDraggingGroup : undefined}
                      className={cn(
                        "h-10 [&_button]:text-inherit [&_button:hover]:bg-primary-foreground/10 [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-primary-foreground",
                        isGroupRow && "bg-[var(--table-group)] border-r border-r-primary-foreground/20 last:border-r-0",
                        isDraggableHead && "cursor-grab select-none active:cursor-grabbing",
                        isDraggableHead && draggingGroup === header.column.id ? "opacity-60" : ""
                      )}
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {!header.isPlaceholder && header.subHeaders.length === 0 && header.column.getCanResize() ? (
                        <button
                          type="button"
                          aria-label={`调整 ${header.column.id} 列宽，当前 ${header.column.getSize()} 像素`}
                          title="拖动或方向键调整列宽，双击或按 Enter 恢复默认宽度"
                          className={cn(
                            "absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none select-none rounded-sm",
                            "after:absolute after:inset-y-2 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-primary-foreground/35",
                            "hover:after:w-0.5 hover:after:bg-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-foreground",
                            header.column.getIsResizing() && "after:w-0.5 after:bg-primary-foreground"
                          )}
                          onDoubleClick={() => header.column.resetSize()}
                          onKeyDown={(event) => handleResizeKeyDown(event, header.column.id)}
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                        />
                      ) : null}
                    </TableHead>
                  )
                })}
              </TableRow>
            )
          })}
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell
                colSpan={table.getVisibleLeafColumns().length}
                className="h-24 text-center text-muted-foreground"
              >
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                {loadingText}
              </TableCell>
            </TableRow>
          ) : table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={table.getVisibleLeafColumns().length}
                className="h-24 text-center text-muted-foreground"
              >
                {emptyText}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className="overflow-hidden whitespace-nowrap"
                    style={{ width: cell.column.getSize(), maxWidth: cell.column.getSize() }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </OverlayScroll>
  )
}

"use client"

import React from "react"
import { createColumnHelper, type ColumnDef, type SortingState } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  LAND_DISPATCH_HAUL_TYPE_LABELS,
  LAND_DISPATCH_STATUS_LABELS,
  type LandDispatchPlanningRow,
} from "@/lib/land-orders/dispatch"

export type LandDispatchRow = LandDispatchPlanningRow
export type SelectedLandDispatchRow = Pick<LandDispatchRow, "id" | "truck" | "load_number">

function SortIcon({ id, sorting }: { id: string; sorting: SortingState }) {
  const current = sorting.find((item) => item.id === id)
  if (!current) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-70" />
  return current.desc ? <ArrowDown className="ml-1 h-3 w-3" /> : <ArrowUp className="ml-1 h-3 w-3" />
}

const columnHelper = createColumnHelper<LandDispatchRow>()

type Deps = {
  allSelected: boolean
  toggleAll: () => void
  isSelected: (id: string) => boolean
  toggleRow: (row: LandDispatchRow) => void
  toggleTodo: (row: LandDispatchRow, checked: boolean) => void
  sorting: SortingState
  toggleSort: (id: string) => void
  onEdit: (row: LandDispatchRow) => void
  onDelete: (row: LandDispatchRow) => void
}

export function useLandDispatchColumns({
  allSelected,
  toggleAll,
  isSelected,
  toggleRow,
  toggleTodo,
  sorting,
  toggleSort,
  onEdit,
  onDelete,
}: Deps): ColumnDef<LandDispatchRow, unknown>[] {
  return React.useMemo(() => {
    const sortable = (id: string, label: string) => (
      <button type="button" className="inline-flex items-center rounded-sm" onClick={() => toggleSort(id)}>
        {label}
        <SortIcon id={id} sorting={sorting} />
      </button>
    )
    const multiline = (value: string) => (
      <span className="whitespace-pre-line">{value || "—"}</span>
    )

    return [
      columnHelper.group({
        id: "identification",
        header: "排车标识",
        columns: [
          columnHelper.display({
            id: "select",
            size: 38,
            enableResizing: false,
            header: () => <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="全选本页" />,
            cell: ({ row }) => (
              <Checkbox checked={isSelected(row.original.id)} onCheckedChange={() => toggleRow(row.original)} aria-label="选择该行" />
            ),
          }),
          columnHelper.accessor("dispatch_date", {
            header: () => sortable("dispatch_date", "排车日期"),
            size: 110,
          }),
          columnHelper.accessor("truck", {
            header: () => sortable("truck", "车牌/标识"),
            cell: (info) => info.getValue() ?? "—",
          }),
          columnHelper.accessor("operating_company", { header: "运营公司" }),
          columnHelper.accessor("load_number", {
            header: () => sortable("load_number", "Load #"),
            cell: (info) => info.getValue() ?? "—",
          }),
        ],
      }),
      columnHelper.group({
        id: "cargo",
        header: "货物",
        columns: [
          columnHelper.accessor("quantity", { header: "数量", cell: (info) => info.getValue() ?? "—" }),
          columnHelper.accessor("pallet_positions", { header: "板位", cell: (info) => info.getValue() ?? "—" }),
          columnHelper.accessor("weight_lbs", {
            header: "重量(lbs)",
            cell: (info) => (info.getValue() == null ? "—" : info.getValue()!.toLocaleString("en-US")),
          }),
          columnHelper.accessor("note", { header: "备注", cell: (info) => info.getValue() ?? "—" }),
        ],
      }),
      columnHelper.group({
        id: "pickup",
        header: "提货",
        columns: [
          columnHelper.accessor("dispatch_person", { header: "提货人", cell: (info) => info.getValue() ?? "—" }),
          columnHelper.accessor("pickup_locations", { header: "提货地", cell: (info) => multiline(info.getValue()) }),
          columnHelper.accessor("pickup_times", { header: "提货时间", cell: (info) => multiline(info.getValue()) }),
        ],
      }),
      columnHelper.group({
        id: "delivery",
        header: "交货",
        columns: [
          columnHelper.accessor("drop_locations", { header: "目的地", cell: (info) => multiline(info.getValue()) }),
          columnHelper.accessor("drop_times", { header: "交货时间", cell: (info) => multiline(info.getValue()) }),
          columnHelper.accessor("delivery_person", { header: "交货人", cell: (info) => info.getValue() ?? "—" }),
        ],
      }),
      columnHelper.group({
        id: "operations",
        header: "排车",
        columns: [
          columnHelper.accessor("broker", { header: "Broker", cell: (info) => info.getValue() ?? "—" }),
          columnHelper.accessor("trailer", {
            header: () => sortable("trailer", "Trailer"),
            cell: (info) => info.getValue() ?? "—",
          }),
          columnHelper.accessor("haul_type", {
            header: () => sortable("haul_type", "长途"),
            cell: (info) => LAND_DISPATCH_HAUL_TYPE_LABELS[info.getValue()] ?? info.getValue(),
          }),
          columnHelper.accessor("driver", {
            header: () => sortable("driver", "司机"),
            cell: (info) => info.getValue() ?? "—",
          }),
          columnHelper.accessor("dispatch_status", {
            header: () => sortable("status", "状态"),
            cell: (info) => LAND_DISPATCH_STATUS_LABELS[info.getValue()] ?? info.getValue(),
          }),
        ],
      }),
      columnHelper.group({
        id: "todo",
        header: "Todo 与操作",
        columns: [
          columnHelper.display({
            id: "todo",
            header: "Todo",
            size: 220,
            cell: ({ row }) => (
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={row.original.todo_done}
                  onCheckedChange={(checked) => toggleTodo(row.original, checked === true)}
                  aria-label="标记 Todo"
                  className="mt-0.5"
                />
                <span className={`min-w-0 whitespace-pre-line text-xs ${row.original.todo_done ? "text-muted-foreground line-through" : ""}`}>
                  {row.original.todo_note || "—"}
                </span>
              </div>
            ),
          }),
          columnHelper.display({
            id: "actions",
            header: "操作",
            size: 90,
            enableResizing: false,
            cell: ({ row }) => (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="size-7" onClick={() => onEdit(row.original)} aria-label="编辑排车">
                  <Pencil className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => onDelete(row.original)} aria-label="删除排车">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ),
          }),
        ],
      }),
    ]
  }, [allSelected, toggleAll, isSelected, toggleRow, toggleTodo, sorting, toggleSort, onEdit, onDelete])
}

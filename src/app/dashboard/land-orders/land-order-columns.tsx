"use client"

import React from "react"
import { createColumnHelper, type ColumnDef, type SortingState } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  LAND_ORDER_HAUL_TYPE_LABELS,
  LAND_ORDER_STATUS_LABELS,
  type LandOrderPlanningRow,
} from "@/lib/land-orders/planning"

export type LandOrderRow = LandOrderPlanningRow
export type SelectedLandOrderRow = Pick<LandOrderRow, "id" | "identifier" | "load_number" | "todo_done">

function SortIcon({ id, sorting }: { id: string; sorting: SortingState }) {
  const current = sorting.find((item) => item.id === id)
  if (!current) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-70" />
  return current.desc ? (
    <ArrowDown className="ml-1 h-3 w-3" />
  ) : (
    <ArrowUp className="ml-1 h-3 w-3" />
  )
}

const columnHelper = createColumnHelper<LandOrderRow>()

function sortable(
  id: string,
  label: string,
  toggleSort: (id: string) => void,
  sorting: SortingState
) {
  return (
    <button
      type="button"
      className="inline-flex items-center rounded-sm text-left"
      onClick={() => toggleSort(id)}
    >
      {label}
      <SortIcon id={id} sorting={sorting} />
    </button>
  )
}

type UseLandOrderColumnsDeps = {
  allSelected: boolean
  toggleAll: () => void
  isSelected: (id: string) => boolean
  toggleRow: (row: LandOrderRow) => void
  toggleTodo: (row: LandOrderRow, checked: boolean) => void
  sorting: SortingState
  toggleSort: (id: string) => void
  onDelete: (row: LandOrderRow) => void
  onEdit: (row: LandOrderRow) => void
}

export function useLandOrderColumns({
  allSelected,
  toggleAll,
  isSelected,
  toggleRow,
  toggleTodo,
  sorting,
  toggleSort,
  onDelete,
  onEdit,
}: UseLandOrderColumnsDeps): ColumnDef<LandOrderRow, unknown>[] {
  return React.useMemo(
    () => [
      columnHelper.group({
        id: "identification",
        header: "标识",
        columns: [
          columnHelper.display({
            id: "select",
            size: 38,
            enableResizing: false,
            header: () => (
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="全选本页" />
            ),
            cell: ({ row }) => (
              <Checkbox
                checked={isSelected(row.original.id)}
                onCheckedChange={() => toggleRow(row.original)}
                aria-label="选择该行"
              />
            ),
          }),
          columnHelper.accessor("identifier", {
            header: () => sortable("identifier", "标识", toggleSort, sorting),
            cell: (info) => info.getValue() ?? "—",
          }),
          columnHelper.accessor("company_code", {
            header: () => sortable("company_code", "公司", toggleSort, sorting),
          }),
          columnHelper.accessor("load_number", {
            header: () => (
              <button type="button" className="inline-flex items-center rounded-sm" onClick={() => toggleSort("load_number")}>
                Load # <SortIcon id="load_number" sorting={sorting} />
              </button>
            ),
            cell: (info) => info.getValue() ?? "—",
          }),
        ],
      }),
      columnHelper.group({
        id: "cargo",
        header: "货物",
        columns: [
          columnHelper.accessor("quantity", {
            header: "数量",
            cell: (info) => info.getValue() ?? "—",
          }),
          columnHelper.accessor("pallet_positions", {
            header: "板位",
            cell: (info) => info.getValue() ?? "—",
          }),
          columnHelper.accessor("weight_lbs", {
            header: "重量(lbs)",
            cell: (info) =>
              info.getValue() == null ? "—" : info.getValue()!.toLocaleString("en-US"),
          }),
          columnHelper.accessor("note", {
            header: "备注",
            cell: (info) => info.getValue() ?? "—",
          }),
        ],
      }),
      columnHelper.group({
        id: "pickup",
        header: "提货",
        columns: [
          columnHelper.accessor("dispatch_person", {
            header: "提货人",
            cell: (info) => info.getValue() ?? "—",
          }),
          columnHelper.accessor("pickup_locations", {
            header: "提货地",
            cell: (info) => (
              <span className="whitespace-pre-line">{info.getValue() || "—"}</span>
            ),
          }),
          columnHelper.accessor("pickup_dates", {
            header: () => sortable("pickup_date", "提货日期", toggleSort, sorting),
            cell: (info) => (
              <span className="whitespace-pre-line">{info.getValue() || "—"}</span>
            ),
          }),
          columnHelper.accessor("pickup_times", {
            header: "提货时间",
            cell: (info) => (
              <span className="whitespace-pre-line">{info.getValue() || "—"}</span>
            ),
          }),
        ],
      }),
      columnHelper.group({
        id: "delivery",
        header: "交货",
        columns: [
          columnHelper.accessor("drop_locations", {
            header: "目的地",
            cell: (info) => (
              <span className="whitespace-pre-line">{info.getValue() || "—"}</span>
            ),
          }),
          columnHelper.accessor("drop_dates", {
            header: () => sortable("drop_date", "交货日期", toggleSort, sorting),
            cell: (info) => (
              <span className="whitespace-pre-line">{info.getValue() || "—"}</span>
            ),
          }),
          columnHelper.accessor("drop_times", {
            header: "交货时间",
            cell: (info) => (
              <span className="whitespace-pre-line">{info.getValue() || "—"}</span>
            ),
          }),
          columnHelper.accessor("delivery_person", {
            header: "交货人",
            cell: (info) => info.getValue() ?? "—",
          }),
        ],
      }),
      columnHelper.group({
        id: "operations",
        header: "运营",
        columns: [
          columnHelper.accessor("broker", {
            header: () => sortable("broker", "Broker", toggleSort, sorting),
            cell: (info) => info.getValue() ?? "—",
          }),
          columnHelper.accessor("trailer", {
            header: "Trailer",
            cell: (info) => info.getValue() ?? "—",
          }),
          columnHelper.accessor("haul_type", {
            header: "长途",
            cell: (info) =>
              LAND_ORDER_HAUL_TYPE_LABELS[info.getValue()] ?? info.getValue(),
          }),
          columnHelper.accessor("driver", {
            header: () => sortable("driver", "司机", toggleSort, sorting),
            cell: (info) => info.getValue() ?? "—",
          }),
          columnHelper.accessor("status", {
            header: () => sortable("status", "状态", toggleSort, sorting),
            cell: (info) => LAND_ORDER_STATUS_LABELS[info.getValue()] ?? info.getValue(),
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
                  aria-label={`标记 ${row.original.load_number ?? row.original.id} Todo`}
                  className="mt-0.5"
                />
                <span
                  className={`min-w-0 whitespace-pre-line text-xs ${
                    row.original.todo_done ? "text-muted-foreground line-through" : ""
                  }`}
                >
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => onEdit(row.original)}
                  aria-label="编辑订单"
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive"
                  onClick={() => onDelete(row.original)}
                  aria-label="删除订单"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ),
          }),
        ],
      }),
    ],
    [allSelected, toggleAll, isSelected, toggleRow, toggleTodo, sorting, toggleSort, onDelete, onEdit]
  )
}

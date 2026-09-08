"use client"

/**
 * 陆运账单列定义 + 分组元数据 + 展示格式化
 * 列通过 useInvoiceColumns 注入勾选/排序/行操作依赖；分组顺序元数据
 * （DEFAULT_GROUP_ORDER / GROUP_LEAF_COLUMN_IDS / INVOICE_COLUMN_SETTINGS_GROUPS）
 * 供表格 columnOrder 计算与列设置菜单复用
 */

import React from "react"
import {
  createColumnHelper,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ArrowUpDown, Check, X } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

/** 列表行（API 返回 JSON：BigInt id 已转 string，Decimal 为 string） */
export type AccountingInvoiceRow = {
  id: string
  company: string
  master_order_number: string | null
  order_number: string | null
  /** 合同日期 = 账单创建日期（read 层以 created_at 填充） */
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

export type SelectedInvoiceRow = Pick<
  AccountingInvoiceRow,
  "id" | "company" | "invoice_number" | "invoice_date" | "invoice_price" | "deduction"
>

export function fmtDate(value: string | null) {
  return value ? value.slice(0, 10) : ""
}

export function fmtMoney(value: string | null) {
  if (value == null || value === "") return ""
  const n = Number(value)
  if (Number.isNaN(n)) return ""
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtText(value: string | null) {
  return value == null || value === "" ? "—" : value
}

export function TonuIcon({ value }: { value: boolean }) {
  return value ? (
    <Check className="mx-auto size-4 text-emerald-600" aria-label="TONU：是" />
  ) : (
    <X className="mx-auto size-4 text-rose-600" aria-label="TONU：否" />
  )
}

// —— 分组拖拽排序 / 列设置元数据见 accounting-invoice-view.ts ——

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

type UseInvoiceColumnsDeps = {
  allSelected: boolean
  toggleAll: () => void
  isSelected: (id: string) => boolean
  toggleRow: (row: AccountingInvoiceRow) => void
  sorting: SortingState
  toggleSort: (id: string) => void
  renderRowActions: (row: AccountingInvoiceRow) => React.ReactNode
}

const columnHelper = createColumnHelper<AccountingInvoiceRow>()

export function useInvoiceColumns({
  allSelected,
  toggleAll,
  isSelected,
  toggleRow,
  sorting,
  toggleSort,
  renderRowActions,
}: UseInvoiceColumnsDeps): ColumnDef<AccountingInvoiceRow, unknown>[] {
  return React.useMemo(
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
              checked={isSelected(row.original.id)}
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
    [allSelected, toggleAll, isSelected, toggleRow, sorting, toggleSort, renderRowActions]
  )
}

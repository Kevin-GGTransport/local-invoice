/**
 * 陆运账单表格视图预设：分组元数据 + 视图 config 构建与安全解析
 * 纯逻辑模块（无 React 依赖），分组顺序/列设置元数据供编排器与列设置菜单复用
 */

import type { SortingState, VisibilityState } from "@tanstack/react-table"
import {
  tableViewConfigSchema,
  type TableViewConfig,
} from "@/lib/validations/table-view"
import type { InvoiceTab } from "./accounting-invoice-toolbar"

// —— 分组拖拽排序元数据 ——
export const DEFAULT_GROUP_ORDER = ["business", "contract", "broker", "invoice", "other"] as const

/** 各分组包含的叶子列 id（与列定义保持一致），用于生成 TanStack columnOrder */
export const GROUP_LEAF_COLUMN_IDS: Record<string, string[]> = {
  business: ["select", "company", "master_order_number", "order_number"],
  contract: ["contract_date", "contract_price"],
  broker: ["bill_to", "broker_load_number", "billing_category", "tonu"],
  invoice: ["invoice_number", "invoice_date", "invoice_price", "difference"],
  other: ["deduction", "notes", "actions"],
}

/** 全部叶子列 id（用于过滤视图里的非法列可见性键） */
export const ALL_LEAF_COLUMN_IDS = Object.values(GROUP_LEAF_COLUMN_IDS).flat()

/** 列设置菜单分组（locked 列不可隐藏） */
export const INVOICE_COLUMN_SETTINGS_GROUPS = [
  {
    id: "business",
    label: "业务信息",
    columns: [
      { id: "select", label: "勾选", locked: true },
      { id: "company", label: "公司" },
      { id: "master_order_number", label: "总货号" },
      { id: "order_number", label: "货号" },
    ],
  },
  {
    id: "contract",
    label: "合同",
    columns: [
      { id: "contract_date", label: "合同日期" },
      { id: "contract_price", label: "合同金额" },
    ],
  },
  {
    id: "broker",
    label: "Broker",
    columns: [
      { id: "bill_to", label: "Broker公司" },
      { id: "broker_load_number", label: "Load #" },
      { id: "billing_category", label: "账单分类" },
      { id: "tonu", label: "TONU" },
    ],
  },
  {
    id: "invoice",
    label: "Invoice",
    columns: [
      { id: "invoice_number", label: "Invoice Number" },
      { id: "invoice_date", label: "Invoice 日期" },
      { id: "invoice_price", label: "Invoice 价格" },
      { id: "difference", label: "差额" },
    ],
  },
  {
    id: "other",
    label: "备注与操作",
    columns: [
      { id: "deduction", label: "扣钱" },
      { id: "notes", label: "备注" },
      { id: "actions", label: "操作", locked: true },
    ],
  },
] as const

/** 规范化分组顺序：丢弃未知/非字符串分组，缺失的补到末尾 */
export function normalizeGroupOrder(saved: readonly unknown[]): string[] {
  const defaults = DEFAULT_GROUP_ORDER as readonly string[]
  const valid = saved.filter((id): id is string => typeof id === "string" && defaults.includes(id))
  const missing = defaults.filter((id) => !valid.includes(id))
  return [...new Set(valid), ...missing]
}

// —— 视图 config 构建与解析 ——

export const INVOICE_TABLE_KEY = "accounting-invoices"

const INVOICE_TAB_VALUES = [
  "all",
  "unsent",
  "negative",
  "unmatched_paid",
  "with_deduction",
] as const

export type InvoiceViewFilters = {
  invoiceTab: InvoiceTab
  search: string
  broker: string
  companies: string[]
  billingCategory: string
  dateFrom: string
  dateTo: string
  /** 月份快捷筛选所在年份；0 表示未指定（应用时回退到当前年份或日期年份） */
  filterYear: number
}

export type InvoiceViewConfig = {
  filters: InvoiceViewFilters
  sorting: SortingState
  columnVisibility: VisibilityState
  groupOrder: string[]
}

type BuildInvoiceViewConfigInput = InvoiceViewConfig

/** 由当前表格状态生成可保存的视图 config（列可见性只保留已知列） */
export function buildInvoiceViewConfig(input: BuildInvoiceViewConfigInput): TableViewConfig {
  return {
    filters: { ...input.filters },
    sorting: input.sorting.map((s) => ({ id: s.id, desc: s.desc })).slice(0, 1),
    columnVisibility: Object.fromEntries(
      Object.entries(input.columnVisibility).filter(
        ([id, visible]) => ALL_LEAF_COLUMN_IDS.includes(id) && typeof visible === "boolean"
      )
    ),
    groupOrder: normalizeGroupOrder(input.groupOrder),
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []
}

/**
 * 安全解析已保存的视图 config（数据库 JSON 可能来自旧版本或被篡改）：
 * 结构非法返回 null；字段级脏数据回退默认值
 */
export function parseInvoiceViewConfig(config: unknown): InvoiceViewConfig | null {
  const parsed = tableViewConfigSchema.safeParse(config)
  if (!parsed.success) return null
  const { filters, sorting, columnVisibility, groupOrder } = parsed.data

  const tab = INVOICE_TAB_VALUES.find((v) => v === filters.invoiceTab)
  const filterYearRaw = filters.filterYear

  return {
    filters: {
      invoiceTab: (tab ?? "all") as InvoiceTab,
      search: asString(filters.search),
      broker: asString(filters.broker),
      companies: asStringArray(filters.companies),
      billingCategory: asString(filters.billingCategory),
      dateFrom: asString(filters.dateFrom),
      dateTo: asString(filters.dateTo),
      filterYear:
        typeof filterYearRaw === "number" && Number.isInteger(filterYearRaw) && filterYearRaw > 0
          ? filterYearRaw
          : 0,
    },
    sorting: sorting
      .filter(
        (s): s is { id: string; desc: boolean } =>
          typeof s === "object" &&
          s !== null &&
          typeof (s as { id?: unknown }).id === "string" &&
          typeof (s as { desc?: unknown }).desc === "boolean"
      )
      .slice(0, 1)
      .map((s) => ({ id: s.id, desc: s.desc })),
    columnVisibility: Object.fromEntries(
      Object.entries(columnVisibility).flatMap(([id, visible]) =>
        ALL_LEAF_COLUMN_IDS.includes(id) && typeof visible === "boolean"
          ? ([[id, visible]] as const)
          : []
      )
    ),
    groupOrder: normalizeGroupOrder(groupOrder),
  }
}

import type { SortingState, VisibilityState } from "@tanstack/react-table"
import {
  tableViewConfigSchema,
  type TableViewConfig,
} from "@/lib/validations/table-view"
import { LAND_ORDER_SORT_FIELDS } from "@/lib/land-orders/query"
import { isRealIsoDate } from "@/lib/land-orders/validation"

export const LAND_ORDER_TABLE_KEY = "land-orders"

export const DEFAULT_LAND_ORDER_GROUP_ORDER = [
  "identification",
  "cargo",
  "pickup",
  "delivery",
  "broker",
  "actions",
] as const

export const LAND_ORDER_GROUP_LEAF_COLUMN_IDS: Record<string, string[]> = {
  identification: ["select", "identifier", "operating_company", "load_number"],
  cargo: ["quantity", "pallet_positions", "weight_lbs", "note"],
  pickup: ["dispatch_person", "pickup_locations", "pickup_dates", "pickup_times"],
  delivery: ["drop_locations", "drop_dates", "drop_times", "delivery_person"],
  broker: ["broker", "status"],
  actions: ["actions"],
}

export const ALL_LAND_ORDER_LEAF_COLUMN_IDS = Object.values(
  LAND_ORDER_GROUP_LEAF_COLUMN_IDS
).flat()

const LOCKED_LAND_ORDER_COLUMN_IDS = ["select", "actions"] as const

export const LAND_ORDER_COLUMN_SETTINGS_GROUPS = [
  {
    id: "identification",
    label: "标识",
    columns: [
      { id: "select", label: "勾选", locked: true },
      { id: "identifier", label: "标识" },
      { id: "operating_company", label: "公司" },
      { id: "load_number", label: "Load #" },
    ],
  },
  {
    id: "cargo",
    label: "货物",
    columns: [
      { id: "quantity", label: "数量" },
      { id: "pallet_positions", label: "板位" },
      { id: "weight_lbs", label: "重量(lbs)" },
      { id: "note", label: "备注" },
    ],
  },
  {
    id: "pickup",
    label: "提货",
    columns: [
      { id: "dispatch_person", label: "提货人" },
      { id: "pickup_locations", label: "提货地" },
      { id: "pickup_dates", label: "提货日期" },
      { id: "pickup_times", label: "提货时间" },
    ],
  },
  {
    id: "delivery",
    label: "交货",
    columns: [
      { id: "drop_locations", label: "目的地" },
      { id: "drop_dates", label: "交货日期" },
      { id: "drop_times", label: "交货时间" },
      { id: "delivery_person", label: "交货人" },
    ],
  },
  {
    id: "broker",
    label: "Broker 与状态",
    columns: [
      { id: "broker", label: "Broker" },
      { id: "status", label: "订单状态" },
    ],
  },
  {
    id: "actions",
    label: "操作",
    columns: [
      { id: "actions", label: "操作", locked: true },
    ],
  },
] as const

export type LandOrderViewFilters = {
  search: string
  operatingCompany: string
  status: string
  dateFrom: string
  dateTo: string
}

export type LandOrderViewConfig = {
  filters: LandOrderViewFilters
  sorting: SortingState
  columnVisibility: VisibilityState
  groupOrder: string[]
}

export function normalizeLandOrderGroupOrder(saved: readonly unknown[]): string[] {
  const defaults = DEFAULT_LAND_ORDER_GROUP_ORDER as readonly string[]
  const valid = saved.filter(
    (id): id is string => typeof id === "string" && defaults.includes(id)
  )
  const missing = defaults.filter((id) => !valid.includes(id))
  return [...new Set(valid), ...missing]
}

export function buildLandOrderViewConfig(input: LandOrderViewConfig): TableViewConfig {
  return {
    filters: { ...input.filters },
    sorting: input.sorting
      .filter((item) => (LAND_ORDER_SORT_FIELDS as readonly string[]).includes(item.id))
      .map((item) => ({ id: item.id, desc: item.desc }))
      .slice(0, 1),
    columnVisibility: Object.fromEntries(
      Object.entries(input.columnVisibility).filter(
        ([id, visible]) =>
          ALL_LAND_ORDER_LEAF_COLUMN_IDS.includes(id) &&
          !LOCKED_LAND_ORDER_COLUMN_IDS.includes(id as (typeof LOCKED_LAND_ORDER_COLUMN_IDS)[number]) &&
          typeof visible === "boolean"
      )
    ),
    groupOrder: normalizeLandOrderGroupOrder(input.groupOrder),
  }
}

function safeDate(value: unknown): string {
  return typeof value === "string" && isRealIsoDate(value) ? value : ""
}

function safeString(value: unknown, maxLength: number): string {
  return typeof value === "string" && value.length <= maxLength ? value : ""
}

export function parseLandOrderViewConfig(config: unknown): LandOrderViewConfig | null {
  const parsed = tableViewConfigSchema.safeParse(config)
  if (!parsed.success) return null
  const { filters, sorting, columnVisibility, groupOrder } = parsed.data
  const status = safeString(filters.status, 20)

  return {
    filters: {
      search: safeString(filters.search, 100),
      operatingCompany: safeString(filters.operatingCompany, 100),
      status: ["draft", "confirmed", "completed", "cancelled"].includes(status) ? status : "",
      dateFrom: safeDate(filters.dateFrom),
      dateTo: safeDate(filters.dateTo),
    },
    sorting: sorting
      .filter(
        (item): item is { id: string; desc: boolean } =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { id?: unknown }).id === "string" &&
          typeof (item as { desc?: unknown }).desc === "boolean" &&
          (LAND_ORDER_SORT_FIELDS as readonly string[]).includes((item as { id: string }).id)
      )
      .slice(0, 1)
      .map((item) => ({ id: item.id, desc: item.desc })),
    columnVisibility: Object.fromEntries(
      Object.entries(columnVisibility).flatMap(([id, visible]) =>
        ALL_LAND_ORDER_LEAF_COLUMN_IDS.includes(id) && typeof visible === "boolean"
          ? ([[id, LOCKED_LAND_ORDER_COLUMN_IDS.includes(id as (typeof LOCKED_LAND_ORDER_COLUMN_IDS)[number]) ? true : visible]] as const)
          : []
      )
    ),
    groupOrder: normalizeLandOrderGroupOrder(groupOrder),
  }
}

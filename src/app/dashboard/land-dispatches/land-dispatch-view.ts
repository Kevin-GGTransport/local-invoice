import type { SortingState, VisibilityState } from "@tanstack/react-table"
import { tableViewConfigSchema, type TableViewConfig } from "@/lib/validations/table-view"
import { LAND_DISPATCH_SORT_FIELDS } from "@/lib/land-orders/dispatch"
import { isRealIsoDate } from "@/lib/land-orders/validation"

export const LAND_DISPATCH_TABLE_KEY = "land-dispatches"

export const DEFAULT_LAND_DISPATCH_GROUP_ORDER = [
  "identification",
  "cargo",
  "pickup",
  "delivery",
  "operations",
  "todo",
] as const

export const LAND_DISPATCH_GROUP_LEAF_COLUMN_IDS: Record<string, string[]> = {
  identification: ["select", "dispatch_date", "truck", "operating_company", "load_number"],
  cargo: ["quantity", "pallet_positions", "weight_lbs", "note"],
  pickup: ["dispatch_person", "pickup_locations", "pickup_times"],
  delivery: ["drop_locations", "drop_times", "delivery_person"],
  operations: ["broker", "trailer", "haul_type", "driver", "dispatch_status"],
  todo: ["todo", "actions"],
}

export const ALL_LAND_DISPATCH_LEAF_COLUMN_IDS = Object.values(
  LAND_DISPATCH_GROUP_LEAF_COLUMN_IDS
).flat()
const LOCKED = ["select", "actions"] as const

export const LAND_DISPATCH_COLUMN_SETTINGS_GROUPS = [
  {
    id: "identification",
    label: "排车标识",
    columns: [
      { id: "select", label: "勾选", locked: true },
      { id: "dispatch_date", label: "排车日期" },
      { id: "truck", label: "车牌/标识" },
      { id: "operating_company", label: "运营公司" },
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
      { id: "pickup_times", label: "提货时间" },
    ],
  },
  {
    id: "delivery",
    label: "交货",
    columns: [
      { id: "drop_locations", label: "目的地" },
      { id: "drop_times", label: "交货时间" },
      { id: "delivery_person", label: "交货人" },
    ],
  },
  {
    id: "operations",
    label: "排车",
    columns: [
      { id: "broker", label: "Broker" },
      { id: "trailer", label: "Trailer" },
      { id: "haul_type", label: "长途" },
      { id: "driver", label: "司机" },
      { id: "dispatch_status", label: "状态" },
    ],
  },
  {
    id: "todo",
    label: "Todo 与操作",
    columns: [
      { id: "todo", label: "Todo" },
      { id: "actions", label: "操作", locked: true },
    ],
  },
] as const

export type LandDispatchViewFilters = {
  search: string
  truck: string
  driver: string
  haulType: string
  status: string
  todoDone: string
  dateFrom: string
  dateTo: string
}

export type LandDispatchViewConfig = {
  filters: LandDispatchViewFilters
  sorting: SortingState
  columnVisibility: VisibilityState
  groupOrder: string[]
}

function normalizeGroupOrder(saved: readonly unknown[]): string[] {
  const defaults = DEFAULT_LAND_DISPATCH_GROUP_ORDER as readonly string[]
  const valid = saved.filter((id): id is string => typeof id === "string" && defaults.includes(id))
  const missing = defaults.filter((id) => !valid.includes(id))
  return [...new Set(valid), ...missing]
}

function safeString(value: unknown, max: number): string {
  return typeof value === "string" && value.length <= max ? value : ""
}

function safeDate(value: unknown): string {
  return typeof value === "string" && isRealIsoDate(value) ? value : ""
}

export function buildLandDispatchViewConfig(input: LandDispatchViewConfig): TableViewConfig {
  return {
    filters: { ...input.filters },
    sorting: input.sorting
      .filter((item) => (LAND_DISPATCH_SORT_FIELDS as readonly string[]).includes(item.id))
      .slice(0, 1)
      .map((item) => ({ id: item.id, desc: item.desc })),
    columnVisibility: Object.fromEntries(
      Object.entries(input.columnVisibility).filter(
        ([id, visible]) =>
          ALL_LAND_DISPATCH_LEAF_COLUMN_IDS.includes(id) &&
          !LOCKED.includes(id as (typeof LOCKED)[number]) &&
          typeof visible === "boolean"
      )
    ),
    groupOrder: normalizeGroupOrder(input.groupOrder),
  }
}

export function parseLandDispatchViewConfig(config: unknown): LandDispatchViewConfig | null {
  const parsed = tableViewConfigSchema.safeParse(config)
  if (!parsed.success) return null
  const { filters, sorting, columnVisibility, groupOrder } = parsed.data
  const haulType = safeString(filters.haulType, 20)
  const status = safeString(filters.status, 20)
  const todoDone = safeString(filters.todoDone, 20)

  return {
    filters: {
      search: safeString(filters.search, 100),
      truck: safeString(filters.truck, 50),
      driver: safeString(filters.driver, 100),
      haulType: ["local", "long_haul"].includes(haulType) ? haulType : "",
      status: ["planned", "dispatched", "completed", "cancelled"].includes(status) ? status : "",
      todoDone: ["done", "undone"].includes(todoDone) ? todoDone : "",
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
          (LAND_DISPATCH_SORT_FIELDS as readonly string[]).includes((item as { id: string }).id)
      )
      .slice(0, 1)
      .map((item) => ({ id: item.id, desc: item.desc })),
    columnVisibility: Object.fromEntries(
      Object.entries(columnVisibility).flatMap(([id, visible]) =>
        ALL_LAND_DISPATCH_LEAF_COLUMN_IDS.includes(id) && typeof visible === "boolean"
          ? ([[id, LOCKED.includes(id as (typeof LOCKED)[number]) ? true : visible]] as const)
          : []
      )
    ),
    groupOrder: normalizeGroupOrder(groupOrder),
  }
}

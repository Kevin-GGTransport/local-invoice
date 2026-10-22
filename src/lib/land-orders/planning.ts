export type LandOrderPlanningStop = {
  id?: string | bigint
  stop_type: string
  sequence?: number
  company_name: string
  address?: string | null
  city: string
  state: string
  zip_code?: string | null
  stop_date: Date | string
  time_from?: string | null
  time_to?: string | null
  time_type?: string | null
  reference_numbers?: string | null
  stop_note?: string | null
}

export type LandOrderPlanningSource = {
  id: string | bigint
  identifier?: string | null
  company_code: string
  dispatch_person?: string | null
  broker?: string | null
  load_number?: string | null
  quantity?: string | number | null
  pallet_positions?: string | number | null
  weight_lbs?: string | number | null
  price?: string | number | null
  load_type: string
  haul_type: string
  driver?: string | null
  trailer?: string | null
  delivery_person?: string | null
  status: string
  note?: string | null
  todo_note?: string | null
  todo_done: boolean
  created_at?: Date | string
  updated_at?: Date | string
  land_order_stops: readonly LandOrderPlanningStop[]
}

export type LandOrderPlanningRow = Omit<
  LandOrderPlanningSource,
  "id" | "land_order_stops" | "quantity" | "pallet_positions" | "weight_lbs" | "price"
> & {
  id: string
  quantity: number | null
  pallet_positions: number | null
  weight_lbs: number | null
  price: number | null
  pickup_locations: string
  drop_locations: string
  pickup_dates: string
  drop_dates: string
  pickup_times: string
  drop_times: string
}

export const LAND_ORDER_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  planned: "已规划",
  completed: "已完成",
  cancelled: "已取消",
}

export const LAND_ORDER_LOAD_TYPE_LABELS: Record<string, string> = {
  full: "Full",
  partial: "Partial",
}

export const LAND_ORDER_HAUL_TYPE_LABELS: Record<string, string> = {
  local: "本地",
  long_haul: "长途",
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`)
}

function formatShortDate(value: Date | string): string {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return ""
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${month}/${day}`
}

function stopTime(stop: LandOrderPlanningStop): string {
  if (stop.time_from && stop.time_to) return `${stop.time_from}-${stop.time_to}`
  return stop.time_from ?? stop.time_to ?? ""
}

function stopLocation(stop: LandOrderPlanningStop): string {
  const lines = [`${stop.company_name} / ${stop.city}, ${stop.state}`]
  if (stop.reference_numbers) {
    lines.push(`${stop.stop_type === "pickup" ? "PU#" : "DEL#"} ${stop.reference_numbers}`)
  }
  return lines.join("\n")
}

function joinLines(values: readonly string[]): string {
  return values.filter(Boolean).join("\n")
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function stopDate(stop: LandOrderPlanningStop): number {
  const date = toDate(stop.stop_date)
  return Number.isNaN(date.getTime()) ? Number.POSITIVE_INFINITY : date.getTime()
}

export function earliestStopDate(
  order: Pick<LandOrderPlanningSource, "land_order_stops">,
  stopType: "pickup" | "drop",
): number {
  return order.land_order_stops
    .filter((stop) => stop.stop_type === stopType)
    .reduce((minimum, stop) => Math.min(minimum, stopDate(stop)), Number.POSITIVE_INFINITY)
}

export function buildLandOrderPlanningRow(order: LandOrderPlanningSource): LandOrderPlanningRow {
  const { id, land_order_stops, quantity, pallet_positions, weight_lbs, price, ...rest } = order
  const orderedStops = [...land_order_stops].sort(
    (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)
  )
  const pickups = orderedStops.filter((stop) => stop.stop_type === "pickup")
  const drops = orderedStops.filter((stop) => stop.stop_type === "drop")

  return {
    ...rest,
    id: String(id),
    quantity: toNumber(quantity),
    pallet_positions: toNumber(pallet_positions),
    weight_lbs: toNumber(weight_lbs),
    price: toNumber(price),
    pickup_locations: joinLines(pickups.map(stopLocation)),
    drop_locations: joinLines(drops.map(stopLocation)),
    pickup_dates: joinLines(pickups.map((stop) => formatShortDate(stop.stop_date))),
    drop_dates: joinLines(drops.map((stop) => formatShortDate(stop.stop_date))),
    pickup_times: joinLines(pickups.map(stopTime)),
    drop_times: joinLines(drops.map(stopTime)),
  }
}

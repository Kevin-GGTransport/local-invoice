import { z } from "zod"

export const MAX_LAND_ORDER_STOPS = 50

export const LAND_ORDER_STATUSES = ["draft", "planned", "completed", "cancelled"] as const
export const LAND_ORDER_LOAD_TYPES = ["full", "partial"] as const
export const LAND_ORDER_HAUL_TYPES = ["local", "long_haul"] as const
export const LAND_ORDER_STOP_TYPES = ["pickup", "drop"] as const

export const LAND_ORDER_SORT_FIELDS_SAFE = [
  "pickup_date",
  "drop_date",
  "company_code",
  "identifier",
  "load_number",
  "broker",
  "driver",
  "status",
  "created_at",
] as const

const POSTGRES_BIGINT_MAX = BigInt("9223372036854775807")

export function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function isCanonicalPostgresBigint(value: string): boolean {
  return /^[1-9]\d*$/.test(value) && BigInt(value) <= POSTGRES_BIGINT_MAX
}

export const landOrderIdSchema = z.string().refine(isCanonicalPostgresBigint, "无效的订单 ID")

function optionalText(max: number, label: string) {
  return z.preprocess(
    (value) => {
      if (value === null || value === undefined) return null
      if (typeof value === "string") return value.trim()
      return String(value)
    },
    z.string().max(max, `${label}不能超过 ${max} 个字符`).nullable()
  )
}

function nonnegativeNumber(label: string, max: number) {
  return z.preprocess(
    (value) => {
      if (value === "" || value === null || value === undefined) return null
      if (typeof value === "string") {
        const normalized = value.trim().replace(/[$,]/g, "")
        return normalized === "" ? null : Number(normalized)
      }
      return value
    },
    z
      .number(`${label}必须为数字`)
      .finite(`${label}必须为有效数字`)
      .min(0, `${label}不能为负数`)
      .max(max, `${label}超出范围`)
      .refine(
         (value) =>
           value == null || Math.abs(value * 100 - Math.round(value * 100)) < 1e-9,
         `${label}最多保留两位小数`
       )
      .nullable()
  )
}

export function normalizeReferenceNumbers(value: string | null): string | null {
  if (!value) return null
  const items = value
    .split(/[\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length ? items.join(" / ") : null
}

const dateSchema = z
  .string()
  .refine(isRealIsoDate, "日期格式应为 YYYY-MM-DD 且日期必须真实存在")

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时间格式应为 HH:mm")

const stopBaseSchema = z.object({
  stop_type: z.enum(LAND_ORDER_STOP_TYPES, "站点类型无效"),
  company_name: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().min(1, "站点公司名不能为空").max(200, "站点公司名不能超过 200 个字符")
  ),
  address: optionalText(500, "站点地址"),
  city: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().min(1, "城市不能为空").max(100, "城市不能超过 100 个字符")
  ),
  state: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
    z.string().min(1, "州不能为空").max(50, "州不能超过 50 个字符")
  ),
  zip_code: optionalText(20, "Zip Code"),
  stop_date: dateSchema,
  time_from: timeSchema.nullable().optional(),
  time_to: timeSchema.nullable().optional(),
  time_type: z.preprocess(
    (value) => {
      if (value === null || value === undefined || value === "") return "FCFS"
      return typeof value === "string" ? value.trim().toUpperCase() : value
    },
    z.string().min(1, "时间类型不能为空").max(30, "时间类型不能超过 30 个字符")
  ),
  reference_numbers: z.preprocess(
    (value) => {
      if (value === null || value === undefined) return null
      return normalizeReferenceNumbers(String(value).trim() || null)
    },
    z.string().max(500, "PU#/DEL# 不能超过 500 个字符").nullable()
  ),
  stop_note: optionalText(500, "站点备注"),
})

export const landOrderStopSchema = stopBaseSchema.superRefine((stop, ctx) => {
  if ((stop.time_from == null) !== (stop.time_to == null)) {
    ctx.addIssue({
      code: "custom",
      path: ["time_from"],
      message: "Time From 和 Time To 必须同时填写或同时留空",
    })
    return
  }
  if (stop.time_from && stop.time_to && stop.time_to < stop.time_from) {
    ctx.addIssue({
      code: "custom",
      path: ["time_to"],
      message: "Time To 不能早于 Time From",
    })
  }
})

export const landOrderCreateSchema = z
  .object({
    identifier: optionalText(50, "标识"),
    company_code: z.preprocess(
      (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
      z.string().min(1, "请选择公司").max(20, "公司代码不能超过 20 个字符")
    ),
    dispatch_person: optionalText(100, "提货/调度人"),
    broker: optionalText(100, "Broker"),
    load_number: optionalText(100, "Load #"),
    quantity: nonnegativeNumber("数量", 99_999_999.99),
    pallet_positions: nonnegativeNumber("板位", 99_999_999.99),
    weight_lbs: nonnegativeNumber("重量", 9_999_999_999.99),
    price: nonnegativeNumber("价格", 9_999_999_999.99),
    load_type: z.enum(LAND_ORDER_LOAD_TYPES, "装载类型无效").default("full"),
    haul_type: z.enum(LAND_ORDER_HAUL_TYPES, "运输类型无效").default("local"),
    driver: optionalText(100, "司机"),
    trailer: optionalText(100, "Trailer"),
    delivery_person: optionalText(100, "交货人"),
    status: z.enum(LAND_ORDER_STATUSES, "订单状态无效").default("draft"),
    note: optionalText(500, "备注"),
    todo_note: optionalText(500, "Todo"),
    todo_done: z.boolean().default(false),
    stops: z
      .array(landOrderStopSchema)
      .min(1, "至少需要一个提货点和一个交货点")
      .max(MAX_LAND_ORDER_STOPS, `站点最多 ${MAX_LAND_ORDER_STOPS} 个`),
  })
  .superRefine((order, ctx) => {
    if (!order.stops.some((stop) => stop.stop_type === "pickup")) {
      ctx.addIssue({ code: "custom", path: ["stops"], message: "至少需要一个提货点" })
    }
    if (!order.stops.some((stop) => stop.stop_type === "drop")) {
      ctx.addIssue({ code: "custom", path: ["stops"], message: "至少需要一个交货点" })
    }
  })

export const landOrderPatchSchema = z
  .object({
    status: z.enum(LAND_ORDER_STATUSES, "订单状态无效").optional(),
    todo_done: z.boolean().optional(),
    driver: optionalText(100, "司机").optional(),
    trailer: optionalText(100, "Trailer").optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "没有需要更新的字段")

export type LandOrderCreateInput = z.output<typeof landOrderCreateSchema>
export type LandOrderPatchInput = z.output<typeof landOrderPatchSchema>
export type LandOrderStopInput = z.output<typeof landOrderStopSchema>

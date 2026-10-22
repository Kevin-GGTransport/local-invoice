import assert from "node:assert/strict"
import test from "node:test"
import { landOrderCreateSchema, MAX_LAND_ORDER_STOPS } from "../validation"

function stop(stopType: "pickup" | "drop", overrides: Record<string, unknown> = {}) {
  return {
    stop_type: stopType,
    company_name: stopType === "pickup" ? "FILTRATION GROUP" : "Fastenal Company",
    address: stopType === "pickup" ? "498 Aviation Blvd" : "4025 Finch Road",
    city: stopType === "pickup" ? "Santa Rosa" : "Modesto",
    state: "ca",
    zip_code: stopType === "pickup" ? "95403" : "95357",
    stop_date: stopType === "pickup" ? "2026-10-20" : "2026-10-21",
    time_from: stopType === "pickup" ? "08:00" : "06:00",
    time_to: stopType === "pickup" ? "14:00" : "20:00",
    time_type: "fcfs",
    reference_numbers:
      stopType === "pickup" ? "240338916\n240339098;240339313" : "",
    stop_note: "",
    ...overrides,
  }
}

function order(stops: Array<ReturnType<typeof stop>>, overrides: Record<string, unknown> = {}) {
  return {
    identifier: "AA",
    operating_company: "aa",
    dispatch_person: "刘辉Eric",
    broker: "Matrix",
    load_number: "141288",
    quantity: "26",
    pallet_positions: "13",
    weight_lbs: "44,000",
    price: "$700",
    load_type: "full",
    delivery_person: "",
    status: "confirmed",
    note: "",
    stops,
    ...overrides,
  }
}

test("截图订单通过校验并规范化字段", () => {
  const parsed = landOrderCreateSchema.parse(order([stop("pickup"), stop("drop")]))
  assert.equal(parsed.operating_company, "aa")
  assert.equal(parsed.quantity, 26)
  assert.equal(parsed.weight_lbs, 44000)
  assert.equal(parsed.price, 700)
  assert.equal(parsed.stops[0].state, "CA")
  assert.equal(parsed.stops[0].time_type, "FCFS")
  assert.equal(parsed.stops[0].reference_numbers, "240338916 / 240339098 / 240339313")
})

test("缺少提货点或交货点时拒绝", () => {
  assert.equal(landOrderCreateSchema.safeParse(order([stop("pickup")])).success, false)
  assert.equal(landOrderCreateSchema.safeParse(order([stop("drop")])).success, false)
})

test("非法日期、时间、负数与超量站点被拒绝", () => {
  assert.equal(
    landOrderCreateSchema.safeParse(
      order([stop("pickup", { stop_date: "2026-02-30" }), stop("drop")])
    ).success,
    false
  )
  assert.equal(
    landOrderCreateSchema.safeParse(
      order([stop("pickup", { time_to: "07:00" }), stop("drop")])
    ).success,
    false
  )
  assert.equal(
    landOrderCreateSchema.safeParse(order([stop("pickup"), stop("drop")], { price: -1 })).success,
    false
  )
  assert.equal(
    landOrderCreateSchema.safeParse(
      order(Array.from({ length: MAX_LAND_ORDER_STOPS + 1 }, (_, i) => stop(i % 2 ? "drop" : "pickup")))
    ).success,
    false
  )
})

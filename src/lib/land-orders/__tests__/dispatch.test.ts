import assert from "node:assert/strict"
import test from "node:test"
import {
  LAND_DISPATCH_STATUS_LABELS,
  buildLandDispatchPlanningRow,
  parseLandDispatchQuery,
  readLandDispatches,
} from "../dispatch"
import type { LandOrderPlanningSource } from "../planning"

const order: LandOrderPlanningSource = {
  id: BigInt(7),
  identifier: "AA",
  operating_company: "G&G",
  dispatch_person: "刘辉Eric",
  broker: "Matrix",
  load_number: "141288",
  quantity: 26,
  pallet_positions: 13,
  weight_lbs: 44000,
  price: 700,
  load_type: "full",
  delivery_person: "Eric",
  status: "planned",
  note: "",
  land_order_stops: [
    {
      stop_type: "pickup",
      sequence: 1,
      company_name: "Filtration Group",
      city: "Santa Rosa",
      state: "CA",
      stop_date: "2026-10-20",
      time_from: "08:00",
      time_to: "14:00",
    },
    {
      stop_type: "drop",
      sequence: 2,
      company_name: "Fastenal",
      city: "Modesto",
      state: "CA",
      stop_date: "2026-10-21",
      time_from: "06:00",
      time_to: "20:00",
    },
  ],
}

test("排车行在订单信息外单独携带调度属性", () => {
  const row = buildLandDispatchPlanningRow({
    id: BigInt(3),
    land_order_id: BigInt(7),
    dispatch_date: new Date("2026-10-20T00:00:00.000Z"),
    truck: "G&G3633",
    driver: "Gary",
    trailer: "CL-638",
    haul_type: "long_haul",
    status: "planned",
    todo_note: "local pickup",
    todo_done: false,
    sort_order: 2,
    land_orders: order,
  })
  assert.equal(row.id, "3")
  assert.equal(row.land_order_id, "7")
  assert.equal(row.dispatch_date, "2026-10-20")
  assert.equal(row.truck, "G&G3633")
  assert.equal(row.driver, "Gary")
  assert.equal(row.dispatch_status, "planned")
  assert.equal(row.load_number, "141288")
  assert.equal(row.pickup_locations, "Filtration Group / Santa Rosa, CA")
  assert.equal(LAND_DISPATCH_STATUS_LABELS.dispatched, "已出车")
})

test("排车筛选解析并拒绝非法日期/枚举/排序", () => {
  const params = new URLSearchParams()
  params.set("truck", "G&G")
  params.set("driver", "Gary")
  params.set("haulType", "long_haul")
  params.set("status", "planned")
  params.set("todoDone", "undone")
  params.set("dateFrom", "2026-10-20")
  params.set("dateTo", "2026-10-21")
  params.set("sort", "truck")
  params.set("order", "desc")
  const parsed = parseLandDispatchQuery(params)
  assert.equal(parsed.truck, "G&G")
  assert.equal(parsed.driver, "Gary")
  assert.equal(parsed.haulType, "long_haul")
  assert.equal(parsed.status, "planned")
  assert.equal(parsed.todoDone, "undone")
  assert.equal(parsed.sort, "truck")
  assert.equal(parsed.order, "desc")

  assert.throws(
    () => parseLandDispatchQuery(new URLSearchParams("dateFrom=2026-02-30")),
    Error
  )
  assert.throws(() => parseLandDispatchQuery(new URLSearchParams("haulType=bad")), Error)
  assert.throws(() => parseLandDispatchQuery(new URLSearchParams("sort=bad")), Error)
})

test("排车查询使用数据库分页并按日期和排序值稳定排序", async () => {
  let findManyArgs: unknown
  const tx = {
    land_dispatch_items: {
      count: async () => 1,
      findMany: async (args: unknown) => {
        findManyArgs = args
        return []
      },
    },
  } as unknown as Parameters<typeof readLandDispatches>[0]
  const result = await readLandDispatches(tx, new URLSearchParams(), { take: 20, count: true })
  assert.equal(result.total, 1)
  assert.deepEqual(result.rows, [])
  const args = findManyArgs as {
    skip: number
    take: number
    orderBy: Array<Record<string, unknown>>
  }
  assert.equal(args.skip, 0)
  assert.equal(args.take, 20)
  assert.deepEqual(args.orderBy, [
    { dispatch_date: "asc" },
    { sort_order: "asc" },
    { id: "asc" },
  ])
})

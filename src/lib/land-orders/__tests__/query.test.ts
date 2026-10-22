import assert from "node:assert/strict"
import test from "node:test"
import { Prisma } from "@prisma/client"
import {
  LandOrderQueryError,
  parseLandOrderQuery,
  parseSelectedLandOrderIds,
  readLandOrders,
} from "../query"
import type { LandOrderPlanningSource } from "../planning"

test("筛选参数被规范化并拒绝非法枚举、日期与排序", () => {
  const params = new URLSearchParams({
    q: " Santa Rosa ",
    operatingCompany: "aa",
    status: "planned",
    driver: "Gary",
    haulType: "long_haul",
    todoDone: "undone",
    dateFrom: "2026-10-20",
    dateTo: "2026-10-21",
    sort: "load_number",
    order: "desc",
  })
  assert.deepEqual(parseLandOrderQuery(params), {
    q: "Santa Rosa",
    operatingCompany: "aa",
    status: "planned",
    driver: "Gary",
    haulType: "long_haul",
    todoDone: "undone",
    dateFrom: "2026-10-20",
    dateTo: "2026-10-21",
    sort: "load_number",
    order: "desc",
  })
  assert.throws(
    () => parseLandOrderQuery(new URLSearchParams("dateFrom=2026-02-30")),
    LandOrderQueryError
  )
  assert.throws(
    () => parseLandOrderQuery(new URLSearchParams("status=invalid")),
    LandOrderQueryError
  )
  assert.throws(
    () => parseLandOrderQuery(new URLSearchParams("sort=invalid")),
    LandOrderQueryError
  )
})

test("批量 ID 去重、忽略非法值并受 PostgreSQL BigInt 上限保护", () => {
  assert.deepEqual(parseSelectedLandOrderIds("3,1,3,bad,"), [BigInt(3), BigInt(1)])
  assert.deepEqual(
    parseSelectedLandOrderIds("9223372036854775807,9223372036854775808"),
    [BigInt("9223372036854775807")]
  )
})

function fixtureOrder(): LandOrderPlanningSource & { id: bigint } {
  return {
    id: BigInt(7),
    identifier: "AA",
    operating_company: "AA",
    dispatch_person: "刘辉Eric",
    broker: "Matrix",
    load_number: "141288",
    quantity: 26,
    pallet_positions: 13,
    weight_lbs: 44000,
    price: 700,
    load_type: "full",
    haul_type: "long_haul",
    driver: "Gary",
    trailer: "CL-638",
    delivery_person: "Eric",
    status: "planned",
    note: "",
    todo_note: "",
    todo_done: false,
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
    ],
  }
}

test("readLandOrders 在数据库侧计数/分页，只加载本页订单站点", async () => {
  const rawQueries: string[] = []
  let findManyArgs: unknown
  const tx = {
    $queryRaw: async <T>(query: Prisma.Sql): Promise<T> => {
      rawQueries.push(query.sql)
      if (query.sql.includes("COUNT(*)")) return [{ total: BigInt(2) }] as T
      return [{ id: BigInt(7) }] as T
    },
    land_orders: {
      findMany: async (args: unknown) => {
        findManyArgs = args
        return [fixtureOrder()]
      },
    },
  } as unknown as Parameters<typeof readLandOrders>[0]

  const result = await readLandOrders(tx, new URLSearchParams("sort=pickup_date"), {
    skip: 20,
    take: 10,
    count: true,
  })

  assert.equal(result.total, 2)
  assert.equal(result.exceededLimit, false)
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].id, "7")
  assert.equal(rawQueries.length, 2)
  assert.match(rawQueries[0], /COUNT\(\*\)::bigint/)
  assert.match(rawQueries[1], /ORDER BY/)
  assert.match(rawQueries[1], /LIMIT \? OFFSET \?/)
  assert.ok(!/CREATE|DELETE|UPDATE/.test(rawQueries[1]))
  const loaded = findManyArgs as {
    where: { id: { in: bigint[] } }
    include: { land_order_stops: { orderBy: { sequence: string } } }
  }
  assert.deepEqual(loaded.where.id.in, [BigInt(7)])
  assert.deepEqual(loaded.include.land_order_stops.orderBy, { sequence: "asc" })
})

test("导出超过上限时拒绝并停止查询明细", async () => {
  const rawQueries: string[] = []
  let loadedRows = false
  const tx = {
    $queryRaw: async <T>(query: Prisma.Sql): Promise<T> => {
      rawQueries.push(query.sql)
      return [{ total: BigInt(10_001) }] as T
    },
    land_orders: {
      findMany: async () => {
        loadedRows = true
        return []
      },
    },
  } as unknown as Parameters<typeof readLandOrders>[0]

  const result = await readLandOrders(tx, new URLSearchParams(), {
    take: 10_000,
    count: true,
    rejectIfOverTake: true,
  })
  assert.equal(result.exceededLimit, true)
  assert.deepEqual(result.rows, [])
  assert.equal(rawQueries.length, 1)
  assert.equal(loadedRows, false)
})

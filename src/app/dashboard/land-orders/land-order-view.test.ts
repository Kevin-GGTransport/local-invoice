import assert from "node:assert/strict"
import test from "node:test"
import {
  ALL_LAND_ORDER_LEAF_COLUMN_IDS,
  buildLandOrderViewConfig,
  parseLandOrderViewConfig,
} from "./land-order-view"

test("视图配置保存筛选、排序、列显隐与列组顺序并安全解析", () => {
  const config = buildLandOrderViewConfig({
    filters: {
      search: "Matrix",
      operatingCompany: "G&G",
      status: "confirmed",
      dateFrom: "2026-10-20",
      dateTo: "2026-10-21",
    },
    sorting: [{ id: "load_number", desc: true }],
    columnVisibility: { quantity: false },
    groupOrder: ["actions", "identification", "cargo", "pickup", "delivery", "broker"],
  })
  const parsed = parseLandOrderViewConfig({
    ...config,
    sorting: [{ id: "load_number", desc: true }, { id: "invalid", desc: true }],
    columnVisibility: { quantity: false, invalid: false },
    groupOrder: ["unknown", "actions", "identification", "cargo", "pickup", "delivery", "broker"],
  })
  assert.ok(parsed)
  assert.equal(parsed.filters.search, "Matrix")
  assert.deepEqual(parsed.sorting, [{ id: "load_number", desc: true }])
  assert.deepEqual(parsed.columnVisibility, { quantity: false })
  assert.deepEqual(parsed.groupOrder, [
    "actions",
    "identification",
    "cargo",
    "pickup",
    "delivery",
    "broker",
  ])
  assert.ok(ALL_LAND_ORDER_LEAF_COLUMN_IDS.includes("select"))
  assert.equal(parseLandOrderViewConfig({ filters: {} }), null)
})

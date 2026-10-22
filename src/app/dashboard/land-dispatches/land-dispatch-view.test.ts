import assert from "node:assert/strict"
import test from "node:test"
import {
  buildLandDispatchViewConfig,
  parseLandDispatchViewConfig,
} from "./land-dispatch-view"

test("排车视图保存筛选、排序、列显隐与列组顺序并安全解析", () => {
  const config = buildLandDispatchViewConfig({
    filters: {
      search: "Gary",
      truck: "G&G3633",
      driver: "Gary",
      haulType: "long_haul",
      status: "planned",
      todoDone: "undone",
      dateFrom: "2026-10-20",
      dateTo: "2026-10-21",
    },
    sorting: [{ id: "dispatch_date", desc: true }],
    columnVisibility: { quantity: false },
    groupOrder: ["todo", "identification", "cargo", "pickup", "delivery", "operations"],
  })
  const parsed = parseLandDispatchViewConfig({
    ...config,
    sorting: [{ id: "dispatch_date", desc: true }, { id: "bad", desc: true }],
    columnVisibility: { quantity: false, bad: false, select: false },
    groupOrder: ["bad", "todo", "identification", "cargo", "pickup", "delivery", "operations"],
  })
  assert.ok(parsed)
  assert.equal(parsed.filters.truck, "G&G3633")
  assert.deepEqual(parsed.sorting, [{ id: "dispatch_date", desc: true }])
  assert.deepEqual(parsed.columnVisibility, { quantity: false, select: true })
  assert.deepEqual(parsed.groupOrder, [
    "todo",
    "identification",
    "cargo",
    "pickup",
    "delivery",
    "operations",
  ])
})

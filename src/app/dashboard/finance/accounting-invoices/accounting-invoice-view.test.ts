import assert from "node:assert/strict"
import test from "node:test"
import {
  ALL_LEAF_COLUMN_IDS,
  buildInvoiceViewConfig,
  normalizeGroupOrder,
  parseInvoiceViewConfig,
} from "./accounting-invoice-view"

test("buildInvoiceViewConfig 与 parseInvoiceViewConfig 可无损往返", () => {
  const config = buildInvoiceViewConfig({
    filters: {
      invoiceTab: "unsent",
      search: "ABC",
      broker: "Broker Co",
      companies: ["GNG", "K2"],
      billingCategory: "LineHaul",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
      filterYear: 2026,
    },
    sorting: [{ id: "invoice_date", desc: false }],
    columnVisibility: { difference: true, notes: false },
    groupOrder: ["invoice", "business", "contract", "broker", "other"],
  })

  const parsed = parseInvoiceViewConfig(config)
  assert.ok(parsed)
  assert.deepEqual(parsed.filters, {
    invoiceTab: "unsent",
    search: "ABC",
    broker: "Broker Co",
    companies: ["GNG", "K2"],
    billingCategory: "LineHaul",
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
    filterYear: 2026,
  })
  assert.deepEqual(parsed.sorting, [{ id: "invoice_date", desc: false }])
  assert.deepEqual(parsed.columnVisibility, { difference: true, notes: false })
  assert.deepEqual(parsed.groupOrder, ["invoice", "business", "contract", "broker", "other"])
})

test("buildInvoiceViewConfig 只保留已知叶子列且排序仅取首项", () => {
  const config = buildInvoiceViewConfig({
    filters: {
      invoiceTab: "all",
      search: "",
      broker: "",
      companies: [],
      billingCategory: "",
      dateFrom: "",
      dateTo: "",
      filterYear: 2026,
    },
    sorting: [
      { id: "invoice_date", desc: true },
      { id: "company", desc: false },
    ],
    // unknown_column 非法列应被剔除
    columnVisibility: { unknown_column: true, deduction: true },
    groupOrder: ["broker", "bad-group"],
  })

  assert.deepEqual(Object.keys(config.columnVisibility), ["deduction"])
  assert.equal(config.sorting.length, 1)
  // 非法分组被剔除，缺失分组补齐
  assert.deepEqual(
    config.groupOrder,
    ["broker", "business", "contract", "invoice", "other"]
  )
})

test("parseInvoiceViewConfig 对脏数据做字段级回退", () => {
  const parsed = parseInvoiceViewConfig({
    filters: {
      invoiceTab: "not-a-tab",
      search: 123,
      broker: null,
      companies: ["GNG", 42, null],
      billingCategory: true,
      dateFrom: "2026-01-01",
      dateTo: {},
      filterYear: "2026",
    },
    sorting: [{ id: "invoice_date", desc: "yes" }, { id: "company", desc: true }],
    columnVisibility: { difference: "yes", deduction: false },
    groupOrder: [],
  })

  assert.ok(parsed)
  assert.equal(parsed.filters.invoiceTab, "all")
  assert.equal(parsed.filters.search, "")
  assert.equal(parsed.filters.broker, "")
  assert.deepEqual(parsed.filters.companies, ["GNG"])
  assert.equal(parsed.filters.billingCategory, "")
  assert.equal(parsed.filters.dateFrom, "2026-01-01")
  assert.equal(parsed.filters.dateTo, "")
  // 非数字 filterYear 回退 0（应用时由调用方换成当前年份）
  assert.equal(parsed.filters.filterYear, 0)
  // desc 非布尔的排序项被丢弃
  assert.deepEqual(parsed.sorting, [{ id: "company", desc: true }])
  // visibility 只留布尔值
  assert.deepEqual(parsed.columnVisibility, { deduction: false })
  // 空分组顺序补全为默认顺序
  assert.deepEqual(parsed.groupOrder, [
    "business",
    "contract",
    "broker",
    "invoice",
    "other",
  ])
})

test("parseInvoiceViewConfig 结构非法时返回 null", () => {
  assert.equal(parseInvoiceViewConfig(null), null)
  assert.equal(parseInvoiceViewConfig("nope"), null)
  assert.equal(parseInvoiceViewConfig({ filters: {} }), null)
  assert.equal(
    parseInvoiceViewConfig({ filters: {}, sorting: [], columnVisibility: {} }),
    null
  )
})

test("normalizeGroupOrder 去重并补齐缺失分组", () => {
  assert.deepEqual(
    normalizeGroupOrder(["invoice", "invoice", "business"]),
    ["invoice", "business", "contract", "broker", "other"]
  )
})

test("ALL_LEAF_COLUMN_IDS 覆盖全部已知叶子列", () => {
  assert.ok(ALL_LEAF_COLUMN_IDS.includes("select"))
  assert.ok(ALL_LEAF_COLUMN_IDS.includes("actions"))
  assert.equal(ALL_LEAF_COLUMN_IDS.length, 17)
})

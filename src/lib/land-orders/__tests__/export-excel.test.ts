import assert from "node:assert/strict"
import test from "node:test"
import ExcelJS from "exceljs"
import { buildLandOrderPlanningRow, type LandOrderPlanningSource } from "../planning"
import { generateLandOrderPlanningExcel } from "../export-excel"

test("Excel 生成标题、表头、冻结行、筛选与多行站点", async () => {
  const source: LandOrderPlanningSource = {
    id: BigInt(1),
    identifier: "AA",
    company_code: "AA",
    dispatch_person: "刘辉Eric",
    broker: "Matrix",
    load_number: "00141288",
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
  const buffer = await generateLandOrderPlanningExcel([buildLandOrderPlanningRow(source)])
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as ArrayBuffer)
  const sheet = workbook.worksheets[0]
  assert.equal(sheet.name, "路程规划表")
  assert.equal(sheet.getCell("A1").value, "路程规划表")
  assert.equal(sheet.getCell("C2").value, "Load #")
  assert.equal(sheet.getCell("C3").value, "00141288")
  assert.equal(sheet.getCell("C3").type, ExcelJS.ValueType.String)
  assert.equal(sheet.getCell("I3").value, "Filtration Group / Santa Rosa, CA")
  assert.equal(sheet.views[0]?.state, "frozen")
  assert.ok(String(sheet.autoFilter).startsWith("A2"))
})

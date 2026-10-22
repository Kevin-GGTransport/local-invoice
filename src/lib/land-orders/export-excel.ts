import ExcelJS from "exceljs"
import {
  LAND_ORDER_STATUS_LABELS,
  type LandOrderPlanningRow,
} from "./planning"

const COLUMNS = [
  { header: "标识", width: 16 },
  { header: "运营公司", width: 16 },
  { header: "Load #", width: 16, text: true },
  { header: "数量", width: 10, number: true },
  { header: "板位", width: 10, number: true },
  { header: "重量(lbs)", width: 12, number: true },
  { header: "备注", width: 24 },
  { header: "提货人", width: 14 },
  { header: "提货地", width: 32, text: true },
  { header: "提货日期", width: 14, text: true },
  { header: "提货时间", width: 16, text: true },
  { header: "目的地", width: 32, text: true },
  { header: "交货日期", width: 14, text: true },
  { header: "交货时间", width: 16, text: true },
  { header: "交货人", width: 14 },
  { header: "Broker", width: 18 },
  { header: "装载类型", width: 12 },
  { header: "订单状态", width: 12 },
] as const

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF999999" } },
  left: { style: "thin", color: { argb: "FF999999" } },
  bottom: { style: "thin", color: { argb: "FF999999" } },
  right: { style: "thin", color: { argb: "FF999999" } },
}

function colLetter(index: number): string {
  let value = index
  let result = ""
  while (value > 0) {
    const remainder = (value - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    value = Math.floor((value - 1) / 26)
  }
  return result
}

export async function generateLandOrderExportExcel(
  rows: readonly LandOrderPlanningRow[]
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("陆运订单清单", {
    views: [{ state: "frozen", ySplit: 2 }],
  })
  sheet.columns = COLUMNS.map((column) => ({ width: column.width }))
  sheet.mergeCells(`A1:${colLetter(COLUMNS.length)}1`)
  const title = sheet.getCell("A1")
  title.value = "陆运订单清单"
  title.font = { bold: true, size: 14 }
  title.alignment = { horizontal: "center", vertical: "middle" }
  sheet.getRow(1).height = 26

  const header = sheet.getRow(2)
  COLUMNS.forEach((column, index) => {
    const cell = header.getCell(index + 1)
    cell.value = column.header
    cell.font = { bold: true }
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
    cell.border = THIN_BORDER
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9EAD3" },
    }
  })
  sheet.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2, column: COLUMNS.length },
  }

  for (const row of rows) {
    const values: Array<string | number | ""> = [
      row.identifier ?? "",
      row.operating_company,
      row.load_number ?? "",
      row.quantity ?? "",
      row.pallet_positions ?? "",
      row.weight_lbs ?? "",
      row.note ?? "",
      row.dispatch_person ?? "",
      row.pickup_locations,
      row.pickup_dates,
      row.pickup_times,
      row.drop_locations,
      row.drop_dates,
      row.drop_times,
      row.delivery_person ?? "",
      row.broker ?? "",
      row.load_type === "full" ? "Full" : "Partial",
      LAND_ORDER_STATUS_LABELS[row.status] ?? row.status,
    ]
    const excelRow = sheet.addRow(values)
    excelRow.alignment = { vertical: "top", wrapText: true }
    COLUMNS.forEach((column, index) => {
      const cell = excelRow.getCell(index + 1)
      cell.border = THIN_BORDER
      if ("number" in column) cell.numFmt = "#,##0.##"
    })
  }

  return workbook.xlsx.writeBuffer()
}

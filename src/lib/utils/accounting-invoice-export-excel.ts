/**
 * 陆运账单导出 Excel 生成器
 * 版式照业务 Google Sheets「Accouting 清单」：第1行大标题、第2行 7 组彩色分组表头、第3行 18 列 + 筛选
 */

import ExcelJS from 'exceljs'

export interface AccountingInvoiceExportRow {
  id: bigint
  company: string
  master_order_number: string | null
  order_number: string | null
  contract_date: Date | null
  contract_price: number | null
  bill_to: string | null
  broker_load_number: string | null
  billing_category: string | null
  invoice_number: string
  invoice_date: Date | null
  invoice_price: number | null
  check_date: Date | null
  check_amount: number | null
  check_number: string | null
  deduction: string | null
  rts: string | null
  difference: string | null
  notes: string | null
}

/** 18 列定义（与业务 Excel 同序） */
const COLUMNS: Array<{ header: string; width: number; type?: 'date' | 'money' | 'checkNumber' }> = [
  { header: '总货号', width: 10 },
  { header: '公司', width: 10 },
  { header: '货号', width: 8 },
  { header: '合同日期', width: 12, type: 'date' },
  { header: '合同金额', width: 12, type: 'money' },
  { header: 'Broker公司', width: 14 },
  { header: 'Load #', width: 12 },
  { header: '账单分类', width: 12 },
  { header: 'Invoice Number', width: 16 },
  { header: 'Invoice 日期', width: 12, type: 'date' },
  { header: 'Invoice 价格', width: 12, type: 'money' },
  { header: '支票日期', width: 12, type: 'date' },
  { header: '支票金额', width: 12, type: 'money' },
  { header: '支票号', width: 12, type: 'checkNumber' },
  { header: '扣', width: 8 },
  { header: 'RTS', width: 8 },
  { header: '差额', width: 10 },
  { header: '备注', width: 18 },
]

/** 第2行 7 个分组合并区间（1-based 列号）与底色（近似业务文件配色） */
const GROUP_HEADERS: Array<{ label: string; from: number; to: number; fill: string }> = [
  { label: '货号', from: 1, to: 3, fill: 'FFD9EAD3' },
  { label: '合同', from: 4, to: 5, fill: 'FFFFF2CC' },
  { label: 'Broker', from: 6, to: 8, fill: 'FFDDEBF7' },
  { label: 'Invoice', from: 9, to: 11, fill: 'FFFCE5CD' },
  { label: '支票', from: 12, to: 13, fill: 'FFF4CCCC' },
  { label: '会计', from: 14, to: 16, fill: 'FFD9D2E9' },
  { label: '备注', from: 17, to: 18, fill: 'FFEFEFEF' },
]

const DATE_NUM_FMT = 'yyyy-m-d'
const MONEY_NUM_FMT = '$#,##0.00'
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF999999' } },
  left: { style: 'thin', color: { argb: 'FF999999' } },
  bottom: { style: 'thin', color: { argb: 'FF999999' } },
  right: { style: 'thin', color: { argb: 'FF999999' } },
}

function colLetter(index: number): string {
  let n = index
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function toDateCell(value: Date | null): Date | '' {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d
}

export async function generateAccountingInvoiceExportExcel(rows: AccountingInvoiceExportRow[]): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Accouting 清单', {
    views: [{ state: 'frozen', ySplit: 3 }],
  })

  // 列宽
  sheet.columns = COLUMNS.map((col) => ({ width: col.width }))

  const lastCol = colLetter(COLUMNS.length)

  // 第1行：大标题（保留业务文件原拼写）
  sheet.mergeCells(`A1:${lastCol}1`)
  const titleCell = sheet.getCell('A1')
  titleCell.value = 'Accouting 清单'
  titleCell.font = { bold: true, size: 14 }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(1).height = 26

  // 第2行：分组表头（mergeCells 数字参数为 top/left/bottom/right，行在前列在后）
  for (const group of GROUP_HEADERS) {
    sheet.mergeCells(2, group.from, 2, group.to)
    const cell = sheet.getRow(2).getCell(group.from)
    cell.value = group.label
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    for (let c = group.from; c <= group.to; c++) {
      sheet.getRow(2).getCell(c).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: group.fill },
      }
      sheet.getRow(2).getCell(c).border = THIN_BORDER
    }
  }

  // 第3行：明细表头
  const headerRow = sheet.getRow(3)
  COLUMNS.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = col.header
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = THIN_BORDER
  })
  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: COLUMNS.length },
  }

  // 数据从第4行
  for (const row of rows) {
    const values: Array<string | number | Date | '' | null> = [
      row.master_order_number ?? '',
      row.company ?? '',
      row.order_number ?? '',
      toDateCell(row.contract_date),
      row.contract_price ?? '',
      row.bill_to ?? '',
      row.broker_load_number ?? '',
      row.billing_category ?? '',
      row.invoice_number ?? '',
      toDateCell(row.invoice_date),
      row.invoice_price ?? '',
      toDateCell(row.check_date),
      row.check_amount ?? '',
      // 支票号写文本：保留前导零与「内部帐」等文字值
      row.check_number == null ? '' : String(row.check_number),
      row.deduction ?? '',
      row.rts ?? '',
      row.difference ?? '',
      row.notes ?? '',
    ]
    const excelRow = sheet.addRow(values)
    COLUMNS.forEach((col, i) => {
      const cell = excelRow.getCell(i + 1)
      cell.border = THIN_BORDER
      if (col.type === 'date') cell.numFmt = DATE_NUM_FMT
      if (col.type === 'money') cell.numFmt = MONEY_NUM_FMT
      // 支票号列显式保持文本，防止 Excel 把 001489 转数字丢前导零
      if (col.type === 'checkNumber' && cell.value !== '') {
        cell.value = String(cell.value)
      }
    })
  }

  return workbook.xlsx.writeBuffer()
}

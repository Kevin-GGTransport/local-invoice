/**
 * 一次性迁移脚本：公司种子 + AA/YG 模版迁移
 * 按旧版硬编码 PDF 版式反向生成 .xlsx 样张（ExcelJS）→ 走真实解析器
 * parseTemplateXlsx 得到 grid → 附加字段绑定 → 落库为启用模版。
 * 运行：pnpm exec tsx scripts/seed-legacy-templates.ts
 */

import ExcelJS from 'exceljs'
import { PrismaClient } from '@prisma/client'
import { parseTemplateXlsx } from '../src/lib/templates/parse-xlsx'
import type { TemplateBinding } from '../src/lib/templates/types'

const prisma = new PrismaClient()

// ---------- 通用小工具 ----------

type BorderSpec = Partial<Record<'top' | 'right' | 'bottom' | 'left', number>>
interface CellSpec {
  row: number // 1-based Excel 行
  col: number // 1-based Excel 列
  text?: string
  bold?: boolean
  italic?: boolean
  fontSize?: number
  color?: string
  fill?: string
  borders?: BorderSpec
  borderColor?: string
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'middle' | 'bottom'
  wrap?: boolean
  spanCols?: number
  spanRows?: number
}

function borderStyle(widthPt: number): 'thin' | 'medium' | 'thick' {
  if (widthPt >= 3) return 'thick'
  if (widthPt >= 2) return 'medium'
  return 'thin'
}

function buildSheet(
  ws: ExcelJS.Worksheet,
  colWidthsPt: number[],
  rowHeightsPt: number[],
  cells: CellSpec[]
) {
  colWidthsPt.forEach((pt, i) => {
    ws.getColumn(i + 1).width = Math.round(((pt / 0.75 - 5) / 7) * 100) / 100
  })
  rowHeightsPt.forEach((pt, i) => {
    ws.getRow(i + 1).height = pt
  })
  for (const c of cells) {
    const cell = ws.getCell(c.row, c.col)
    if (c.spanCols && c.spanCols > 1) {
      ws.mergeCells(c.row, c.col, c.row, c.col + c.spanCols - 1)
    }
    if (c.spanRows && c.spanRows > 1) {
      ws.mergeCells(c.row, c.col, c.row + c.spanRows - 1, c.col)
    }
    if (c.text != null) cell.value = c.text
    cell.font = {
      bold: c.bold,
      italic: c.italic,
      size: c.fontSize ?? 10,
      color: c.color ? { argb: `FF${c.color.replace('#', '')}` } : undefined,
    }
    if (c.fill) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${c.fill.replace('#', '')}` } }
    }
    if (c.borders) {
      const edge = (w?: number) =>
        w == null ? undefined : { style: borderStyle(w), color: { argb: `FF${(c.borderColor ?? '#000000').replace('#', '')}` } }
      cell.border = {
        top: edge(c.borders.top),
        right: edge(c.borders.right),
        bottom: edge(c.borders.bottom),
        left: edge(c.borders.left),
      }
    }
    cell.alignment = {
      horizontal: c.align,
      vertical: c.valign ?? 'middle',
      wrapText: c.wrap,
    }
  }
}

async function buildGrid(cells: CellSpec[], colWidthsPt: number[], rowHeightsPt: number[]) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Invoice')
  buildSheet(ws, colWidthsPt, rowHeightsPt, cells)
  const buffer = await wb.xlsx.writeBuffer()
  return parseTemplateXlsx(Buffer.from(buffer))
}

// ---------- AA（橙色模版） ----------

const AA_ORANGE = '#F49B33'
const AA_ORANGE_LIGHT = '#FDE5CD'
const AA_ORANGE_LINE = '#F0B27A'
const AA_BLUE = '#1C4587'
const BLACK = '#000000'

// 列（内容宽 475pt）：c0 40 | c1 160 | c2 37.5 | c3 90 | c4 60 | c5 87.5
const AA_COLS = [40, 160, 37.5, 90, 60, 87.5]

function aaCells(): CellSpec[] {
  const cells: CellSpec[] = []
  // 页眉横条：两个合并单元格拼满整行，自带橙色底
  cells.push(
    { row: 1, col: 1, spanCols: 3, text: 'ALREADY ARRIVED LOGISTICS INC', bold: true, fontSize: 13, fill: AA_ORANGE },
    { row: 1, col: 4, spanCols: 3, text: 'INVOICE', italic: true, bold: true, fontSize: 30, color: AA_BLUE, align: 'right', fill: AA_ORANGE }
  )
  // 公司信息 + 单据信息
  cells.push(
    { row: 3, col: 1, spanCols: 3, text: 'ALREADY ARRIVED LOGISTICS INC', fontSize: 10 },
    { row: 4, col: 1, spanCols: 3, text: '4011 Berdina Rd', fontSize: 10 },
    { row: 5, col: 1, spanCols: 3, text: 'Castro Valley CA 94546', fontSize: 10 },
    { row: 3, col: 4, text: 'INVOICE NO.', bold: true, fontSize: 10, align: 'right' },
    { row: 4, col: 4, text: 'DATE', bold: true, fontSize: 10, align: 'right' },
    { row: 5, col: 4, text: 'Load no.', bold: true, fontSize: 10, align: 'right' },
    { row: 3, col: 5, spanCols: 2, fontSize: 10 },
    { row: 4, col: 5, spanCols: 2, fontSize: 10 },
    { row: 5, col: 5, spanCols: 2, fontSize: 10 }
  )
  // TO
  cells.push(
    { row: 7, col: 1, text: 'TO', bold: true, fontSize: 11 },
    { row: 7, col: 2, spanCols: 5, fontSize: 11 }
  )
  // PICKUPS | DROPS 黑框（左右各 237.5pt，高 96pt）
  cells.push(
    { row: 9, col: 1, spanCols: 2, text: 'PICKUPS', bold: true, fontSize: 11, borders: { top: 2, left: 2 }, borderColor: BLACK },
    { row: 9, col: 3, fontSize: 10, align: 'right', borders: { top: 2, right: 2 }, borderColor: BLACK },
    { row: 9, col: 4, spanCols: 2, text: 'DROPS', bold: true, fontSize: 11, borders: { top: 2 }, borderColor: BLACK },
    { row: 9, col: 6, fontSize: 10, align: 'right', borders: { top: 2, right: 2 }, borderColor: BLACK },
    { row: 10, col: 1, spanCols: 3, fontSize: 11, borders: { left: 2, right: 2 }, borderColor: BLACK },
    { row: 10, col: 4, spanCols: 3, fontSize: 11, borders: { right: 2 }, borderColor: BLACK },
    { row: 11, col: 1, spanCols: 3, fontSize: 9.5, wrap: true, valign: 'top', borders: { left: 2, right: 2 }, borderColor: BLACK },
    { row: 11, col: 4, spanCols: 3, fontSize: 9.5, wrap: true, valign: 'top', borders: { right: 2 }, borderColor: BLACK },
    { row: 12, col: 1, spanCols: 3, borders: { left: 2, right: 2, bottom: 2 }, borderColor: BLACK },
    { row: 12, col: 4, spanCols: 3, borders: { right: 2, bottom: 2 }, borderColor: BLACK }
  )
  // 明细表头 + 3 行占位（区域 15-17，运行时替换）
  cells.push(
    { row: 14, col: 1, spanCols: 4, text: 'DESCRIPTION', bold: true, fontSize: 10.5, fill: AA_ORANGE_LIGHT, borders: { top: 1, left: 1, right: 1, bottom: 1 }, borderColor: AA_ORANGE_LINE },
    { row: 14, col: 5, spanCols: 2, text: 'TOTAL', bold: true, fontSize: 10.5, align: 'right', fill: AA_ORANGE_LIGHT, borders: { top: 1, right: 1, bottom: 1 }, borderColor: AA_ORANGE_LINE }
  )
  for (let r = 15; r <= 17; r++) {
    cells.push(
      { row: r, col: 1, spanCols: 4, fontSize: 10, borders: { left: 1, right: 1, bottom: 1 }, borderColor: AA_ORANGE_LINE },
      { row: r, col: 5, spanCols: 2, fontSize: 10, align: 'right', borders: { right: 1, bottom: 1 }, borderColor: AA_ORANGE_LINE }
    )
  }
  // TOTAL DUE
  cells.push(
    { row: 19, col: 4, spanCols: 2, text: 'TOTAL DUE', bold: true, fontSize: 13, align: 'right' },
    { row: 19, col: 6, bold: true, fontSize: 13, align: 'center', valign: 'middle', fill: AA_ORANGE, color: '#FFFFFF' }
  )
  // 页脚
  cells.push(
    { row: 21, col: 1, spanCols: 3, text: 'DIRECT ALL INQUIRIES TO:', bold: true, fontSize: 8.5 },
    { row: 22, col: 1, spanCols: 3, text: 'ALREADY ARRIVED LOGISTICS INC', fontSize: 9 },
    { row: 23, col: 1, spanCols: 3, text: 'PHONE: 510-330-9581', fontSize: 9 },
    { row: 24, col: 1, spanCols: 3, text: 'EMAIL: Alreadyarrivedlogistics@gmail.com', fontSize: 9 },
    { row: 25, col: 4, spanCols: 3, text: 'THANK YOU FOR YOUR BUSINESS!', bold: true, fontSize: 10, align: 'right' }
  )
  return cells
}

const AA_ROWS = [44, 20, 16, 14, 14, 22, 18, 8, 18, 18, 32, 28, 18, 24, 24, 24, 24, 26, 30, 50, 12, 12, 12, 12, 12]

const AA_BINDING: TemplateBinding = {
  fields: {
    invoice_number: { cells: [{ row: 2, col: 4 }], format: 'text' },
    invoice_date: { cells: [{ row: 3, col: 4 }], format: 'date' },
    load_number: { cells: [{ row: 4, col: 4 }], format: 'text' },
    bill_to: { cells: [{ row: 6, col: 1 }], format: 'text' },
    total: { cells: [{ row: 18, col: 5 }], format: 'money' },
    pickup_date: { cells: [{ row: 8, col: 2 }], format: 'date' },
    pickup_company: { cells: [{ row: 9, col: 0 }], format: 'text' },
    pickup_address: { cells: [{ row: 10, col: 0 }], format: 'text' },
    drop_date: { cells: [{ row: 8, col: 5 }], format: 'date' },
    drop_company: { cells: [{ row: 9, col: 3 }], format: 'text' },
    drop_address: { cells: [{ row: 10, col: 3 }], format: 'text' },
  },
  lineItems: {
    startRow: 14, // 0-based：Excel 第 15 行
    endRow: 16,
    columns: { description: 0, amount: 4 },
    minRows: 12,
  },
}

// ---------- YG（粉色模版） ----------

const YG_PINK = '#F9CBD3'

// 列（内容宽 495pt）：c0 42 | c1 226 | c2 62 | c3 78 | c4 87
const YG_COLS = [70, 198, 62, 78, 87]

function ygCells(): CellSpec[] {
  const cells: CellSpec[] = []
  // 页眉粉色横条：两个合并单元格拼满整行
  cells.push(
    { row: 1, col: 1, spanCols: 2, text: 'YG Trucking LLC\nPO Box 6213', fontSize: 12, valign: 'middle', fill: YG_PINK },
    { row: 1, col: 3, spanCols: 3, text: 'Invoice', fontSize: 13, align: 'right', fill: YG_PINK }
  )
  // 地址 + Date/Invoice# 2×2 小表
  cells.push(
    { row: 3, col: 1, spanCols: 2, text: 'Hayward CA 94545', fontSize: 10 },
    { row: 3, col: 3, text: 'Date', bold: true, fontSize: 10, align: 'center', borders: { top: 1, left: 1 } },
    { row: 3, col: 4, spanCols: 2, text: 'Invoice #', bold: true, fontSize: 10, align: 'center', borders: { top: 1, left: 1, right: 1 } },
    { row: 4, col: 3, fontSize: 10, align: 'center', borders: { left: 1, bottom: 1 } },
    { row: 4, col: 4, spanCols: 2, fontSize: 10, align: 'center', borders: { left: 1, right: 1, bottom: 1 } }
  )
  // Bill To 方框
  cells.push(
    { row: 6, col: 1, spanCols: 2, text: 'Bill To:', fontSize: 10 },
    { row: 7, col: 1, spanCols: 2, fontSize: 11, borders: { top: 1, right: 1, bottom: 1, left: 1 } }
  )
  // Page 1 of 1
  cells.push({ row: 8, col: 3, spanCols: 3, text: 'Page 1 of 1', fontSize: 10, align: 'right' })
  // 明细表头 + 3 行占位（区域 10-12）
  cells.push(
    { row: 9, col: 1, spanCols: 2, text: 'Description', bold: true, fontSize: 10, align: 'center', fill: YG_PINK, borders: { top: 1, left: 1, right: 1, bottom: 1 } },
    { row: 9, col: 3, text: 'Qty', bold: true, fontSize: 10, align: 'center', fill: YG_PINK, borders: { top: 1, left: 1, right: 1, bottom: 1 } },
    { row: 9, col: 4, text: 'Rate', bold: true, fontSize: 10, align: 'center', fill: YG_PINK, borders: { top: 1, left: 1, right: 1, bottom: 1 } },
    { row: 9, col: 5, text: 'Amount', bold: true, fontSize: 10, align: 'center', fill: YG_PINK, borders: { top: 1, left: 1, right: 1, bottom: 1 } }
  )
  for (let r = 10; r <= 12; r++) {
    cells.push(
      { row: r, col: 1, spanCols: 2, fontSize: 10, borders: { left: 1, right: 1, bottom: 1 } },
      { row: r, col: 3, fontSize: 10, align: 'center', borders: { left: 1, right: 1, bottom: 1 } },
      { row: r, col: 4, fontSize: 10, align: 'right', borders: { left: 1, right: 1, bottom: 1 } },
      { row: r, col: 5, fontSize: 10, align: 'right', borders: { left: 1, right: 1, bottom: 1 } }
    )
  }
  // Total 行
  cells.push(
    { row: 13, col: 1, spanCols: 2, text: 'Thank you for your business', fontSize: 10, borders: { top: 1, left: 1, right: 1, bottom: 1 } },
    { row: 13, col: 3, text: 'Total', bold: true, fontSize: 10, align: 'center', borders: { top: 1, left: 1, right: 1, bottom: 1 } },
    { row: 13, col: 4, borders: { top: 1, left: 1, right: 1, bottom: 1 } },
    { row: 13, col: 5, fontSize: 10, align: 'right', borders: { top: 1, left: 1, right: 1, bottom: 1 } }
  )
  // Balance Due 行
  cells.push(
    { row: 14, col: 1, spanCols: 4, text: 'Balance Due', bold: true, fontSize: 13, align: 'right', borders: { top: 1, left: 1, bottom: 1 } },
    { row: 14, col: 5, fontSize: 12, align: 'right', borders: { top: 1, left: 1, right: 1, bottom: 1 } }
  )
  // 页脚 2×2 小表
  cells.push(
    { row: 16, col: 1, text: 'Phone#', fontSize: 9, align: 'center', borders: { top: 1, left: 1 } },
    { row: 16, col: 2, text: 'Email:', fontSize: 9, align: 'center', borders: { top: 1, left: 1, right: 1 } },
    { row: 17, col: 1, text: '(707) 293-4042', fontSize: 9, align: 'center', borders: { left: 1, bottom: 1 } },
    { row: 17, col: 2, text: 'dispatch@ygtrucking.llc', fontSize: 9, align: 'center', borders: { left: 1, right: 1, bottom: 1 } }
  )
  return cells
}

const YG_ROWS = [32, 10, 16, 16, 16, 14, 20, 16, 24, 22, 22, 22, 22, 26, 40, 22, 22]

const YG_BINDING: TemplateBinding = {
  fields: {
    invoice_date: { cells: [{ row: 3, col: 2 }], format: 'date' },
    invoice_number: { cells: [{ row: 3, col: 3 }], format: 'text' },
    bill_to: { cells: [{ row: 6, col: 0 }], format: 'text' },
    total: { cells: [{ row: 12, col: 4 }, { row: 13, col: 4 }], format: 'money' },
  },
  lineItems: {
    startRow: 9, // 0-based：Excel 第 10 行
    endRow: 11,
    columns: { description: 0, quantity: 2, unitPrice: 3, amount: 4 },
    minRows: 15,
  },
}

// ---------- 种子 ----------

const COMPANY_SEEDS = [
  { code: 'AA', name: 'ALREADY ARRIVED LOGISTICS INC', invoice_prefix: 'AA' },
  { code: 'YG', name: 'YG Trucking LLC', invoice_prefix: 'YG' },
  { code: 'G&G', name: 'G&G', invoice_prefix: 'GG' },
  { code: 'SFT', name: 'SFT', invoice_prefix: 'SFT' },
  { code: 'Old Pal', name: 'Old Pal', invoice_prefix: 'OP' },
  { code: 'Yuans', name: 'Yuans', invoice_prefix: 'YU' },
]

async function seedTemplate(
  companyCode: string,
  templateName: string,
  cells: CellSpec[],
  cols: number[],
  rows: number[],
  binding: TemplateBinding,
  margin: { top: number; right: number; bottom: number; left: number }
) {
  const company = await prisma.companies.findUnique({ where: { code: companyCode } })
  if (!company) throw new Error(`公司 ${companyCode} 不存在`)

  const parsed = await buildGrid(cells, cols, rows)
  const pageConfig = { ...parsed.pageConfig, margin }

  // 已有 active（重复执行脚本）→ 原地更新，保证幂等
  const existing = await prisma.invoice_templates.findFirst({
    where: { company_id: company.id, status: 'active' },
  })
  if (existing) {
    await prisma.invoice_templates.update({
      where: { id: existing.id },
      data: {
        name: templateName,
        page_config: pageConfig as unknown as object,
        grid_config: parsed.grid as unknown as object,
        binding_config: binding as unknown as object,
      },
    })
    console.log(`  模版已更新: ${templateName} (id=${existing.id})`)
  } else {
    const created = await prisma.invoice_templates.create({
      data: {
        company_id: company.id,
        name: templateName,
        status: 'active',
        page_config: pageConfig as unknown as object,
        grid_config: parsed.grid as unknown as object,
        binding_config: binding as unknown as object,
      },
    })
    console.log(`  模版已创建: ${templateName} (id=${created.id})`)
  }
}

async function main() {
  console.log('种子公司...')
  for (const c of COMPANY_SEEDS) {
    await prisma.companies.upsert({
      where: { code: c.code },
      update: { name: c.name, invoice_prefix: c.invoice_prefix },
      create: c,
    })
    console.log(`  ${c.code} → ${c.name}（前缀 ${c.invoice_prefix}）`)
  }

  console.log('迁移 AA 模版...')
  await seedTemplate('AA', 'AA 标准版', aaCells(), AA_COLS, AA_ROWS, AA_BINDING, {
    top: 46, right: 60, bottom: 40, left: 60,
  })

  console.log('迁移 YG 模版...')
  await seedTemplate('YG', 'YG 标准版', ygCells(), YG_COLS, YG_ROWS, YG_BINDING, {
    top: 50, right: 50, bottom: 50, left: 50,
  })

  console.log('完成。')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

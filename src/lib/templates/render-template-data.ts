/**
 * 账单模版 —— 渲染核心（纯函数）
 * 输入：解析后的网格 + 字段绑定 + 已格式化的业务数据；
 * 输出：静态单元格保留、绑定单元格替换文本、明细区域按容量语义渲染
 * （区域 = 令牌行 + 设计空行；明细数 ≤ 容量时逐行填值、下方零移动，
 * 超出容量时克隆令牌行增长、区域之后的行整体下移）。
 * HTML 预览与 PDF 渲染器消费同一输出，保证两者一致。
 */

import { autoFitRowHeights } from './auto-fit-row-heights'
import { containsFieldToken, replaceFieldToken } from './token-binding'
import type { TemplateBinding, TemplateFieldKey, TemplateGrid, TemplateRenderData } from './types'

const FIELD_VALUE_KEY: Record<string, keyof TemplateRenderData> = {
  invoice_number: 'invoiceNumber',
  invoice_date: 'invoiceDate',
  load_number: 'loadNumber',
  bill_to: 'billTo',
  total: 'total',
  pickup_date: 'pickupDate',
  pickup_company: 'pickupCompany',
  pickup_address: 'pickupAddress',
  drop_date: 'dropDate',
  drop_company: 'dropCompany',
  drop_address: 'dropAddress',
}

export function renderTemplateData(
  grid: TemplateGrid,
  binding: TemplateBinding | null,
  data: TemplateRenderData
): TemplateGrid {
  if (!binding) return grid

  // —— 1. 简单字段替换 ——
  // 含令牌的格只替换令牌部分（支持「Invoice No: {{发票号}}」标签+值模式）；
  // 不含令牌的旧数据整格替换。替换过值的格强制 wrap：
  // 下游排版走「多行 + 行高自适应」分支，永不缩字号。
  let cells = grid.cells.map((cell) => ({ ...cell, style: { ...cell.style } }))
  const replacedCoords = new Set<string>()
  for (const [key, fb] of Object.entries(binding.fields)) {
    if (!fb) continue
    const valueKey = FIELD_VALUE_KEY[key]
    if (!valueKey) continue
    const fieldKey = key as TemplateFieldKey
    const value = String(data[valueKey] ?? '')
    for (const anchor of fb.cells) {
      const target = cells.find((c) => c.row === anchor.row && c.col === anchor.col)
      if (!target) continue
      target.text = containsFieldToken(target.text, fieldKey)
        ? replaceFieldToken(target.text, fieldKey, value)
        : value
      target.style.wrap = true
      replacedCoords.add(`${target.row}:${target.col}`)
    }
  }

  // —— 2. 明细区域扩展（容量语义）——
  // 区域 = 令牌行 + 推导时并入的设计空行，regionRows 即模板设计容量。
  // 明细数 ≤ 容量：值填入区域既有行（保留原行高与样式），下方内容零移动，
  // 输出与模板逐像素一致；超出容量：增长行克隆令牌行，区域下方整体下移。
  const li = binding.lineItems
  if (!li) return autoFitRowHeights({ colWidths: grid.colWidths, rowHeights: grid.rowHeights, cells }, replacedCoords)

  const regionRows = li.endRow - li.startRow + 1
  const dataRows = Math.max(regionRows, data.lines.length)
  const rowShift = dataRows - regionRows
  const tokenRowHeight = grid.rowHeights[li.startRow] ?? 24

  const rowHeights: number[] = [
    ...grid.rowHeights.slice(0, li.endRow + 1),
    ...Array.from({ length: Math.max(0, dataRows - regionRows) }, () => tokenRowHeight),
    ...grid.rowHeights.slice(li.endRow + 1),
  ]

  // 区域内原始行保留（各自样式），仅区域下方整体下移
  cells = cells.flatMap((cell) => {
    if (cell.row <= li.endRow) return [cell]
    return [{ ...cell, row: cell.row + rowShift }]
  })

  const lineTexts: { col: number; text: (line: TemplateRenderData['lines'][number] | undefined) => string }[] = []
  if (li.columns.description != null) lineTexts.push({ col: li.columns.description, text: (l) => l?.description ?? '' })
  if (li.columns.quantity != null) lineTexts.push({ col: li.columns.quantity, text: (l) => l?.quantity ?? '' })
  if (li.columns.unitPrice != null) lineTexts.push({ col: li.columns.unitPrice, text: (l) => l?.unitPrice ?? '' })
  if (li.columns.amount != null) lineTexts.push({ col: li.columns.amount, text: (l) => l?.amount ?? '' })

  // 令牌行整行（含未绑定的装饰格）作为缺失格与增长行的克隆源
  const sourceCells = cells.filter((c) => c.row === li.startRow)

  for (let i = 0; i < dataRows; i++) {
    const line = data.lines[i]
    const row = li.startRow + i
    if (row <= li.endRow) {
      // 容量内：值写入既有单元格；该行缺失明细列单元格时从令牌行克隆
      for (const { col, text } of lineTexts) {
        let target = cells.find((c) => c.row === row && c.col === col)
        if (!target) {
          const src = sourceCells.find((c) => c.col === col)
          if (!src) continue
          target = { ...src, style: { ...src.style }, row, rowSpan: 1, text: '' }
          cells.push(target)
        }
        target.text = text(line)
        target.style.wrap = true
        replacedCoords.add(`${row}:${col}`)
      }
      continue
    }
    // 超容量增长行：克隆令牌行整行；rowSpan 钳为 1 避免纵向合并越界重叠
    for (const src of sourceCells) {
      const generated = { ...src, style: { ...src.style }, row, rowSpan: 1, text: '' }
      const textFn = lineTexts.find((t) => t.col === src.col)
      if (textFn) {
        generated.text = textFn.text(line)
        generated.style.wrap = true
        replacedCoords.add(`${row}:${src.col}`)
      } else if (src.text && i === 0) {
        // 区域退化（endRow < startRow）时的兜底：首行保留静态装饰文案
        generated.text = src.text
      }
      cells.push(generated)
    }
  }

  cells.sort((a, b) => a.row - b.row || a.col - b.col)
  return autoFitRowHeights({ colWidths: grid.colWidths, rowHeights, cells }, replacedCoords)
}

/** 供绑定向导 / 试打预览使用的示例数据 */
export function sampleTemplateRenderData(): TemplateRenderData {
  return {
    invoiceNumber: 'AA082026001',
    invoiceDate: '08/20/2026',
    loadNumber: '1234567890',
    billTo: 'SAMPLE BROKER LLC',
    total: '$1,125.00',
    pickupDate: '08/19/2026',
    pickupCompany: 'SAMPLE SHIPPER INC',
    pickupAddress: '123 Pickup St, City, ST 00000',
    dropDate: '08/20/2026',
    dropCompany: 'SAMPLE RECEIVER INC',
    dropAddress: '456 Drop Ave, City, ST 00000',
    lines: [
      { description: 'Carrier Charge', quantity: '1', unitPrice: '$925.00', amount: '$925.00' },
      { description: 'Lumper Fee', quantity: '1', unitPrice: '$200.00', amount: '$200.00' },
    ],
  }
}

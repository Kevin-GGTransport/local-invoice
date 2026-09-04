/**
 * 账单模版 —— 渲染核心（纯函数）
 * 输入：解析后的网格 + 字段绑定 + 已格式化的业务数据；
 * 输出：静态单元格保留、绑定单元格替换文本、明细区域按数据行扩展
 * （不足 minRows 补空行，超出自动增长，区域之后的行整体下移）。
 * HTML 预览与 PDF 渲染器消费同一输出，保证两者一致。
 */

import type { TemplateBinding, TemplateGrid, TemplateRenderData } from './types'

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
  let cells = grid.cells.map((cell) => ({ ...cell, style: { ...cell.style } }))
  for (const [key, fb] of Object.entries(binding.fields)) {
    if (!fb) continue
    const valueKey = FIELD_VALUE_KEY[key]
    if (!valueKey) continue
    for (const anchor of fb.cells) {
      const target = cells.find((c) => c.row === anchor.row && c.col === anchor.col)
      if (target) target.text = String(data[valueKey] ?? '')
    }
  }

  // —— 2. 明细区域扩展 ——
  const li = binding.lineItems
  if (!li) return { colWidths: grid.colWidths, rowHeights: grid.rowHeights, cells }

  const regionRows = li.endRow - li.startRow + 1
  const dataRows = Math.max(li.minRows, data.lines.length)
  const rowShift = dataRows - regionRows
  const lineRowHeight = grid.rowHeights[li.startRow] ?? 24

  // 区域首行作为行样式模板（含未绑定的装饰单元格也逐行克隆）
  const sourceCells = cells.filter((c) => c.row === li.startRow)

  const rowHeights: number[] = [
    ...grid.rowHeights.slice(0, li.startRow),
    ...Array.from({ length: dataRows }, () => lineRowHeight),
    ...grid.rowHeights.slice(li.endRow + 1),
  ]

  cells = cells.flatMap((cell) => {
    if (cell.row < li.startRow) return [cell]
    if (cell.row > li.endRow) return [{ ...cell, row: cell.row + rowShift }]
    return [] // 区域内原始占位行丢弃，由生成行替代
  })

  const lineTexts: Record<number, (line: TemplateRenderData['lines'][number] | undefined) => string> = {}
  if (li.columns.description != null) lineTexts[li.columns.description] = (l) => l?.description ?? ''
  if (li.columns.quantity != null) lineTexts[li.columns.quantity] = (l) => l?.quantity ?? ''
  if (li.columns.unitPrice != null) lineTexts[li.columns.unitPrice] = (l) => l?.unitPrice ?? ''
  if (li.columns.amount != null) lineTexts[li.columns.amount] = (l) => l?.amount ?? ''

  for (let i = 0; i < dataRows; i++) {
    const line = data.lines[i]
    for (const src of sourceCells) {
      const generated = { ...src, style: { ...src.style }, row: li.startRow + i, text: '' }
      const textFn = lineTexts[src.col]
      if (textFn) {
        generated.text = textFn(line)
      } else if (src.text) {
        // 区域行上的静态装饰单元格：保留但避免每行重复文案
        generated.text = i === 0 ? src.text : ''
      }
      cells.push(generated)
    }
  }

  cells.sort((a, b) => a.row - b.row || a.col - b.col)
  return { colWidths: grid.colWidths, rowHeights, cells }
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

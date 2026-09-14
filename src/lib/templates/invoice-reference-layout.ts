import type { ParsedTemplateWorkbook } from './parse-xlsx'
import type { TemplateCell, TemplateCellStyle, TemplateGrid } from './types'

/** Explicit AA/YG reference-image calibration, never applied to ordinary imports.
 * Reuses company/contact labels from the source; sample invoice data becomes tokens. */
export function calibrateInvoiceReference(parsed: ParsedTemplateWorkbook, preset: 'aa' | 'yg'): ParsedTemplateWorkbook {
  const original = parsed.grid
  const text = original.cells.map(c => c.text).join('\n')
  if (!(preset === 'aa' ? /ALREADY ARRIVED LOGISTICS INC/i : /YG Trucking LLC/i).test(text)) {
    throw new Error('上传文件的公司与参考版式不匹配，请选择保留 Excel 版式')
  }
  const cells: TemplateCell[] = []
  const sourceText = (row: number, col: number, fallback = '') => original.cells.find(c => c.row === row - parsed.origin.row && c.col === col - parsed.origin.col)?.text || fallback
  const base: TemplateCellStyle = { fontFamily: 'Arial', fontSize: 12, color: '#000000', valign: 'middle' }
  function add(row: number, col: number, rowSpan: number, colSpan: number, value: string, style: TemplateCellStyle = {}) {
    // Source coordinates are zero based; both references begin at B2.
    cells.push({ row: row - 1, col: col - 1, rowSpan, colSpan, text: value, style: { ...base, ...style } })
  }
  const blackBox = { top: 1, right: 1, bottom: 1, left: 1, color: '#000000' }
  let grid: TemplateGrid
  if (preset === 'yg') {
    const pink = '#FFE1F0'
    const heights = Array(37).fill(16)
    heights[0] = 23; heights[1] = 23; heights[2] = 24; heights[3] = 22; heights[4] = 18
    heights[5] = 22
    heights[12] = 54; heights[13] = 16; heights[14] = 24
    for (let r = 15; r <= 29; r++) heights[r] = 20.5
    heights[30] = 27; heights[31] = 30
    heights[32] = 18; heights[33] = 18; heights[34] = 18; heights[35] = 22; heights[36] = 22
    grid = { colWidths: [23.5, 22, 106.5, 94, 22, 69, 53, 53, 105.5], rowHeights: heights, cells }
    add(1, 1, 1, 8, sourceText(1, 1), { fill: pink, fontSize: 16 })
    add(2, 1, 1, 8, sourceText(2, 1), { fill: pink, fontSize: 16 })
    add(1, 9, 2, 1, 'Invoice', { fill: pink, fontSize: 22, halign: 'center' })
    add(3, 1, 1, 6, sourceText(3, 1), { fontSize: 16 })
    for (const [r, label, value] of [[3, 'Date', 'Invoice #'], [4, '{{发票日期}}', '{{发票号}}']] as const) {
      add(r, 7, 1, 2, label, { borders: blackBox, halign: 'center', fontSize: 14 })
      add(r, 9, 1, 1, value, { borders: blackBox, halign: 'center', fontSize: 14 })
    }
    add(6, 2, 1, 4, 'Bill To:', { borders: blackBox, fontSize: 14 })
    add(7, 2, 6, 4, '{{收款方}}', { borders: blackBox, fontSize: 14, valign: 'top', wrap: true })
    add(13, 7, 1, 3, 'Page 1 of 1', { halign: 'right', valign: 'bottom' })
    for (const [c, span, label] of [[1, 4, 'Description'], [5, 2, 'Qty'], [7, 2, 'Rate'], [9, 1, 'Amount']] as const) {
      add(15, c, 1, span, label, { borders: blackBox, fill: pink, fontSize: 16, halign: 'center' })
      for (let r = 16; r <= 30; r++) {
        const role = c === 1 ? '{{描述}}' : c === 5 ? '{{数量}}' : c === 7 ? '{{单价}}' : '{{金额}}'
        add(r, c, 1, span, r === 16 ? role : '', { borders: { left: 1, right: 1, color: '#000000' }, halign: c === 1 ? 'left' : c === 5 ? 'center' : 'right', valign: 'top', fontSize: 14 })
      }
    }
    add(31, 1, 1, 4, sourceText(31, 1), { borders: blackBox, fontSize: 14 })
    add(31, 5, 1, 3, 'Total', { borders: { top: 1, bottom: 1, left: 1 }, fontSize: 18 })
    add(31, 8, 1, 2, '{{合计}}', { borders: { top: 1, bottom: 1, right: 1 }, halign: 'right', fontSize: 14 })
    add(32, 5, 1, 3, 'Balance Due', { borders: { bottom: 1, left: 1 }, fontSize: 21 })
    add(32, 8, 1, 2, '{{合计}}', { borders: { bottom: 1, right: 1 }, halign: 'right', fontSize: 14 })
    for (const r of [36, 37]) {
      add(r, 2, 1, 2, sourceText(r, 2), { borders: blackBox, halign: 'center', fontSize: 14 })
      add(r, 4, 1, 3, sourceText(r, 4), { borders: blackBox, halign: 'center', fontSize: 14 })
    }
  } else {
    const orange = '#F79646', pale = '#FDEFE9'
    const heights = Array(42).fill(18)
    heights[0] = 56; heights[1] = 14; heights[9] = 18; heights[10] = 18
    for (let r = 12; r <= 18; r++) heights[r] = 20
    heights[20] = 16
    for (let r = 22; r <= 35; r++) heights[r] = 15
    heights[36] = 24; heights[37] = 16; heights[39] = 20
    grid = { colWidths: [125, 168, 35, 77, 168], rowHeights: heights, cells }
    add(1, 1, 1, 4, sourceText(1, 1), { fill: '#F89D55', fontSize: 18 })
    add(1, 5, 1, 1, 'INVOICE', { fill: '#F89D55', color: '#003366', fontSize: 40, halign: 'right' })
    for (const r of [3, 4, 5]) add(r, 1, 1, 2, sourceText(r, 1))
    for (const [r, label, token] of [[4, 'INVOICE NO.', '{{发票号}}'], [5, 'DATE', '{{发票日期}}'], [6, 'Load no.', '{{Load No.}}']] as const) {
      add(r, 3, 1, 2, label, { fontSize: 16, bold: true, halign: 'right' })
      add(r, 5, 1, 1, token)
    }
    add(8, 1, 1, 2, 'TO', { fontSize: 16, bold: true })
    add(9, 1, 2, 2, '{{收款方}}', { fontSize: 14, valign: 'top', wrap: true })
    for (let r = 12; r <= 19; r++) for (let c = 1; c <= 5; c++) {
      add(r, c, 1, 1, '', { borders: { ...(r === 12 ? { top: 1.5 } : {}), ...(r === 19 ? { bottom: 1.5 } : {}), ...(c === 1 ? { left: 1.5 } : {}), ...(c === 5 ? { right: 1.5 } : {}) } })
    }
    // Overlay values using the same cells, retaining their perimeter borders.
    const put = (r: number, c: number, value: string, extra: TemplateCellStyle = {}) => {
      const cell = cells.find(x => x.row === r - 1 && x.col === c - 1)!
      cell.text = value; Object.assign(cell.style, extra)
    }
    put(12, 1, 'PICKUPS', { bold: true, fontSize: 14 })
    put(12, 2, '{{取货日期}}', { halign: 'center' })
    put(12, 3, 'DROPS', { bold: true, fontSize: 14 })
    put(12, 5, '{{交货日期}}', { halign: 'center' })
    put(13, 1, '{{取货公司}}'); put(13, 3, '{{交货公司}}')
    put(14, 1, '{{取货地址}}'); put(14, 3, '{{交货地址}}')
    // Merge address blocks so bound values wrap within their own pickup/drop side.
    for (const [r, c, span, rows] of [[13, 1, 2, 1], [13, 3, 3, 1], [14, 1, 2, 3], [14, 3, 3, 3], [12, 3, 2, 1]] as const) {
      const anchor = cells.find(x => x.row === r - 1 && x.col === c - 1)!
      for (let i = cells.length - 1; i >= 0; i--) {
        const cell = cells[i]
        if (cell !== anchor && cell.row >= r - 1 && cell.row < r - 1 + rows && cell.col >= c - 1 && cell.col < c - 1 + span) cells.splice(i, 1)
      }
      anchor.colSpan = span; anchor.rowSpan = rows
      if (c === 3 && r !== 12) anchor.style.borders = { right: 1.5 }
      anchor.style.valign = 'top'; anchor.style.wrap = r !== 12
    }
    add(21, 1, 1, 5, '', { fill: orange })
    for (let r = 22; r <= 36; r++) {
      const fill = r % 2 === 0 ? pale : '#FFFFFF'
      const borders = { top: 0.75, bottom: 0.75, color: orange }
      add(r, 1, 1, 4, r === 22 ? 'DESCRIPTION' : r === 23 ? '{{描述}}' : '', { fill, borders: { ...borders, left: 0.75 } })
      add(r, 5, 1, 1, r === 22 ? 'TOTAL' : r === 23 ? '{{金额}}' : '', { fill, borders: { ...borders, right: 0.75 }, halign: r === 22 ? 'left' : 'right' })
    }
    add(37, 3, 1, 2, 'TOTAL DUE', { bold: true, fontSize: 14, halign: 'right' })
    add(37, 5, 1, 1, '{{合计}}', { fill: orange, color: '#FFFFFF', bold: true, halign: 'right', fontSize: 14 })
    add(39, 1, 1, 2, sourceText(39, 1), { bold: true })
    add(40, 1, 1, 2, sourceText(40, 1))
    add(41, 1, 1, 2, sourceText(41, 1))
    add(42, 1, 1, 2, sourceText(42, 1))
    add(42, 3, 1, 3, sourceText(42, 3), { bold: true })
  }
  return { grid, origin: { row: 1, col: 1 }, pageConfig: { ...parsed.pageConfig, size: 'A4', orientation: 'portrait', margin: { top: 18, bottom: 18, left: 18, right: 18 }, textStyle: 'template', fontFamily: 'Helvetica' } }
}

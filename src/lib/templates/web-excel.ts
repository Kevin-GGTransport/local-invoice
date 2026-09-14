import { createHash } from 'node:crypto'
import { parseTemplateXlsx } from './parse-xlsx'
import { nativeSourceBytes, validateNativeBinding, NativeExcelError, readWorkbook } from './native-excel'
import { isNativeExcelGrid, type NativeExcelGrid, type NativeExcelSource } from './native-excel-types'
import { FIELD_TOKENS, DETAIL_TOKENS, containsFieldToken, deriveBindingFromGrid } from './token-binding'
import { validateTemplateGrid } from './template-grid'
import type { TemplateBinding, TemplateFieldKey, TemplateGrid } from './types'

/** Archive only. Unlike nativeExcel, this does not select a renderer. */
export type WebExcelGrid = TemplateGrid & { sourceExcel?: NativeExcelSource }
export function excelSource(grid: unknown): NativeExcelSource | undefined {
  if (isNativeExcelGrid(grid)) return grid.nativeExcel
  if (grid && typeof grid === 'object' && 'sourceExcel' in grid) {
    const source = (grid as WebExcelGrid).sourceExcel
    if (source?.version === 1) return source
  }
}

export function archiveExcel(bytes: Buffer, filename: string): NativeExcelSource {
  return { version: 1, filename, base64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex'), sheetName: '' }
}

/** Never print cached formula results after changing their inputs. Values in
 * explicitly bound cells are replaced by business data and are safe to flatten. */
export async function assertWebExcelCompatible(bytes: Buffer, binding?: TemplateBinding) {
  const workbook = await readWorkbook(bytes)
  const safe = new Set<string>()
  for (const field of Object.values(binding?.fields ?? {})) for (const p of field?.cells ?? []) safe.add(`${p.row}:${p.col}`)
  if (binding?.lineItems) {
    const li = binding.lineItems
    for (let row = li.startRow; row <= li.endRow; row++) for (const col of Object.values(li.columns)) if (col != null) safe.add(`${row}:${col}`)
  }
  workbook.worksheets[0]?.eachRow(row => row.eachCell(cell => {
    if (cell.isMerged && cell.master.address !== cell.address) return
    if (cell.formula && !safe.has(`${Number(cell.row) - 1}:${Number(cell.col) - 1}`)) {
      throw new NativeExcelError(`${cell.address} 含未绑定的公式，网页 PDF 不会重新计算。请将该结果单元格绑定到合计等业务变量，或下载 Excel 打印`)
    }
  }))
}

/** Project saved address bindings into tokens on a disposable parsed grid.
 * Crop offsets are explicit; unsupported bindings fail rather than silently move. */
export async function nativeToWebTemplate(source: NativeExcelGrid, binding: TemplateBinding) {
  await validateNativeBinding(source, binding)
  await assertWebExcelCompatible(nativeSourceBytes(source), binding)
  const parsed = await parseTemplateXlsx(nativeSourceBytes(source)).catch(err => { throw new NativeExcelError(err instanceof Error ? err.message : '无法解析网页模板') })
  const { grid, origin } = parsed
  function cellAt(row: number, col: number) {
    row -= origin.row; col -= origin.col
    if (row < 0 || col < 0 || row >= grid.rowHeights.length || col >= grid.colWidths.length) {
      throw new NativeExcelError('绑定超出网页模板打印范围，请调整 Excel 打印区域后重新上传')
    }
    let cell = grid.cells.find(c => c.row === row && c.col === col)
    if (!cell) {
      cell = { row, col, rowSpan: 1, colSpan: 1, text: '', style: {} }
      grid.cells.push(cell)
    }
    return cell
  }
  for (const [key, field] of Object.entries(binding.fields)) {
    for (const point of field?.cells ?? []) {
      const cell = cellAt(point.row, point.col)
      if (!containsFieldToken(cell.text, key as TemplateFieldKey)) cell.text = FIELD_TOKENS[key as TemplateFieldKey]
    }
  }
  if (binding.lineItems) {
    const li = binding.lineItems
    for (const [key, col] of Object.entries(li.columns)) {
      if (col == null) continue
      for (let row = li.startRow; row <= li.endRow; row++) {
        cellAt(row, col).text = row === li.startRow ? DETAIL_TOKENS[key as keyof typeof DETAIL_TOKENS] : ''
      }
    }
  }
  const derived = deriveBindingFromGrid(grid)
  const errors = [...derived.errors, ...validateTemplateGrid(grid, derived.binding)]
  if (errors.length) throw new NativeExcelError(`无法转为网页模板：${errors[0]}`)
  return { ...parsed, grid: { ...grid, sourceExcel: source.nativeExcel } as WebExcelGrid, binding: derived.binding }
}

/**
 * 账单模版 —— .xlsx 样张解析器
 * 读取第一个 sheet 的合并单元格、单元格样式、列宽、行高，
 * 归一化为 TemplateGrid（宽高单位 pt）。
 * 约束：仅 .xlsx / ≤5MB / ≤80 行 × 30 列 / 暂不支持 CJK 字符。
 */

import ExcelJS from 'exceljs'
import { BORDER_WIDTH_PT, EXCEL_BORDER_TO_LINE } from './border-style'
import { parseExcelThemeColors, resolveSpreadsheetColor, type SpreadsheetColor } from './color'
import { trimGridToContent } from './template-grid'
import type {
  TemplateBorderLineStyle,
  TemplateCell,
  TemplateCellStyle,
  TemplateGrid,
  TemplatePageConfig,
} from './types'

export const TEMPLATE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024
export const TEMPLATE_MAX_ROWS = 80
export const TEMPLATE_MAX_COLS = 30

/** Excel 列宽（字符数）→ 像素 → pt；无宽度信息的列按默认 64px */
function excelColWidthToPt(width: number | undefined): number {
  if (width == null || !Number.isFinite(width) || width <= 0) return 48
  const px = Math.round(width * 7 + 5)
  return Math.round(px * 0.75 * 10) / 10
}

/** Excel 行高本身就是 pt；默认 15pt（20px） */
const DEFAULT_ROW_HEIGHT = 15

/** Excel 边框样式 → 近似 pt 宽度 */
function borderWidthPt(style: string | undefined): number | undefined {
  const line = style != null ? EXCEL_BORDER_TO_LINE[style] : undefined
  return line == null ? undefined : BORDER_WIDTH_PT[line]
}

function inchesToPt(value: number | undefined, fallback: number): number {
  return value != null && Number.isFinite(value) && value >= 0
    ? Math.round(value * 72 * 10) / 10
    : fallback
}

function pageSizeFromWorksheet(ws: ExcelJS.Worksheet): TemplatePageConfig['size'] {
  // ExcelJS PaperSize: Letter=1, A4=9. Other sizes currently fall back to A4.
  return Number(ws.pageSetup.paperSize) === 1 ? 'LETTER' : 'A4'
}


/** 解析 'A1:B2' 形式的合并区域为 0 起始索引 */
function parseMergeRange(range: string): { r1: number; c1: number; r2: number; c2: number } | null {
  const m = range.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/)
  if (!m) return null
  const colToIdx = (s: string) =>
    s.split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1
  const r1 = parseInt(m[2], 10) - 1
  const c1 = colToIdx(m[1])
  const r2 = m[4] ? parseInt(m[4], 10) - 1 : r1
  const c2 = m[3] ? colToIdx(m[3]) : c1
  return { r1, c1, r2, c2 }
}

export interface ParsedTemplateWorkbook {
  pageConfig: TemplatePageConfig
  grid: TemplateGrid
}

export async function parseTemplateXlsx(buffer: Buffer | ArrayBuffer): Promise<ParsedTemplateWorkbook> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buffer as ArrayBuffer)
  } catch {
    throw new Error('无法解析该文件，请确认为有效的 .xlsx 文件（不支持 .xls）')
  }
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('文件中不包含工作表')
  const themes = (wb.model as unknown as { themes?: Record<string, string> }).themes
  const themeColors = parseExcelThemeColors(themes?.theme1 ?? Object.values(themes ?? {})[0])

  // 合并区域：锚点 → span；非锚点被覆盖格跳过
  const covered = new Set<string>()
  const anchorSpan = new Map<string, { rowSpan: number; colSpan: number }>()
  const merges: string[] = (ws.model?.merges ?? []) as string[]
  for (const range of merges) {
    const r = parseMergeRange(range)
    if (!r) continue
    anchorSpan.set(`${r.r1}:${r.c1}`, {
      rowSpan: r.r2 - r.r1 + 1,
      colSpan: r.c2 - r.c1 + 1,
    })
    for (let ri = r.r1; ri <= r.r2; ri++) {
      for (let ci = r.c1; ci <= r.c2; ci++) {
        if (ri !== r.r1 || ci !== r.c1) covered.add(`${ri}:${ci}`)
      }
    }
  }

  // 显式打印区域是 Excel 对版式边界的权威声明，即使尾部只有空白也必须保留。
  const printArea = ws.pageSetup.printArea
  const printRanges = typeof printArea === 'string'
    ? printArea.split(/[;,]/).map((range) => range.replace(/^.*!/, '').replaceAll('$', ''))
    : []

  // 先收集单元格，得到实际占用范围
  const collected: TemplateCell[] = []
  let maxRow = 0
  let maxCol = 0

  ws.eachRow({ includeEmpty: true }, (row, rowNum) => {
    const r = rowNum - 1
    if (r >= TEMPLATE_MAX_ROWS) return
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const c = colNum - 1
      if (c >= TEMPLATE_MAX_COLS) return
      if (covered.has(`${r}:${c}`)) return

      const font = cell.style?.font as ExcelJS.Font | undefined
      const fill = cell.style?.fill as
        | { pattern?: string; patternType?: string; fgColor?: SpreadsheetColor }
        | undefined
      const border = cell.style?.border as
        | Record<string, { style?: string; color?: SpreadsheetColor }>
        | undefined
      const alignment = cell.style?.alignment as
        | { horizontal?: string; vertical?: string; wrapText?: boolean }
        | undefined

      const rawText = typeof cell.text === 'string' ? cell.text : cell.value == null ? '' : String(cell.text)
      const fillPattern = fill?.pattern ?? fill?.patternType
      const fillColor = fillPattern === 'solid' && fill ? resolveSpreadsheetColor(fill.fgColor, themeColors) : null
      const hasBorder =
        border && [border.top, border.right, border.bottom, border.left].some((e) => e?.style)
      const fontColor = font ? resolveSpreadsheetColor(font.color as SpreadsheetColor | undefined, themeColors) : null
      const hasFont = font && (font.bold || font.italic || font.underline || font.strike || font.size || fontColor)
      const hasAlign = alignment && (alignment.horizontal || alignment.vertical || alignment.wrapText)

      if (!rawText && !fillColor && !hasBorder && !hasFont && !hasAlign) return

      const style: TemplateCellStyle = {}
      if (font?.bold) style.bold = true
      if (font?.italic) style.italic = true
      if (font?.underline) style.underline = true
      if (font?.strike) style.strike = true
      if (font?.size) style.fontSize = font.size
      if (font?.name) style.fontFamily = font.name
      if (fontColor) style.color = fontColor
      if (fillColor) style.fill = fillColor
      if (hasBorder) {
        const borders: Record<string, number> = {}
        const borderStyles: Record<string, TemplateBorderLineStyle> = {}
        const sides = ['top', 'right', 'bottom', 'left'] as const
        for (const side of sides) {
          const rawStyle = border?.[side]?.style
          if (rawStyle == null) continue
          const w = borderWidthPt(rawStyle)
          if (w != null) borders[side] = w
          const line = EXCEL_BORDER_TO_LINE[rawStyle]
          if (line) borderStyles[side] = line
        }
        if (Object.keys(borders).length > 0) {
          const bc = sides
            .map((side) => resolveSpreadsheetColor(border?.[side]?.color, themeColors))
            .find((color) => color != null)
          style.borders = {
            ...borders,
            ...(bc ? { color: bc } : {}),
            ...(Object.keys(borderStyles).length > 0 ? { styles: borderStyles } : {}),
          }
        }
      }
      if (
        alignment?.horizontal === 'left' ||
        alignment?.horizontal === 'center' ||
        alignment?.horizontal === 'right'
      ) {
        style.halign = alignment.horizontal
      }
      if (
        alignment?.vertical === 'top' ||
        alignment?.vertical === 'middle' ||
        alignment?.vertical === 'bottom'
      ) {
        style.valign = alignment.vertical
      }
      if (alignment?.wrapText) style.wrap = true

      const span = anchorSpan.get(`${r}:${c}`) ?? { rowSpan: 1, colSpan: 1 }
      collected.push({ row: r, col: c, rowSpan: span.rowSpan, colSpan: span.colSpan, text: rawText, style })
      maxRow = Math.max(maxRow, r + span.rowSpan - 1)
      maxCol = Math.max(maxCol, c + span.colSpan - 1)
    })
  })

  if (collected.length === 0) throw new Error('样张内容为空，请上传包含版式的 Excel 账单样张')

  // 合并区域可能超出有样式单元格的范围
  for (const range of merges) {
    const r = parseMergeRange(range)
    if (r) {
      maxRow = Math.max(maxRow, Math.min(r.r2, TEMPLATE_MAX_ROWS - 1))
      maxCol = Math.max(maxCol, Math.min(r.c2, TEMPLATE_MAX_COLS - 1))
    }
  }
  for (const range of printRanges) {
    const r = parseMergeRange(range)
    if (r) {
      maxRow = Math.max(maxRow, Math.min(r.r2, TEMPLATE_MAX_ROWS - 1))
      maxCol = Math.max(maxCol, Math.min(r.c2, TEMPLATE_MAX_COLS - 1))
    }
  }

  // 列宽 / 行高（截断到实际占用范围）
  const colCount = Math.min(maxCol + 1, TEMPLATE_MAX_COLS)
  const rowCount = Math.min(maxRow + 1, TEMPLATE_MAX_ROWS)
  const colWidths: number[] = []
  for (let i = 0; i < colCount; i++) {
    colWidths.push(excelColWidthToPt(ws.getColumn(i + 1).width))
  }
  const rowHeights: number[] = []
  for (let i = 0; i < rowCount; i++) {
    const h = ws.getRow(i + 1).height
    rowHeights.push(h != null && Number.isFinite(h) && h > 0 ? h : DEFAULT_ROW_HEIGHT)
  }

  const rawGrid: TemplateGrid = { colWidths, rowHeights, cells: collected }
  const area = printRanges.length > 0 ? parseMergeRange(printRanges[0]) : null
  const printGrid = area
    ? {
        colWidths: colWidths.slice(area.c1, area.c2 + 1),
        rowHeights: rowHeights.slice(area.r1, area.r2 + 1),
        cells: collected
          .filter((cell) => cell.row >= area.r1 && cell.row <= area.r2 && cell.col >= area.c1 && cell.col <= area.c2)
          .map((cell) => ({ ...cell, row: cell.row - area.r1, col: cell.col - area.c1 })),
      }
    : null

  const margins = ws.pageSetup.margins
  return {
    pageConfig: {
      size: pageSizeFromWorksheet(ws),
      orientation: ws.pageSetup.orientation === 'landscape' ? 'landscape' : 'portrait',
      margin: {
        top: inchesToPt(margins?.top, 24),
        right: inchesToPt(margins?.right, 24),
        bottom: inchesToPt(margins?.bottom, 24),
        left: inchesToPt(margins?.left, 24),
      },
      fontFamily: 'Noto Sans SC',
      baseFontSize: 10,
      textColor: '#000000',
    },
    // 丢弃内容框外的"幽灵样式"空格（Excel 中对大片空白区域设过边框/填充），
    // 避免编辑器与打印 PDF 出现巨大的空网格
    grid: printGrid ?? trimGridToContent(rawGrid),
  }
}

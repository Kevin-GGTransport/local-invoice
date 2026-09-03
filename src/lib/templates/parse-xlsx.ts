/**
 * 账单模版 —— .xlsx 样张解析器
 * 读取第一个 sheet 的合并单元格、单元格样式、列宽、行高，
 * 归一化为 TemplateGrid（宽高单位 pt）。
 * 约束：仅 .xlsx / ≤5MB / ≤80 行 × 30 列 / 暂不支持 CJK 字符。
 */

import ExcelJS from 'exceljs'
import type {
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

/** ARGB / RGB → #RRGGBB；主题色无法静态解析，返回 null 走默认色 */
function colorToHex(color: { argb?: string; rgb?: string; theme?: number } | undefined): string | null {
  const v = color?.argb ?? color?.rgb
  if (typeof v !== 'string' || !/^[0-9A-Fa-f]{6}$|^[0-9A-Fa-f]{8}$/.test(v)) return null
  const hex = v.length === 8 ? v.slice(2) : v
  return `#${hex.toUpperCase()}`
}

/** Excel 边框样式 → 近似 pt 宽度 */
function borderWidthPt(style: string | undefined): number | undefined {
  switch (style) {
    case 'hair':
    case 'dotted':
    case 'dashed':
    case 'dashDot':
    case 'dashDotDot':
    case 'slantDashDot':
      return 0.5
    case 'thin':
      return 1
    case 'medium':
      return 2
    case 'thick':
      return 3
    case 'double':
      return 2.5
    default:
      return undefined
  }
}

const CJK_RE = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/

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

  // 先收集单元格，得到实际占用范围
  const collected: TemplateCell[] = []
  let maxRow = 0
  let maxCol = 0
  const allTexts: string[] = []

  ws.eachRow({ includeEmpty: true }, (row, rowNum) => {
    const r = rowNum - 1
    if (r >= TEMPLATE_MAX_ROWS) return
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const c = colNum - 1
      if (c >= TEMPLATE_MAX_COLS) return
      if (covered.has(`${r}:${c}`)) return

      const font = cell.style?.font as ExcelJS.Font | undefined
      const fill = cell.style?.fill as
        | { pattern?: string; patternType?: string; fgColor?: { argb?: string; rgb?: string; theme?: number } }
        | undefined
      const border = cell.style?.border as
        | Record<string, { style?: string; color?: { argb?: string; rgb?: string } }>
        | undefined
      const alignment = cell.style?.alignment as
        | { horizontal?: string; vertical?: string; wrapText?: boolean }
        | undefined

      const rawText = typeof cell.text === 'string' ? cell.text : cell.value == null ? '' : String(cell.text)
      const fillPattern = fill?.pattern ?? fill?.patternType
      const fillColor = fillPattern === 'solid' && fill ? colorToHex(fill.fgColor) : null
      const hasBorder =
        border && [border.top, border.right, border.bottom, border.left].some((e) => e?.style)
      const fontColor = font ? colorToHex(font.color) : null
      const hasFont = font && (font.bold || font.italic || font.size || fontColor)
      const hasAlign = alignment && (alignment.horizontal || alignment.vertical || alignment.wrapText)

      if (!rawText && !fillColor && !hasBorder && !hasFont && !hasAlign) return

      const style: TemplateCellStyle = {}
      if (font?.bold) style.bold = true
      if (font?.italic) style.italic = true
      if (font?.size) style.fontSize = font.size
      if (fontColor) style.color = fontColor
      if (fillColor) style.fill = fillColor
      if (hasBorder) {
        const borders: Record<string, number> = {}
        const sides = ['top', 'right', 'bottom', 'left'] as const
        for (const side of sides) {
          const w = borderWidthPt(border?.[side]?.style)
          if (w != null) borders[side] = w
        }
        if (Object.keys(borders).length > 0) {
          const bc = colorToHex(border?.top?.color) ?? colorToHex(border?.bottom?.color)
          style.borders = { ...borders, ...(bc ? { color: bc } : {}) }
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
      if (rawText) allTexts.push(rawText)
      maxRow = Math.max(maxRow, r + span.rowSpan - 1)
      maxCol = Math.max(maxCol, c + span.colSpan - 1)
    })
  })

  if (collected.length === 0) throw new Error('样张内容为空，请上传包含版式的 Excel 账单样张')
  if (CJK_RE.test(allTexts.join(''))) {
    throw new Error('样张包含中文字符，当前版本 PDF 仅支持英文字体，请先移除中文内容')
  }

  // 合并区域可能超出有样式单元格的范围
  for (const range of merges) {
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

  return {
    pageConfig: {
      size: 'A4',
      margin: { top: 24, right: 24, bottom: 24, left: 24 },
      fontFamily: 'Helvetica',
      baseFontSize: 10,
      textColor: '#000000',
    },
    grid: { colWidths, rowHeights, cells: collected },
  }
}

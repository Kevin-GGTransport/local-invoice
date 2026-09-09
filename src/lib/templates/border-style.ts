/**
 * 账单模版 —— 边框线型/宽度映射（单一来源）
 * parse-xlsx（ExcelJS 线型字符串）、univer-bridge（Univer BorderStyleType）、
 * PDF/HTML 渲染（宽度与线型）共用，禁止在其他位置各自定义映射。
 */

import type { TemplateBorderLineStyle } from './types'

/** 线型 → 近似 pt 宽度（导入与桥接反向换算共用） */
export const BORDER_WIDTH_PT: Record<TemplateBorderLineStyle, number> = {
  thin: 1,
  medium: 2,
  thick: 3,
  dashed: 0.5,
  dotted: 0.5,
  double: 2.5,
}

/** 只有宽度没有线型时，按宽度反推线型 */
export function widthToLineStyle(widthPt: number): TemplateBorderLineStyle {
  if (widthPt >= 3) return 'thick'
  if (widthPt >= 2) return 'medium'
  return 'thin'
}

/** ExcelJS / Univer 共用的线型字符串 → 模板线型 */
export const EXCEL_BORDER_TO_LINE: Record<string, TemplateBorderLineStyle> = {
  thin: 'thin',
  medium: 'medium',
  thick: 'thick',
  double: 'double',
  dotted: 'dotted',
  dashed: 'dashed',
  hair: 'dashed',
  dashDot: 'dashed',
  dashDotDot: 'dashed',
  slantDashDot: 'dashed',
  mediumDashed: 'dashed',
  mediumDashDot: 'dashed',
  mediumDashDotDot: 'dashed',
}

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

/** 线型 → CSS border-style；double 用 CSS 原生支持 */
export const CSS_BORDER_STYLE: Record<TemplateBorderLineStyle, string> = {
  thin: 'solid',
  medium: 'solid',
  thick: 'solid',
  dashed: 'dashed',
  dotted: 'dotted',
  double: 'double',
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

/** 模板线型 → Univer BorderStyleTypes 数值枚举（0.25.1 契约：1=thin 3=dotted 4=dashed 7=double 8=medium 13=thick） */
export const TEMPLATE_LINE_TO_UNIVER_ENUM: Record<TemplateBorderLineStyle, number> = {
  thin: 1,
  medium: 8,
  thick: 13,
  dashed: 4,
  dotted: 3,
  double: 7,
}

/** Univer BorderStyleTypes 数值枚举 → 模板线型（hair/dashDot 等变体归一化到 dashed；0=NONE 不映射） */
export const UNIVER_ENUM_TO_LINE: Record<number, TemplateBorderLineStyle> = {
  1: 'thin',
  2: 'dashed',
  3: 'dotted',
  4: 'dashed',
  5: 'dashed',
  6: 'dashed',
  7: 'double',
  8: 'medium',
  9: 'dashed',
  10: 'dashed',
  11: 'dashed',
  12: 'dashed',
  13: 'thick',
}

/**
 * 账单模版 —— 共享类型定义与可绑定字段注册表
 * grid_config / binding_config 的 JSON 结构以本文件为唯一契约，
 * 上传解析、绑定向导、HTML 预览、PDF 渲染全部消费同一套结构。
 */

/** 页面配置（PDF 与预览共用，单位 pt） */
export interface TemplatePageConfig {
  size: 'A4' | 'LETTER'
  margin: { top: number; right: number; bottom: number; left: number }
  fontFamily: string
  baseFontSize: number
  textColor: string
}

/** 单元格边框（宽度单位 pt） */
export interface TemplateCellBorders {
  top?: number
  right?: number
  bottom?: number
  left?: number
  color?: string
}

/** 单元格样式（从 xlsx 样式归一化而来） */
export interface TemplateCellStyle {
  bold?: boolean
  italic?: boolean
  fontSize?: number
  color?: string
  fill?: string
  borders?: TemplateCellBorders
  halign?: 'left' | 'center' | 'right'
  valign?: 'top' | 'middle' | 'bottom'
  wrap?: boolean
}

/** 网格单元格：row/col 为 0 起始索引；合并单元格只存锚点 */
export interface TemplateCell {
  row: number
  col: number
  rowSpan: number
  colSpan: number
  text: string
  style: TemplateCellStyle
}

/** 解析后的 Excel 网格（宽高单位 pt） */
export interface TemplateGrid {
  colWidths: number[]
  rowHeights: number[]
  cells: TemplateCell[]
}

/** 可绑定到单元格的业务字段 */
export type TemplateFieldKey =
  | 'invoice_number'
  | 'invoice_date'
  | 'load_number'
  | 'bill_to'
  | 'total'
  | 'pickup_date'
  | 'pickup_company'
  | 'pickup_address'
  | 'drop_date'
  | 'drop_company'
  | 'drop_address'

export type TemplateFieldFormat = 'text' | 'date' | 'money'

/** 简单字段绑定：指向合并单元格锚点（同一字段可出现在多处，如 YG 的 Total 与 Balance Due） */
export interface SimpleFieldBinding {
  cells: { row: number; col: number }[]
  format: TemplateFieldFormat
}

/** 明细行区域绑定：样张中 startRow..endRow 的占位行运行时被数据行替换 */
export interface LineItemsBinding {
  startRow: number
  endRow: number
  columns: {
    description?: number
    quantity?: number
    unitPrice?: number
    amount: number
  }
  minRows: number
}

export interface TemplateBinding {
  fields: Partial<Record<TemplateFieldKey, SimpleFieldBinding>>
  lineItems: LineItemsBinding | null
}

/** 渲染输入（值已格式化为最终展示字符串） */
export interface TemplateRenderData {
  invoiceNumber: string
  invoiceDate: string
  loadNumber: string
  billTo: string
  total: string
  pickupDate: string
  pickupCompany: string
  pickupAddress: string
  dropDate: string
  dropCompany: string
  dropAddress: string
  lines: { description: string; quantity: string; unitPrice: string; amount: string }[]
}

/** 字段注册表：绑定向导 / 表单 / 校验共用 */
export const TEMPLATE_FIELDS: {
  key: TemplateFieldKey
  label: string
  format: TemplateFieldFormat
  required?: boolean
}[] = [
  { key: 'invoice_number', label: '发票号 Invoice No.', format: 'text' },
  { key: 'invoice_date', label: '发票日期 Date', format: 'date' },
  { key: 'load_number', label: 'Load No.', format: 'text' },
  { key: 'bill_to', label: '收款方 Bill To', format: 'text' },
  { key: 'total', label: '合计 Total', format: 'money' },
  { key: 'pickup_date', label: '取货日期 Pickup Date', format: 'date' },
  { key: 'pickup_company', label: '取货公司 Pickup Company', format: 'text' },
  { key: 'pickup_address', label: '取货地址 Pickup Address', format: 'text' },
  { key: 'drop_date', label: '交货日期 Drop Date', format: 'date' },
  { key: 'drop_company', label: '交货公司 Drop Company', format: 'text' },
  { key: 'drop_address', label: '交货地址 Drop Address', format: 'text' },
]

/** 发布前校验：明细区域必填且 description/amount 列必须配置 */
export function validateBindingForPublish(binding: TemplateBinding): string[] {
  const errors: string[] = []
  const li = binding.lineItems
  if (!li) {
    errors.push('必须配置明细行区域后才能发布')
    return errors
  }
  if (li.endRow < li.startRow) errors.push('明细区域结束行不能小于起始行')
  if (li.columns.description == null) errors.push('明细区域必须绑定 Description 列')
  if (li.columns.amount == null) errors.push('明细区域必须绑定 Amount/TOTAL 列')
  if (li.minRows < 1) errors.push('明细最少行数不能小于 1')
  const cols = [li.columns.description, li.columns.quantity, li.columns.unitPrice, li.columns.amount].filter(
    (c) => c != null
  )
  if (new Set(cols).size !== cols.length) errors.push('明细区域各列不能重复绑定同一列')
  return errors
}

export const EMPTY_BINDING: TemplateBinding = { fields: {}, lineItems: null }

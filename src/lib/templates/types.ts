/**
 * 账单模版 —— 共享类型定义与可绑定字段注册表
 * grid_config / binding_config 的 JSON 结构以本文件为唯一契约，
 * 上传解析、绑定向导、HTML 预览、PDF 渲染全部消费同一套结构。
 */

/** 页面配置（PDF 与预览共用，单位 pt） */
export interface TemplatePageConfig {
  size: 'A4' | 'LETTER'
  /** 缺省为 portrait，保持旧模板 JSON 兼容 */
  orientation?: 'portrait' | 'landscape'
  margin: { top: number; right: number; bottom: number; left: number }
  fontFamily: string
  baseFontSize: number
  textColor: string
}

/** 边框线型（与 Univer BorderStyleType 对齐的子集） */
export type TemplateBorderLineStyle =
  | 'thin'
  | 'medium'
  | 'thick'
  | 'dashed'
  | 'dotted'
  | 'double'

/** 单元格边框（宽度单位 pt） */
export interface TemplateCellBorders {
  top?: number
  right?: number
  bottom?: number
  left?: number
  color?: string
  /** 每边线型；缺省按宽度渲染实线（宽度→thin/medium/thick） */
  styles?: {
    top?: TemplateBorderLineStyle
    right?: TemplateBorderLineStyle
    bottom?: TemplateBorderLineStyle
    left?: TemplateBorderLineStyle
  }
}

/** 单元格样式（从 xlsx 样式归一化而来） */
export interface TemplateCellStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  fontSize?: number
  /** Excel 原字体名；编辑器/HTML 预览使用，PDF 回退到已嵌入字体 */
  fontFamily?: string
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

/** 明细行区域绑定：区域 = 令牌行 + 推导时并入的下方连续空行（设计容量），
 *  渲染时明细数 ≤ 容量逐行填值、下方零移动；超出容量才克隆令牌行增长并下移 */
export interface LineItemsBinding {
  startRow: number
  endRow: number
  columns: {
    description?: number
    quantity?: number
    unitPrice?: number
    amount?: number
  }
  /** 区域行数（= 容量），由推导生成，恒等于 endRow - startRow + 1 */
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
  // 明细区域渲染时会被整块替换为数据行，区域内不能有字段绑定（会被丢弃）
  for (const field of TEMPLATE_FIELDS) {
    for (const cell of binding.fields[field.key]?.cells ?? []) {
      if (cell.row >= li.startRow && cell.row <= li.endRow) {
        errors.push(`${field.label} 的绑定位于明细区域内，打印时会被明细数据覆盖，请移出后重试`)
      }
    }
  }
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

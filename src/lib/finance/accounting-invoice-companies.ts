/**
 * 陆运账单 —— 账单分类选项常量
 * 公司与其 PDF 模版已迁移至数据库（基础管理 → 公司管理 / 账单模版管理），
 * 发票号前缀维护于 companies.invoice_prefix。
 */

/** 账单分类选项 */
export const ACCOUNTING_BILLING_CATEGORY_OPTIONS = [
  { label: '长途出货', value: '长途出货' },
  { label: '长途回货', value: '长途回货' },
  { label: '长途CA', value: '长途CA' },
  { label: '长途PA', value: '长途PA' },
  { label: '长途GA', value: '长途GA' },
  { label: '长途LA', value: '长途LA' },
  { label: 'OAK Local', value: 'OAK Local' },
  { label: 'SAV Local', value: 'SAV Local' },
  { label: 'LA Local', value: 'LA Local' },
  { label: 'PA Local', value: 'PA Local' },
] as const

const BILLING_CATEGORY_SELECT_PREFIX = 'billing-category:'
export const BILLING_CATEGORY_UNCLASSIFIED_SELECT_VALUE = 'billing-category:unclassified'

/**
 * Radix Select 不接受空字符串作为选项值；统一编码真实分类，避免历史数据与“未分类”哨兵碰撞。
 */
export function toBillingCategorySelectValue(value: string): string {
  return value === ''
    ? BILLING_CATEGORY_UNCLASSIFIED_SELECT_VALUE
    : `${BILLING_CATEGORY_SELECT_PREFIX}value:${encodeURIComponent(value)}`
}

export function fromBillingCategorySelectValue(value: string): string {
  if (value === BILLING_CATEGORY_UNCLASSIFIED_SELECT_VALUE) return ''
  const encodedPrefix = `${BILLING_CATEGORY_SELECT_PREFIX}value:`
  return value.startsWith(encodedPrefix)
    ? decodeURIComponent(value.slice(encodedPrefix.length))
    : value
}

/** 仅显式“未分类”（空字符串）保存为 null；其他历史值逐字保留。 */
export function billingCategoryPayloadValue(value: string): string | null {
  return value === '' ? null : value
}

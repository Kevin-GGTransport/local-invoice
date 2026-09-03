/**
 * 陆运账单 —— 线路选项常量
 * 公司与其 PDF 模版已迁移至数据库（基础管理 → 公司管理 / 账单模版管理），
 * 发票号前缀维护于 companies.invoice_prefix。
 */

/** From - To 线路选项 */
export const ACCOUNTING_FROM_TO_OPTIONS = [
  { label: 'LA短途', value: 'LA短途' },
  { label: 'CA短途', value: 'CA短途' },
  { label: 'PA短途', value: 'PA短途' },
  { label: '长途出货', value: '长途出货' },
  { label: '长途回货', value: '长途回货' },
] as const

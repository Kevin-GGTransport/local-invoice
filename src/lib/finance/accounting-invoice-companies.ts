/**
 * 陆运账单 —— 公司选项与前缀映射（纯常量，无服务端依赖，config 与客户端组件均可导入）
 * 公司决定：PDF 模版样式 + 发票号前缀
 */

export const ACCOUNTING_COMPANY_OPTIONS = [
  { label: 'AA', value: 'AA' },
  { label: 'YG', value: 'YG' },
  { label: 'G&G', value: 'G&G' },
  { label: 'SFT', value: 'SFT' },
  { label: 'Old Pal', value: 'Old Pal' },
  { label: 'Yuans', value: 'Yuans' },
] as const

/** 公司 → 发票号前缀（AA/YG/GG 已从真实发票号证实；SFT/OP/YU 为待确认猜测值） */
export const ACCOUNTING_COMPANY_INVOICE_PREFIX: Record<string, string> = {
  AA: 'AA',
  YG: 'YG',
  'G&G': 'GG',
  SFT: 'SFT',
  'Old Pal': 'OP',
  Yuans: 'YU',
}

/** 已有 PDF 模版的公司（其余公司暂不支持生成 PDF） */
export const ACCOUNTING_PDF_TEMPLATE_COMPANIES: readonly string[] = ['AA', 'YG']

/** From - To 线路选项 */
export const ACCOUNTING_FROM_TO_OPTIONS = [
  { label: 'LA短途', value: 'LA短途' },
  { label: 'CA短途', value: 'CA短途' },
  { label: 'PA短途', value: 'PA短途' },
  { label: '长途出货', value: '长途出货' },
  { label: '长途回货', value: '长途回货' },
] as const

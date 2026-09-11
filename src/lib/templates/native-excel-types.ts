import type { TemplateBinding, TemplateGrid } from './types'

/** Optional, versioned extension. Its absence ALWAYS selects the legacy renderer. */
export interface NativeExcelSource {
  version: 1
  filename: string
  sha256: string
  base64: string
  sheetName: string
}
export type NativeExcelGrid = TemplateGrid & { nativeExcel: NativeExcelSource }
export function isNativeExcelGrid(value: unknown): value is NativeExcelGrid {
  return !!value && typeof value === 'object' && 'nativeExcel' in value &&
    (value as NativeExcelGrid).nativeExcel?.version === 1
}
export interface NativeExcelDetail {
  id: string
  name: string
  status: string
  company: { name: string; code: string }
  binding_config: TemplateBinding
  source: Omit<NativeExcelSource, 'base64'>
}

export function columnName(col: number): string {
  let result = ''
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result
  return result
}

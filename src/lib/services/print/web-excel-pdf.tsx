import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { parseTemplateXlsx } from '@/lib/templates/parse-xlsx'
import { GenericTemplateDocument } from './generic-template-pdf'
import { assertWebExcelCompatible } from '@/lib/templates/web-excel'
import { NativeExcelError } from '@/lib/templates/native-excel'

/** Vercel-safe compatibility path. No Office subprocess or external upload. */
export async function webExcelToPdf(bytes: Buffer, filled = true): Promise<Buffer> {
  if (filled) await assertWebExcelCompatible(bytes)
  const { pageConfig, grid } = await parseTemplateXlsx(bytes).catch(err => { throw new NativeExcelError(err instanceof Error ? err.message : '无法读取网页打印版式') })
  return Buffer.from(await renderToBuffer(<GenericTemplateDocument pageConfig={pageConfig} grid={grid} />))
}

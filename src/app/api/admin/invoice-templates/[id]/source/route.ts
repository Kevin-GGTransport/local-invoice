import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, jsonError, handleDbError } from '@/lib/api-helpers'
import { isNativeExcelGrid } from '@/lib/templates/native-excel-types'
import { fillNativeExcel, nativeSourceBytes, NativeExcelError, nativeSampleData } from '@/lib/templates/native-excel'
import { sampleTemplateRenderData } from '@/lib/templates/render-template-data'
import type { TemplateBinding } from '@/lib/templates/types'
import { excelSource } from '@/lib/templates/web-excel'

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin()
  if (error) return error
  const { id } = await ctx.params
  if (!/^\d+$/.test(id)) return jsonError('无效模板 ID', 400)
  try {
    const template = await prisma.invoice_templates.findUnique({ where: { id: BigInt(id) } })
    if (!template) return jsonError('模板不存在', 404)
    const source = excelSource(template.grid_config)
    if (!source) return jsonError('该模板未保留原 Excel，请上传为新模板', 409)
    const sample = request.nextUrl.searchParams.get('sample') === '1'
    const binding = template.binding_config as unknown as TemplateBinding
    if (sample && !isNativeExcelGrid(template.grid_config)) return jsonError('网页模板请使用试打 PDF；下载原 Excel 不包含网页修改', 409)
    const bytes = sample && isNativeExcelGrid(template.grid_config) ? await fillNativeExcel(template.grid_config, binding, nativeSampleData(binding, sampleTemplateRenderData())) : nativeSourceBytes({ cells: [], rowHeights: [], colWidths: [], nativeExcel: source })
    const filename = sample ? `示例-${source.filename}` : source.filename
    return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="template.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`, 'Cache-Control': 'no-store' } })
  } catch (err) {
    if (err instanceof NativeExcelError) return jsonError(err.message, 422)
    return handleDbError(err, '下载失败')
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, jsonError, handleDbError } from '@/lib/api-helpers'
import { isNativeExcelGrid } from '@/lib/templates/native-excel-types'
import { fillNativeExcel, nativeSourceBytes, NativeExcelError, nativeSampleData } from '@/lib/templates/native-excel'
import { sampleTemplateRenderData } from '@/lib/templates/render-template-data'
import type { TemplateBinding } from '@/lib/templates/types'

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin()
  if (error) return error
  const { id } = await ctx.params
  if (!/^\d+$/.test(id)) return jsonError('无效模板 ID', 400)
  try {
    const template = await prisma.invoice_templates.findUnique({ where: { id: BigInt(id) } })
    if (!template) return jsonError('模板不存在', 404)
    if (!isNativeExcelGrid(template.grid_config)) return jsonError('旧版模板未保留原 Excel，请上传为新模板', 409)
    const sample = request.nextUrl.searchParams.get('sample') === '1'
    const binding = template.binding_config as unknown as TemplateBinding
    const bytes = sample ? await fillNativeExcel(template.grid_config, binding, nativeSampleData(binding, sampleTemplateRenderData())) : nativeSourceBytes(template.grid_config)
    const filename = sample ? `示例-${template.grid_config.nativeExcel.filename}` : template.grid_config.nativeExcel.filename
    return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="template.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`, 'Cache-Control': 'no-store' } })
  } catch (err) {
    if (err instanceof NativeExcelError) return jsonError(err.message, 422)
    return handleDbError(err, '下载失败')
  }
}

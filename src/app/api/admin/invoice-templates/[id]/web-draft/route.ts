import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, userIdBigint, jsonError, jsonOk, handleDbError } from '@/lib/api-helpers'
import { isNativeExcelGrid } from '@/lib/templates/native-excel-types'
import { NativeExcelError } from '@/lib/templates/native-excel'
import { nativeToWebTemplate } from '@/lib/templates/web-excel'
import type { TemplateBinding } from '@/lib/templates/types'

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAdmin()
  if (error) return error
  const { id } = await ctx.params
  if (!/^\d+$/.test(id)) return jsonError('无效模板 ID', 400)
  try {
    const source = await prisma.invoice_templates.findUnique({ where: { id: BigInt(id) } })
    if (!source) return jsonError('模板不存在', 404)
    if (!isNativeExcelGrid(source.grid_config)) return jsonError('该模板已经是网页模板', 409)
    const converted = await nativeToWebTemplate(source.grid_config, source.binding_config as unknown as TemplateBinding)
    const copy = await prisma.invoice_templates.create({ data: {
      company_id: source.company_id, name: `${source.name} - 网页版`.slice(0, 100),
      status: 'draft', is_default: false,
      page_config: converted.pageConfig as unknown as object,
      grid_config: converted.grid as unknown as object,
      binding_config: converted.binding as unknown as object,
      created_by: userIdBigint(session), updated_by: userIdBigint(session),
    } })
    return jsonOk({ id: copy.id }, 201)
  } catch (err) {
    if (err instanceof NativeExcelError) return jsonError(err.message, 422)
    return handleDbError(err, '创建网页草稿失败')
  }
}

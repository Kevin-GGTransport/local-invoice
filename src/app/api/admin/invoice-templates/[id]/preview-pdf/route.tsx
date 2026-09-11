/**
 * 账单模版 - 试打预览（仅 admin）
 * 用内置示例数据渲染当前草稿/启用模版 PDF，绑定向导中随时验证效果
 */

import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import React from "react"
import { prisma } from "@/lib/prisma"
import { requireAdmin, jsonError, handleDbError } from "@/lib/api-helpers"
import type { TemplateGrid, TemplatePageConfig } from "@/lib/templates/types"
import { renderTemplateData, sampleTemplateRenderData } from "@/lib/templates/render-template-data"
import { deriveBindingFromGrid } from "@/lib/templates/token-binding"
import { GenericTemplateDocument } from "@/lib/services/print/generic-template-pdf"
import { isNativeExcelGrid } from "@/lib/templates/native-excel-types"
import { fillNativeExcel, nativeSourceBytes, NativeExcelError, nativeSampleData } from "@/lib/templates/native-excel"
import { nativeExcelToPdf } from "@/lib/services/print/native-excel-pdf"
import type { TemplateBinding } from "@/lib/templates/types"

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin()
  if (error) return error

  const { id } = await ctx.params
  if (!/^\d+$/.test(id)) return jsonError("无效的模版 ID", 400)

  try {
    const template = await prisma.invoice_templates.findUnique({ where: { id: BigInt(id) } })
    if (!template) return jsonError("模版不存在", 404)
    if (isNativeExcelGrid(template.grid_config)) {
      const source = _request.nextUrl.searchParams.get("source") === "1"
      const nativeBinding = template.binding_config as unknown as TemplateBinding
      const xlsx = source ? nativeSourceBytes(template.grid_config) : await fillNativeExcel(template.grid_config, nativeBinding, nativeSampleData(nativeBinding, sampleTemplateRenderData()))
      const buffer = await nativeExcelToPdf(xlsx)
      return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" } })
    }

    const pageConfig = template.page_config as unknown as TemplatePageConfig
    const grid = template.grid_config as unknown as TemplateGrid
    // 绑定由网格现场推导（与打印同源），草稿试打即反映最新推导规则
    const binding = deriveBindingFromGrid(grid).binding
    const rendered = renderTemplateData(grid, binding, sampleTemplateRenderData())

    const buf = await renderToBuffer(
      <GenericTemplateDocument pageConfig={pageConfig} grid={rendered} />
    )
    const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer)

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="template-preview.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    if (err instanceof NativeExcelError) return jsonError(err.message, 422)
    return handleDbError(err, "生成预览失败")
  }
}

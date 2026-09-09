/**
 * 账单模版 - 详情 / 编辑名称与绑定（仅 admin）
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdmin, userIdBigint, jsonOk, jsonError, handleDbError, readJsonBody } from "@/lib/api-helpers"
import { type TemplateBinding } from "@/lib/templates/types"
import { validateTemplateGrid } from "@/lib/templates/template-grid"
import { deriveBindingFromGrid } from "@/lib/templates/token-binding"
import type { TemplateGrid } from "@/lib/templates/types"

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin()
  if (error) return error

  const { id } = await ctx.params
  if (!/^\d+$/.test(id)) return jsonError("无效的模版 ID", 400)

  try {
    const template = await prisma.invoice_templates.findUnique({
      where: { id: BigInt(id) },
      include: { company: { select: { id: true, code: true, name: true } } },
    })
    if (!template) return jsonError("模版不存在", 404)
    return jsonOk(template)
  } catch (err) {
    return handleDbError(err, "查询模版失败")
  }
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  company_id: z.string().regex(/^\d+$/, "请选择有效公司").optional(),
  line_item_min_rows: z.number().int().min(1).max(80).optional(),
  grid_config: z
    .object({
      colWidths: z.array(z.number()),
      rowHeights: z.array(z.number()),
      cells: z.array(
        z.object({
          row: z.number().int(),
          col: z.number().int(),
          rowSpan: z.number().int(),
          colSpan: z.number().int(),
          text: z.string(),
          style: z.object({
            bold: z.boolean().optional(),
            italic: z.boolean().optional(),
            fontSize: z.number().optional(),
            color: z.string().optional(),
            fill: z.string().optional(),
            underline: z.boolean().optional(),
            strike: z.boolean().optional(),
            borders: z
              .object({
                top: z.number().optional(),
                right: z.number().optional(),
                bottom: z.number().optional(),
                left: z.number().optional(),
                color: z.string().optional(),
                styles: z
                  .object({
                    top: z.enum(["thin", "medium", "thick", "dashed", "dotted", "double"]).optional(),
                    right: z.enum(["thin", "medium", "thick", "dashed", "dotted", "double"]).optional(),
                    bottom: z.enum(["thin", "medium", "thick", "dashed", "dotted", "double"]).optional(),
                    left: z.enum(["thin", "medium", "thick", "dashed", "dotted", "double"]).optional(),
                  })
                  .optional(),
              })
              .optional(),
            halign: z.enum(["left", "center", "right"]).optional(),
            valign: z.enum(["top", "middle", "bottom"]).optional(),
            wrap: z.boolean().optional(),
          }),
        })
      ),
    })
    .optional(),
})

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAdmin()
  if (error) return error

  const { id } = await ctx.params
  if (!/^\d+$/.test(id)) return jsonError("无效的模版 ID", 400)

  const body = await readJsonBody(request)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "参数不合法", 400)
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM invoice_templates WHERE id = ${BigInt(id)} FOR UPDATE`
      const existing = await tx.invoice_templates.findUnique({ where: { id: BigInt(id) } })
      if (!existing) return jsonError("模版不存在", 404)

      const requestedCompanyId = parsed.data.company_id
        ? BigInt(parsed.data.company_id)
        : undefined
      const changesCompany =
        requestedCompanyId !== undefined && requestedCompanyId !== existing.company_id

      // 仅改名称时任何状态都允许；公司与网格只允许草稿修改
      const grid = parsed.data.grid_config as TemplateGrid | undefined
      const editsDraftOnlyFields = Boolean(grid || changesCompany)
      if (editsDraftOnlyFields && existing.status !== "draft") {
        return jsonError("模版状态已变化，仅草稿模版可修改公司或绑定", 409)
      }

      if (changesCompany && requestedCompanyId !== undefined) {
        await tx.$queryRaw`SELECT id FROM companies WHERE id = ${requestedCompanyId} FOR SHARE`
        const company = await tx.companies.findUnique({
          where: { id: requestedCompanyId },
          select: { is_active: true },
        })
        if (!company) return jsonError("公司不存在", 404)
        if (!company.is_active) return jsonError("不能将模版转移到已停用的公司", 400)
      }

      // 网格保存时由令牌推导绑定（binding_config 唯一生成来源）
      let bindingToSave: TemplateBinding | undefined
      if (grid) {
        const minRows =
          parsed.data.line_item_min_rows ??
          ((existing.binding_config as unknown as TemplateBinding).lineItems?.minRows ?? 10)
        const derived = deriveBindingFromGrid(grid, { minRows })
        if (derived.errors.length > 0) return jsonError(derived.errors.join("；"), 400)
        bindingToSave = derived.binding
        const gridErrors = validateTemplateGrid(grid, derived.binding)
        if (gridErrors.length > 0) return jsonError(gridErrors[0], 400)
      }

      const result = await tx.invoice_templates.updateMany({
        where: editsDraftOnlyFields ? { id: BigInt(id), status: "draft" } : { id: BigInt(id) },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(changesCompany ? { company_id: requestedCompanyId } : {}),
          ...(bindingToSave ? { binding_config: bindingToSave as unknown as object } : {}),
          ...(grid ? { grid_config: grid as unknown as object } : {}),
          updated_by: userIdBigint(session),
        },
      })
      if (result.count === 0) return jsonError("模版状态已变化，仅草稿模版可保存", 409)

      const updated = await tx.invoice_templates.findUnique({
        where: { id: BigInt(id) },
        select: {
          id: true,
          name: true,
          status: true,
          company: { select: { id: true, code: true, name: true } },
        },
      })
      if (!updated) return jsonError("模版不存在", 404)
      return jsonOk(updated)
    })
  } catch (err) {
    return handleDbError(err, "保存模版失败")
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin()
  if (error) return error

  const { id } = await ctx.params
  if (!/^\d+$/.test(id)) return jsonError("无效的模版 ID", 400)

  try {
    const existing = await prisma.invoice_templates.findUnique({
      where: { id: BigInt(id) },
      select: { id: true, name: true, status: true },
    })
    if (!existing) return jsonError("模版不存在", 404)

    await prisma.invoice_templates.delete({ where: { id: existing.id } })
    return jsonOk({ id: existing.id, name: existing.name, status: existing.status })
  } catch (err) {
    return handleDbError(err, "删除模版失败")
  }
}

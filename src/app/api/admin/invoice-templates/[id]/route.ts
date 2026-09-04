/**
 * 账单模版 - 详情 / 编辑名称与绑定（仅 admin）
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdmin, userIdBigint, jsonOk, jsonError, handleDbError, readJsonBody } from "@/lib/api-helpers"
import { validateBindingForPublish, type TemplateBinding } from "@/lib/templates/types"

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

const bindingFieldsSchema = z.record(
  z.string(),
  z.object({
    cells: z.array(z.object({ row: z.number().int().min(0), col: z.number().int().min(0) })).min(1),
    format: z.enum(["text", "date", "money"]),
  })
)

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  binding_config: z
    .object({
      fields: bindingFieldsSchema,
      lineItems: z
        .object({
          startRow: z.number().int().min(0),
          endRow: z.number().int().min(0),
          columns: z.object({
            description: z.number().int().min(0).nullable().optional(),
            quantity: z.number().int().min(0).nullable().optional(),
            unitPrice: z.number().int().min(0).nullable().optional(),
            amount: z.number().int().min(0),
          }),
          minRows: z.number().int().min(1),
        })
        .nullable(),
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
    const existing = await prisma.invoice_templates.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return jsonError("模版不存在", 404)
    if (existing.status !== "draft") {
      return jsonError("仅草稿模版可编辑绑定，请重新上传样张生成新版本", 400)
    }

    // 绑定保存时做结构校验（非发布级校验，允许未完成状态保存）
    const binding = parsed.data.binding_config as TemplateBinding | undefined
    if (binding) {
      if (binding.lineItems && binding.lineItems.endRow < binding.lineItems.startRow) {
        return jsonError("明细区域结束行不能小于起始行", 400)
      }
      void validateBindingForPublish // 发布接口使用；此处仅做宽松保存
    }

    const template = await prisma.invoice_templates.update({
      where: { id: BigInt(id) },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(binding ? { binding_config: binding as unknown as object } : {}),
        updated_by: userIdBigint(session),
      },
    })
    return jsonOk({ id: template.id, name: template.name, status: template.status })
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

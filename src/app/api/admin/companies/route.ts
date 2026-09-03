/**
 * 公司管理 - 新增（仅 admin）
 * code 创建后不可改（发票数据按它关联）；invoice_prefix 影响后续新开发票号
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdmin, jsonOk, jsonError, handleDbError, readJsonBody } from "@/lib/api-helpers"

const createSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "公司代码不能为空")
    .max(20)
    .regex(/^[A-Za-z0-9&\-\. ]+$/, "公司代码仅支持字母、数字、& - . 空格"),
  name: z.string().trim().min(1, "公司名称不能为空").max(100),
  invoice_prefix: z.string().trim().max(10).optional().nullable(),
})

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const body = await readJsonBody(request)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "参数不合法", 400)
  }

  try {
    const company = await prisma.companies.create({
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        invoice_prefix: parsed.data.invoice_prefix || null,
      },
    })
    return jsonOk(company, 201)
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (code === "P2002") return jsonError("公司代码已存在", 409)
    return handleDbError(err, "新增公司失败")
  }
}

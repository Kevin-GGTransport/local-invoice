/**
 * 账单模版 - 上传 .xlsx 样张（仅 admin）
 * 解析第一个 sheet 的布局并落为 draft；样张中的 {{令牌}} 会自动推导为字段绑定
 */

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, userIdBigint, jsonOk, jsonError, handleDbError } from "@/lib/api-helpers"
import {
  parseTemplateXlsx,
  TEMPLATE_UPLOAD_MAX_BYTES,
} from "@/lib/templates/parse-xlsx"
import { deriveBindingFromGrid } from "@/lib/templates/token-binding"
import { importNativeExcel } from "@/lib/templates/native-excel"

export async function POST(request: NextRequest) {
  const { session, error } = await requireAdmin()
  if (error) return error

  try {
    const form = await request.formData()
    const companyIdRaw = String(form.get("company_id") ?? "")
    const name = String(form.get("name") ?? "").trim() || "未命名模版"
    const file = form.get("file")

    if (!/^\d+$/.test(companyIdRaw)) return jsonError("请选择公司", 400)
    if (!(file instanceof File)) return jsonError("请选择 .xlsx 样张文件", 400)
    if (file.size > TEMPLATE_UPLOAD_MAX_BYTES) return jsonError("文件大小不能超过 5MB", 400)
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return jsonError("仅支持 .xlsx 文件（.xls 请先另存为 .xlsx）", 400)
    }

    const companyId = BigInt(companyIdRaw)
    const company = await prisma.companies.findUnique({ where: { id: companyId } })
    if (!company) return jsonError("公司不存在", 404)

    const buffer = Buffer.from(await file.arrayBuffer())
    // New uploads retain the source. Legacy records are never rewritten or switched.
    if (form.get("mode") !== "legacy") {
      let native
      try { native = await importNativeExcel(buffer, file.name) }
      catch (err) { return jsonError(err instanceof Error ? err.message : "无法读取 Excel 原件", 400) }
      const template = await prisma.invoice_templates.create({ data: {
        company_id: companyId, name, status: "draft",
        page_config: { size: "A4", margin: { top: 18, right: 18, bottom: 18, left: 18 }, fontFamily: "Arial", baseFontSize: 10, textColor: "#000000" },
        grid_config: native.grid as unknown as object,
        binding_config: native.binding as unknown as object,
        created_by: userIdBigint(session), updated_by: userIdBigint(session),
      } })
      return jsonOk({ id: template.id, name: template.name, status: template.status, warnings: native.warnings }, 201)
    }
    let parsed
    try {
      parsed = await parseTemplateXlsx(buffer)
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "样张解析失败", 400)
    }

    // 样张中已含令牌则自动完成绑定；未知令牌收集为警告返回前端提示
    const derived = deriveBindingFromGrid(parsed.grid)
    const warnings: string[] = []
    if (derived.unknownTokens.length > 0) {
      warnings.push(`样张中存在未知令牌：${derived.unknownTokens.map((t) => `{{${t}}}`).join("、")}`)
    }
    if (derived.errors.length > 0) warnings.push(...derived.errors)

    const template = await prisma.invoice_templates.create({
      data: {
        company_id: companyId,
        name,
        status: "draft",
        page_config: parsed.pageConfig as unknown as object,
        grid_config: parsed.grid as unknown as object,
        binding_config: derived.binding as unknown as object,
        created_by: userIdBigint(session),
        updated_by: userIdBigint(session),
      },
    })

    return jsonOk({ id: template.id, name: template.name, status: template.status, warnings }, 201)
  } catch (err) {
    return handleDbError(err, "上传样张失败")
  }
}

/** 复制任意模板为新的草稿版本（仅 admin） */

import { NextRequest } from "next/server";

import { handleDbError, jsonError, jsonOk, requireAdmin, userIdBigint } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return jsonError("无效的模版 ID", 400);

  try {
    const source = await prisma.invoice_templates.findUnique({ where: { id: BigInt(id) } });
    if (!source) return jsonError("模版不存在", 404);

    const copy = await prisma.invoice_templates.create({
      data: {
        company_id: source.company_id,
        name: `${source.name} - 新版本`.slice(0, 100),
        status: "draft",
        page_config: source.page_config as object,
        grid_config: source.grid_config as object,
        binding_config: source.binding_config as object,
        created_by: userIdBigint(session),
        updated_by: userIdBigint(session),
      },
    });

    return jsonOk({ id: copy.id, name: copy.name, status: copy.status }, 201);
  } catch (err) {
    return handleDbError(err, "复制模版失败");
  }
}

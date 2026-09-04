import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { TemplateEditorClient } from "./template-editor-client";

/**
 * 账单模版编辑页（仅 admin）—— 绑定向导整页版：改名、绑定字段、试打、发布
 */
export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/dashboard");
  const { id } = await params;
  if (!/^\d+$/.test(id)) redirect("/dashboard/templates");
  return <TemplateEditorClient key={id} id={id} />;
}

/**
 * API 路由小助手：会话鉴权 + BigInt 安全的 JSON 序列化
 * Prisma 的 BigInt 主键（id/created_by 等）无法直接 JSON.stringify，统一转字符串
 */
import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import { auth } from "@/lib/auth"

/** 鉴权：无 session 时返回 401 响应（调用方直接 return error） */
export async function requireSession(): Promise<{
  session: Session | null
  error: NextResponse | null
}> {
  const session = await auth().catch(() => null)
  if (!session?.user) {
    return { session: null, error: NextResponse.json({ error: "未授权" }, { status: 401 }) }
  }
  return { session, error: null }
}

/** session.user.id（JWT sub，字符串数字）→ BigInt，无效时 null */
export function userIdBigint(session: Session | null): bigint | null {
  const id = session?.user?.id
  if (!id || !/^\d+$/.test(id)) return null
  return BigInt(id)
}

/** BigInt 安全的 JSON 成功响应 */
export function jsonOk(data: unknown, status = 200): NextResponse {
  return new NextResponse(
    JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
    { status, headers: { "Content-Type": "application/json" } }
  )
}

/** 错误响应（中文消息） */
export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

/** Prisma 已知错误码 → 中文 HTTP 响应，其余记日志返 500 */
export function handleDbError(error: unknown, fallback: string): NextResponse {
  const code = (error as { code?: string })?.code
  if (code === "P2002") return jsonError("发票号已存在，请更换", 409)
  if (code === "P2025") return jsonError("记录不存在", 404)
  console.error(fallback, error)
  return jsonError(fallback, 500)
}

/**
 * API 路由小助手：会话鉴权 + BigInt 安全的 JSON 序列化
 * Prisma 的 BigInt 主键（id/created_by 等）无法直接 JSON.stringify，统一转字符串
 */
import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import { auth } from "@/lib/auth"
import type { ApiResponse } from "@/lib/api/types"

/** 鉴权：无 session 时返回 401 响应（调用方直接 return error） */
export async function requireSession(): Promise<{
  session: Session | null
  error: NextResponse | null
}> {
  const session = await auth().catch(() => null)
  if (!session?.user) {
    return { session: null, error: jsonError("未授权", 401) }
  }
  return { session, error: null }
}

/** 管理端鉴权：无 session 返回 401；非 admin 角色返回 403 */
export async function requireAdmin(): Promise<{
  session: Session | null
  error: NextResponse | null
}> {
  const { session, error } = await requireSession()
  if (error) return { session: null, error }
  if (session?.user?.role !== "admin") {
    return { session: null, error: jsonError("需要管理员权限", 403) }
  }
  return { session, error: null }
}

/** session.user.id（JWT sub，字符串数字）→ BigInt，无效时 null */
export function userIdBigint(session: Session | null): bigint | null {
  const id = session?.user?.id
  if (!id || !/^\d+$/.test(id)) return null
  return BigInt(id)
}

/** BigInt 安全的统一成功响应：{ success: true, data } */
export function jsonOk<TData>(data: TData, status = 200): NextResponse {
  const payload: ApiResponse<TData> = { success: true, data }
  return new NextResponse(
    JSON.stringify(payload, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    ),
    {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }
  )
}

/** 统一错误响应：{ success: false, error } */
export function jsonError(message: string, status: number): NextResponse {
  return new NextResponse(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  })
}

/** 读取统一 JSON 请求体；非法或空 JSON 时返回空对象，交给 Zod 输出业务校验错误 */
export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null)
  return body !== null && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {}
}

/** Prisma 已知错误码 → 中文 HTTP 响应，其余记日志返 500 */
export function handleDbError(error: unknown, fallback: string): NextResponse {
  const code = (error as { code?: string })?.code
  if (code === "P2002") return jsonError("发票号已存在，请更换", 409)
  if (code === "P2025") return jsonError("记录不存在", 404)
  console.error(fallback, error)
  return jsonError(fallback, 500)
}

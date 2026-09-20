import assert from "node:assert/strict"
import test from "node:test"

import {
  ApiClientError,
  fetchJson,
  fetchResponse,
  getApiError,
  getApiErrorMessage,
  getRequestErrorMessage,
  parseApiResponse,
} from "../client"

function apiResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

test("fetchJson returns data and always includes same-origin credentials", async () => {
  const originalFetch = globalThis.fetch
  let receivedInit: RequestInit | undefined
  globalThis.fetch = (async (_url, init) => {
    receivedInit = init
    return apiResponse({ success: true, data: { id: "1" } })
  }) as typeof fetch

  try {
    assert.deepEqual(await fetchJson("/api/item"), { id: "1" })
    assert.equal(receivedInit?.credentials, "same-origin")
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("parseApiResponse preserves a structured server error", async () => {
  await assert.rejects(
    parseApiResponse(apiResponse({ success: false, error: "发票号已存在" }, 409)),
    (error: unknown) =>
      error instanceof ApiClientError &&
      error.status === 409 &&
      error.kind === "http" &&
      error.message === "发票号已存在" &&
      !error.retryable
  )
})

test("parseApiResponse gives a useful status fallback for non-JSON errors", async () => {
  await assert.rejects(
    parseApiResponse(new Response("Bad gateway", { status: 502 })),
    (error: unknown) =>
      error instanceof ApiClientError &&
      error.status === 502 &&
      error.message === "服务器暂时不可用，请稍后重试" &&
      error.retryable
  )
})

test("parseApiResponse rejects malformed successful responses", async () => {
  await assert.rejects(
    parseApiResponse(apiResponse({ data: { id: "1" } })),
    (error: unknown) =>
      error instanceof ApiClientError && error.kind === "invalid-response" && error.retryable
  )
})

test("fetchJson aborts a stalled request and identifies a server timeout", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true }
      )
    })) as typeof fetch

  try {
    await assert.rejects(
      fetchJson("/api/slow", { method: "POST", body: "{}" }, 5),
      (error: unknown) =>
        error instanceof ApiClientError &&
        error.kind === "timeout" &&
        error.message === "服务器响应超时，请稍后重试" &&
        error.retryable
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("timeout remains active while the response body is being consumed", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (_url, init) => {
    const stream = new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")))
      },
    })
    return new Response(stream, { status: 200 })
  }) as typeof fetch

  try {
    await assert.rejects(
      fetchResponse("/api/stalled-body", undefined, 5),
      (error: unknown) => error instanceof ApiClientError && error.kind === "timeout"
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("fetchJson keeps an explicit caller abort distinct from a timeout", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true }
      )
    })) as typeof fetch
  const controller = new AbortController()

  try {
    const request = fetchJson("/api/cancelled", { signal: controller.signal }, 1_000)
    controller.abort(new Error("component disposed"))
    await assert.rejects(
      request,
      (error: unknown) => error instanceof ApiClientError && error.kind === "aborted"
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("legacy numeric ApiClientError constructor remains compatible", () => {
  const error = new ApiClientError("未授权", 401)
  assert.equal(error.status, 401)
  assert.equal(error.kind, "http")
})

test("malformed failure payload falls back without throwing TypeError", async () => {
  await assert.rejects(
    parseApiResponse(apiResponse({ success: false, error: null }, 400)),
    (error: unknown) =>
      error instanceof ApiClientError && error.message === "请求内容有误，请检查后重试"
  )
})

test("fetchResponse identifies browser transport failures", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch")
  }) as typeof fetch

  try {
    await assert.rejects(
      fetchResponse("/api/unreachable"),
      (error: unknown) =>
        error instanceof ApiClientError &&
        error.kind === "network" &&
        error.message === "无法连接服务器，请检查网络后重试"
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("raw response errors and unknown errors use consistent messages", async () => {
  assert.equal(
    await getApiErrorMessage(apiResponse({ success: false, error: "文件格式错误" }, 400)),
    "文件格式错误"
  )
  assert.equal(getRequestErrorMessage(new Error("保存失败")), "保存失败")
  assert.equal(getRequestErrorMessage(null, "操作失败"), "操作失败")

  const error = await getApiError(new Response("Bad gateway", { status: 502 }))
  assert.equal(error.status, 502)
  assert.equal(error.kind, "http")
  assert.equal(error.retryable, true)
  assert.equal(error.message, "服务器暂时不可用，请稍后重试")
})

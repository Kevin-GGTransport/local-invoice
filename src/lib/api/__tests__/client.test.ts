import assert from "node:assert/strict"
import test from "node:test"

import { ApiClientError, fetchJson } from "../client"

test("fetchJson aborts a stalled request and reports a timeout", async () => {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
    fetchCalls += 1
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true }
      )
    })
  }) as typeof fetch

  try {
    await assert.rejects(
      fetchJson("/api/slow", { method: "POST", body: "{}" }, 5),
      (error: unknown) =>
        error instanceof ApiClientError && error.message === "请求超时，请检查网络连接后重试"
    )
    assert.equal(fetchCalls, 1, "timed-out POST requests must not be retried automatically")
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
    controller.abort()
    await assert.rejects(
      request,
      (error: unknown) => error instanceof DOMException && error.name === "AbortError"
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

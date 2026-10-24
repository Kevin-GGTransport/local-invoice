import assert from "node:assert/strict"
import test from "node:test"

import { clearAuthCache } from "../auth-cache"

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

test("clearLocalAuthCache removes credential-like caches but preserves preferences and drafts", () => {
  const localStorage = new MemoryStorage()
  const sessionStorage = new MemoryStorage()
  const documentLike = { cookie: "auth-token=expired; Path=/" }

  localStorage.setItem("accessToken", "expired")
  localStorage.setItem("next-auth.session-token", "expired")
  localStorage.setItem("land-orders.group-column-order.v1", "[]")
  sessionStorage.setItem("auth-csrf", "expired")
  sessionStorage.setItem("invoice-template.draft.7", "{}")

  const removed = clearAuthCache({ localStorage, sessionStorage }, documentLike)
  assert.deepEqual([...new Set(removed)].sort(), [
    "accessToken",
    "auth-csrf",
    "auth-token",
    "next-auth.session-token",
  ])
  assert.equal(localStorage.getItem("accessToken"), null)
  assert.equal(localStorage.getItem("next-auth.session-token"), null)
  assert.equal(sessionStorage.getItem("auth-csrf"), null)
  assert.deepEqual(localStorage.getItem("land-orders.group-column-order.v1"), "[]")
  assert.deepEqual(sessionStorage.getItem("invoice-template.draft.7"), "{}")
})

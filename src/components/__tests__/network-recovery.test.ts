import assert from "node:assert/strict"
import test from "node:test"

import { isChunkLoadFailure } from "../network-recovery"

test("recognizes browser module/chunk failures that require a hard reload", () => {
  assert.equal(
    isChunkLoadFailure(new Error("Failed to fetch dynamically imported module: /dashboard/page-123.js")),
    true
  )
  assert.equal(isChunkLoadFailure(new Error("Importing a module script failed.")), true)
  assert.equal(isChunkLoadFailure("TypeError: Failed to fetch"), false)
  assert.equal(isChunkLoadFailure(null), false)
})

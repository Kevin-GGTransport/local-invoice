"use client";

const AUTH_CACHE_KEY_PATTERN = /(?:auth|token|session|credential)/i;

function isAuthCacheKey(key: string): boolean {
  return AUTH_CACHE_KEY_PATTERN.test(key);
}

function getStorageKeys(storage: Storage): string[] {
  // Storage is index-addressable in all browsers; some environments also expose
  // keys() through the iterable mixin.
  const keys = storage as Storage & { keys?: () => Iterable<string> };
  if (typeof keys.keys === "function") return Array.from(keys.keys());

  const result: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key != null) result.push(key);
  }
  return result;
}

type AuthCacheWindow = Pick<Window, "localStorage" | "sessionStorage">;
type AuthCacheDocument = Pick<Document, "cookie">;

function removeBrowserCookie(
  name: string,
  documentLike: AuthCacheDocument | undefined
): void {
  if (documentLike == null) return;

  // HttpOnly NextAuth cookies cannot be removed by JavaScript. Successful
  // credentials sign-in replaces that server-owned session cookie; this cleanup
  // covers non-HttpOnly/custom token cookies left by older clients.
  documentLike.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}

/** Remove stale browser-readable auth/token caches without clearing UI preferences. */
export function clearAuthCache(
  browserWindow: AuthCacheWindow | undefined = globalThis.window,
  documentLike: AuthCacheDocument | undefined = globalThis.document
): string[] {
  if (browserWindow == null) return [];

  const removed: string[] = [];
  for (const storage of [browserWindow.localStorage, browserWindow.sessionStorage]) {
    let keys: string[] = [];
    try {
      keys = getStorageKeys(storage).filter(isAuthCacheKey);
      for (const key of keys) {
        storage.removeItem(key);
        removed.push(key);
      }
    } catch {
      // Storage can be unavailable or blocked. Cookie cleanup still runs.
    }
  }

  if (documentLike != null) {
    const cookies = documentLike.cookie ? documentLike.cookie.split(";") : [];
    for (const cookie of cookies) {
      const name = cookie.slice(0, cookie.indexOf("=")).trim();
      if (name && isAuthCacheKey(name)) {
        removeBrowserCookie(name, documentLike);
        removed.push(name);
      }
    }
  }

  return removed;
}

export function clearLocalAuthCache(): string[] {
  return clearAuthCache(globalThis.window, globalThis.document);
}

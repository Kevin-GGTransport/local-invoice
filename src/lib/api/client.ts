import type { ApiResponse } from "./types";
import { clearLocalAuthCache } from "@/lib/auth-cache";

export type ApiErrorKind =
  | "http"
  | "timeout"
  | "network"
  | "offline"
  | "aborted"
  | "invalid-response";

export class ApiClientError extends Error {
  status?: number;
  kind: ApiErrorKind;
  retryable: boolean;

  constructor(
    message: string,
    options: number | { status?: number; kind?: ApiErrorKind; retryable?: boolean } = {}
  ) {
    super(message);
    this.name = "ApiClientError";
    const normalized = typeof options === "number" ? { status: options } : options;
    this.status = normalized.status;
    this.kind = normalized.kind ?? "http";
    this.retryable = normalized.retryable ?? false;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const GET_RETRY_DELAY_MS = 500;
let redirectingToLogin = false;

function isApiSuccess<TData>(
  payload: ApiResponse<TData> | null
): payload is Extract<ApiResponse<TData>, { success: true }> {
  return payload?.success === true;
}

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function statusMessage(status: number): string {
  if (status === 400) return "请求内容有误，请检查后重试";
  if (status === 408) return "服务器响应超时，请稍后重试";
  if (status === 401) return "登录已过期，请重新登录";
  if (status === 403) return "当前账号没有操作权限";
  if (status === 404) return "请求的内容不存在或已被删除";
  if (status === 409) return "数据已发生变化，请刷新后重试";
  if (status === 413) return "上传内容过大，请压缩后重试";
  if (status === 429) return "操作过于频繁，请稍后重试";
  if (status >= 500) return "服务器暂时不可用，请稍后重试";
  return `请求失败 (${status})`;
}

function isRetryableHttpStatus(status: number): boolean {
  return RETRYABLE_HTTP_STATUSES.has(status);
}

function redirectToLogin(): void {
  if (typeof window === "undefined" || redirectingToLogin) return;
  if (window.location.pathname === "/login") return;

  redirectingToLogin = true;
  clearLocalAuthCache();
  const current = `${window.location.pathname}${window.location.search}`;
  const loginUrl = new URL("/login", window.location.origin);
  loginUrl.searchParams.set("callbackUrl", current);
  loginUrl.searchParams.set("reason", "session-expired");
  loginUrl.searchParams.set("_ts", Date.now().toString());
  window.location.replace(loginUrl.toString());
}

async function readApiPayload<TData>(response: Response): Promise<ApiResponse<TData> | null> {
  return (await response.json().catch(() => null)) as ApiResponse<TData> | null;
}

async function errorFromResponse(response: Response, fallback?: string): Promise<ApiClientError> {
  const payload = await readApiPayload<unknown>(response);
  const serverMessage =
    payload?.success === false && typeof payload.error === "string" ? payload.error.trim() : "";
  const standardized = statusMessage(response.status);
  return new ApiClientError(serverMessage || standardized || fallback || "请求失败，请稍后重试", {
    status: response.status,
    kind: "http",
    retryable: isRetryableHttpStatus(response.status),
  });
}

function normalizeFetchError(
  error: unknown,
  timedOut: boolean,
  externallyAborted: boolean
): ApiClientError {
  if (timedOut) {
    return new ApiClientError("服务器响应超时，请稍后重试", {
      kind: "timeout",
      retryable: true,
    });
  }
  if (externallyAborted) {
    return new ApiClientError("请求已取消", { kind: "aborted" });
  }
  if (isBrowserOffline()) {
    return new ApiClientError("当前设备已离线，请检查网络连接", {
      kind: "offline",
      retryable: true,
    });
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return new ApiClientError("请求已取消", { kind: "aborted" });
  }
  if (error instanceof ApiClientError) return error;
  if (error instanceof TypeError) {
    return new ApiClientError("无法连接服务器，请检查网络后重试", {
      kind: "network",
      retryable: true,
    });
  }
  return new ApiClientError(error instanceof Error ? error.message : "请求失败，请稍后重试", {
    kind: "network",
    retryable: true,
  });
}

/** 统一请求入口；文件下载和 FormData 等需要原始 Response 的场景也应使用。 */
export async function fetchResponse(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const externalSignal = init?.signal;
  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);

  if (externalSignal?.aborted) abortFromExternalSignal();
  else externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });

  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...init,
      signal: controller.signal,
    });
    if (response.status === 401) redirectToLogin();
    // 完整读取正文后才结束计时，防止只返回响应头、正文流卡住时永久等待。
    const body = await response.arrayBuffer();
    return new Response(body.byteLength > 0 ? body : null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    throw normalizeFetchError(error, timedOut, externalSignal?.aborted === true);
  } finally {
    globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}

export async function parseApiResponse<TData>(response: Response): Promise<TData> {
  const payload = await readApiPayload<TData>(response);

  if (!response.ok) {
    const serverMessage =
      payload?.success === false && typeof payload.error === "string" ? payload.error.trim() : "";
    throw new ApiClientError(serverMessage || statusMessage(response.status), {
      status: response.status,
      kind: "http",
      retryable: isRetryableHttpStatus(response.status),
    });
  }
  if (!isApiSuccess(payload)) {
    const serverMessage =
      payload?.success === false && typeof payload.error === "string" ? payload.error.trim() : "";
    throw new ApiClientError(serverMessage || "服务器返回了无法识别的数据，请稍后重试", {
      status: response.status,
      kind: "invalid-response",
      retryable: true,
    });
  }

  return payload.data;
}

export async function fetchJson<TData>(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<TData> {
  const method = (init?.method ?? "GET").toUpperCase();
  // Only retry idempotent requests. A dropped browser connection can reject a GET
  // before the server has finished returning data even though no write occurred.
  const retry = method === "GET" || method === "HEAD";
  const maxAttempts = retry ? 2 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchResponse(url, init, timeoutMs);
      if (
        attempt < maxAttempts &&
        RETRYABLE_HTTP_STATUSES.has(response.status)
      ) {
        await waitForRetry(GET_RETRY_DELAY_MS, init?.signal);
        continue;
      }
      return parseApiResponse<TData>(response);
    } catch (error) {
      const transientTransportFailure =
        error instanceof ApiClientError &&
        (error.kind === "network" || error.kind === "offline");
      if (attempt < maxAttempts && transientTransportFailure) {
        await waitForRetry(GET_RETRY_DELAY_MS, init?.signal);
        continue;
      }
      throw error;
    }
  }

  throw new ApiClientError("请求失败，请稍后重试", {
    kind: "network",
    retryable: true,
  });
}

function waitForRetry(delayMs: number, signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new ApiClientError("请求已取消", { kind: "aborted" }));
  }

  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);

    function onAbort() {
      globalThis.clearTimeout(timeout);
      reject(new ApiClientError("请求已取消", { kind: "aborted" }));
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function getApiErrorMessage(
  response: Response,
  fallback?: string
): Promise<string> {
  return (await errorFromResponse(response, fallback)).message;
}

/** 将原始 Response 的失败状态转换为保留 status/kind/retryable 的统一异常。 */
export async function getApiError(response: Response, fallback?: string): Promise<ApiClientError> {
  return errorFromResponse(response, fallback);
}

export function getRequestErrorMessage(
  error: unknown,
  fallback = "操作失败，请稍后重试"
): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

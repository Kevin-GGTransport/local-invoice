import type { ApiResponse } from "./types";

export class ApiClientError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

function isApiSuccess<TData>(
  payload: ApiResponse<TData> | null
): payload is Extract<ApiResponse<TData>, { success: true }> {
  return payload?.success === true;
}

export async function parseApiResponse<TData>(
  response: Response
): Promise<TData> {
  const payload = (await response.json().catch(() => null)) as ApiResponse<TData> | null;

  if (!response.ok || !isApiSuccess(payload)) {
    const message =
      payload && payload.success === false && payload.error
        ? payload.error
        : `请求失败 (${response.status})`;
    throw new ApiClientError(message, response.status);
  }

  return payload.data;
}

export async function fetchJson<TData>(
  url: string,
  init?: RequestInit,
  timeoutMs = 30_000
): Promise<TData> {
  const controller = new AbortController();
  let timedOut = false;
  const externalSignal = init?.signal;
  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);

  if (externalSignal?.aborted) {
    abortFromExternalSignal();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });
  }

  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return await parseApiResponse<TData>(response);
  } catch (error) {
    if (timedOut) {
      throw new ApiClientError("请求超时，请检查网络连接后重试");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}

export async function getApiErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  const payload = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
  return payload?.success === false && payload.error ? payload.error : fallback;
}

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
  init?: RequestInit
): Promise<TData> {
  const response = await fetch(url, init);
  return parseApiResponse<TData>(response);
}

export async function getApiErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  const payload = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
  return payload?.success === false && payload.error ? payload.error : fallback;
}

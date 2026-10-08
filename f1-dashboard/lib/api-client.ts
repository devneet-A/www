/**
 * Browser-side helper for calling OUR /api routes (never external APIs).
 * Turns error responses into an Error carrying the friendly message and
 * flags from lib/api-response.ts, so components can show a helpful state.
 */
import type { ApiErrorBody } from "./api-response";

export class ClientApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly authRequired = false,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { signal });
  } catch (err) {
    // Let React Query see aborts as aborts (it cancels stale requests).
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ClientApiError("You appear to be offline", 0);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ClientApiError(body?.error ?? `Request failed (HTTP ${res.status})`, res.status, body?.authRequired);
  }
  return res.json() as Promise<T>;
}

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

/**
 * A short, human explanation of what went wrong, for error cards.
 * Our API already sends friendly messages; this adds context for the
 * cases a fan can act on (offline, wait a moment, credentials).
 */
export function friendlyError(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 0) return "You appear to be offline. We'll retry when you're back online.";
    if (error.authRequired) return "This data needs OpenF1 credentials (see the README).";
    if (error.status === 429) return "The data provider is busy (rate limit). Try again in a few seconds.";
    if (error.status === 504) return "The data provider took too long to answer. Try again in a moment.";
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

/**
 * Small HTTP helper shared by the OpenF1 and Jolpica clients.
 *
 * Why not plain `fetch`?
 *  - Plain fetch has no timeout. A hung upstream would make our route handler
 *    hang until Vercel kills it (10s on the free tier). We abort earlier
 *    and return a friendly error instead.
 *  - We want one error type (`ApiError`) that route handlers can turn into
 *    a JSON error response with the right status code.
 *
 * This file is server-only: it may read secrets via the clients that use it.
 */
import "server-only";

/** The upstream an error came from, shown in error messages and logs. */
export type Upstream = "openf1" | "jolpica";

export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP status we should return to *our* client. */
    public readonly status: number,
    public readonly upstream: Upstream,
    /** True when the upstream says we need (better) credentials. */
    public readonly authRequired = false,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Default upstream timeout. Kept well under Vercel's 10s function limit. */
const DEFAULT_TIMEOUT_MS = 8_000;

interface FetchJsonOptions {
  upstream: Upstream;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Requests per second allowed to this upstream (see `waitForSlot`). */
  perSecond?: number;
}

// ---------------------------------------------------------------------------
// Request spacing (rate limiting)
// ---------------------------------------------------------------------------

/**
 * Spaces out request STARTS per upstream, e.g. 3/s means one every ~333ms.
 * A cold page load can fire 7+ requests at once (Promise.all); without this
 * they'd hit the upstream in the same instant and trip its burst limit.
 * The queue is per server instance, so it smooths bursts from one page load;
 * the caches (server + CDN) are what keep total traffic low.
 */
const nextSlot: Record<Upstream, number> = { openf1: 0, jolpica: 0 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForSlot(upstream: Upstream, perSecond: number) {
  const now = Date.now();
  const slot = Math.max(now, nextSlot[upstream]);
  nextSlot[upstream] = slot + 1000 / perSecond;
  if (slot > now) await sleep(slot - now);
}

/** Wait from a Retry-After header (seconds), capped so we stay inside the function time limit. */
function retryAfterMs(res: Response): number {
  const seconds = Number(res.headers.get("retry-after"));
  return Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1500, 3000);
}

export async function fetchJson<T>(url: string, opts: FetchJsonOptions, attempt = 1): Promise<T> {
  const { upstream, headers, timeoutMs = DEFAULT_TIMEOUT_MS, perSecond = 4 } = opts;

  await waitForSlot(upstream, perSecond);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      signal: AbortSignal.timeout(timeoutMs),
      // Caching is done one level up with `"use cache"` (see lib/openf1.ts),
      // so the raw fetch itself must never be cached on its own.
      cache: "no-store",
    });
  } catch (err) {
    // AbortSignal.timeout() rejects with a DOMException named "TimeoutError".
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new ApiError(
      timedOut ? `${upstream} timed out after ${timeoutMs}ms` : `${upstream} is unreachable`,
      timedOut ? 504 : 502,
      upstream,
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new ApiError(`${upstream} requires authentication for this data`, 401, upstream, true);
  }
  if (res.status === 429) {
    // One polite retry after the wait the API asks for; then give up with a clear message.
    if (attempt === 1) {
      await sleep(retryAfterMs(res));
      return fetchJson<T>(url, opts, 2);
    }
    throw new ApiError(`${upstream} rate limit reached, try again shortly`, 429, upstream);
  }
  // OpenF1 answers 404 when a filter matches nothing. For a dashboard
  // "no rows yet" is a normal state (e.g. no pit stops in lap 1), not an error.
  if (res.status === 404 && upstream === "openf1") {
    return [] as T;
  }
  if (!res.ok) {
    throw new ApiError(`${upstream} responded with HTTP ${res.status}`, 502, upstream);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(`${upstream} returned invalid JSON`, 502, upstream);
  }
}

// ---------------------------------------------------------------------------
// Crossing the "use cache" boundary
// ---------------------------------------------------------------------------

/**
 * Values returned from a "use cache" function are serialized. Thrown errors
 * are serialized too, and in production Next.js strips the class and message,
 * so a thrown ApiError would arrive as a generic "Server Components render"
 * error with no status code. Cached functions therefore RETURN this plain
 * object, and `unwrap()` turns it back into data or a real ApiError outside
 * the cache.
 */
export type CachedResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string; status: number; upstream: Upstream; authRequired: boolean } };

export function toErrorResult(err: unknown, upstream: Upstream): CachedResult<never> {
  if (err instanceof ApiError) {
    return {
      ok: false,
      error: { message: err.message, status: err.status, upstream: err.upstream, authRequired: err.authRequired },
    };
  }
  console.error(`[${upstream}] unexpected error`, err);
  return { ok: false, error: { message: `Unexpected error talking to ${upstream}`, status: 500, upstream, authRequired: false } };
}

export function unwrap<T>(result: CachedResult<T>): T {
  if (result.ok) return result.data;
  const { message, status, upstream, authRequired } = result.error;
  throw new ApiError(message, status, upstream, authRequired);
}

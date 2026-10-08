/**
 * Helpers for building Route Handler responses.
 *
 * Caching has two layers:
 *  1. "use cache" in lib/openf1.ts and lib/jolpica.ts (per server instance).
 *  2. The CDN (Vercel's Edge Network) via the Cache-Control header set here.
 *     `s-maxage` is how long the CDN serves the response without calling
 *     our function at all; `stale-while-revalidate` lets it keep serving the
 *     old copy while it fetches a new one in the background. The CDN cache
 *     key includes the query string, so each session/filter is cached separately.
 */
import "server-only";
import { ApiError } from "./http";

/** CDN cache presets in seconds, matching the cacheLife profiles in next.config.ts. */
export const CDN = {
  live: { sMaxAge: 4, swr: 10 },
  session: { sMaxAge: 60, swr: 300 },
  static: { sMaxAge: 3 * 60 * 60, swr: 24 * 60 * 60 },
  historical: { sMaxAge: 24 * 60 * 60, swr: 7 * 24 * 60 * 60 },
} as const;

export type CdnPreset = keyof typeof CDN;

/** Shape of every error our API returns, so the UI can show friendly messages. */
export interface ApiErrorBody {
  error: string;
  upstream?: string;
  authRequired?: boolean;
}

export function json<T>(data: T, preset: CdnPreset): Response {
  const { sMaxAge, swr } = CDN[preset];
  return Response.json(data, {
    headers: {
      "Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
    },
  });
}

/** Turn any thrown value into a JSON error response. Errors are never cached. */
export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    const body: ApiErrorBody = { error: err.message, upstream: err.upstream, authRequired: err.authRequired };
    return Response.json(body, { status: err.status, headers: { "Cache-Control": "no-store" } });
  }
  console.error("[api] unexpected error", err);
  const body: ApiErrorBody = { error: "Something went wrong on our side" };
  return Response.json(body, { status: 500, headers: { "Cache-Control": "no-store" } });
}

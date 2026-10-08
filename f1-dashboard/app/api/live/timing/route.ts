/**
 * GET /api/live/timing?session_key=9161&mode=full|delta
 *
 * Everything the Home page needs for one session in one request: timing
 * tower data, race control messages and the latest weather. See
 * lib/live-timing.ts for how it stays within OpenF1's rate limits.
 */
import type { NextRequest } from "next/server";
import { errorResponse, json } from "@/lib/api-response";
import { ApiError } from "@/lib/http";
import { buildTimingPayload } from "@/lib/live-timing";

export async function GET(request: NextRequest) {
  // Read the query OUTSIDE the try block: during `next build`, Next.js
  // signals "this route is dynamic" by throwing here, and that signal must
  // not be swallowed by our catch.
  const params = request.nextUrl.searchParams;
  const rawKey = params.get("session_key") ?? "";
  try {
    // Validate before using it in an upstream URL.
    if (!/^\d{1,7}$/.test(rawKey)) throw new ApiError("session_key must be a number", 400, "openf1");
    const mode = params.get("mode") === "delta" ? "delta" : "full";

    const payload = await buildTimingPayload(Number(rawKey), mode, Date.now());

    // Live data: a few seconds at the CDN. Finished sessions: days.
    // A session that hasn't started yet uses "live" too, so it starts
    // updating as soon as the lights go green.
    return json(payload, payload.completed ? "historical" : "live");
  } catch (err) {
    return errorResponse(err);
  }
}

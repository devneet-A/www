/**
 * GET /api/session/current
 *
 * Returns the sessions around "now" (latest completed, live, upcoming) plus
 * whether we have credentials for live data. The browser decides live/next
 * from these times itself (lib/session-state.ts), so a 30s CDN cache is fine:
 * the badge and countdown still flip on the exact second.
 */
import { connection } from "next/server";
import { errorResponse, json } from "@/lib/api-response";
import { buildSessionOverview } from "@/lib/session-overview";

export async function GET() {
  // Depends on the current time, so it must run per request rather than
  // being prerendered at build time.
  await connection();
  try {
    const overview = await buildSessionOverview(Date.now());
    // A partial answer (an upstream failed) is only cached for a few seconds
    // so we pick up the recovery quickly.
    return json(overview, overview.warnings.length > 0 ? "live" : "session");
  } catch (err) {
    return errorResponse(err);
  }
}

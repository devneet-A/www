/**
 * GET /api/analysis/sessions?year=2025
 * Grands Prix of a season with the sessions that have started, for the
 * year → Grand Prix → session selector.
 */
import type { NextRequest } from "next/server";
import { buildMeetingList } from "@/lib/analysis-server";
import { errorResponse, json } from "@/lib/api-response";
import { intParam } from "@/lib/params";

export async function GET(request: NextRequest) {
  // Read the query outside try/catch (see app/api/live/timing/route.ts).
  const params = request.nextUrl.searchParams;
  try {
    // OpenF1 data starts in 2023.
    const year = intParam(params, "year", { min: 2023, max: new Date().getUTCFullYear() + 1 });
    return json(await buildMeetingList(year, Date.now()), "session");
  } catch (err) {
    return errorResponse(err);
  }
}

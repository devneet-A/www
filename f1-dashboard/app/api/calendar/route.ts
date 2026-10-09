/**
 * GET /api/calendar?year=2026
 * Every round with its session start times (UTC) and, once raced, the winner.
 */
import type { NextRequest } from "next/server";
import { errorResponse, json } from "@/lib/api-response";
import { intParam } from "@/lib/params";
import { buildCalendar } from "@/lib/standings-server";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  try {
    const thisYear = new Date().getUTCFullYear();
    // +1: next season's calendar is usually published in the autumn.
    const year = intParam(params, "year", { min: 1950, max: thisYear + 1 });
    const data = await buildCalendar(year, Date.now());
    return json(data, year < thisYear ? "historical" : "static");
  } catch (err) {
    return errorResponse(err);
  }
}

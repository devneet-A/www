/**
 * GET /api/standings?year=2026
 * Drivers' and constructors' championships plus points after every round.
 */
import type { NextRequest } from "next/server";
import { errorResponse, json } from "@/lib/api-response";
import { intParam } from "@/lib/params";
import { buildStandings } from "@/lib/standings-server";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  try {
    const thisYear = new Date().getUTCFullYear();
    // Jolpica covers every season since 1950.
    const year = intParam(params, "year", { min: 1950, max: thisYear });
    const data = await buildStandings(year, Date.now());
    // A finished season never changes; the current one changes after each session.
    return json(data, year < thisYear ? "historical" : "static");
  } catch (err) {
    return errorResponse(err);
  }
}

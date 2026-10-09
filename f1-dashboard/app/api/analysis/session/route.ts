/**
 * GET /api/analysis/session?session_key=9161
 * Everything the lap-time, position, gap and tyre-strategy charts need.
 */
import type { NextRequest } from "next/server";
import { buildSessionAnalysis } from "@/lib/analysis-server";
import { errorResponse, json } from "@/lib/api-response";
import { intParam } from "@/lib/params";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  try {
    const sessionKey = intParam(params, "session_key");
    const analysis = await buildSessionAnalysis(sessionKey, Date.now());
    return json(analysis, analysis.session.completed ? "historical" : "session");
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * GET /api/analysis/telemetry?session_key=9161&driver_number=1
 * Speed / throttle / brake / gear samples for a driver's fastest lap.
 */
import type { NextRequest } from "next/server";
import { buildTelemetry } from "@/lib/analysis-server";
import { errorResponse, json } from "@/lib/api-response";
import { intParam } from "@/lib/params";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  try {
    const sessionKey = intParam(params, "session_key");
    const driverNumber = intParam(params, "driver_number", { min: 1, max: 99 });
    // A fastest lap only changes while the session runs; the route caches
    // like a session list (60s) and the server-side cache handles the rest.
    return json(await buildTelemetry(sessionKey, driverNumber, Date.now()), "session");
  } catch (err) {
    return errorResponse(err);
  }
}

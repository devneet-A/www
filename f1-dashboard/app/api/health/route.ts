/**
 * GET /api/health — the step-1 test route.
 *
 * Calls both upstream APIs once and reports whether each answered, how long
 * it took and a tiny sample, so you can confirm the clients, types and
 * caching work before any UI exists. Open it in the browser:
 * http://localhost:3000/api/health
 */
import * as openf1 from "@/lib/openf1";
import * as jolpica from "@/lib/jolpica";
import { ApiError } from "@/lib/http";
import { connection } from "next/server";

interface Check<T> {
  ok: boolean;
  ms: number;
  sample?: T;
  error?: string;
}

/** Run one check and capture timing + errors instead of throwing. */
async function check<T>(fn: () => Promise<T>): Promise<Check<T>> {
  const start = performance.now();
  try {
    const sample = await fn();
    return { ok: true, ms: Math.round(performance.now() - start), sample };
  } catch (err) {
    const error = err instanceof ApiError ? err.message : String(err);
    return { ok: false, ms: Math.round(performance.now() - start), error };
  }
}

export async function GET() {
  // With Cache Components, a GET handler that reads no request data is
  // prerendered once at build time. connection() opts this one out so it
  // runs on every request, which is the whole point of a health check.
  await connection();

  // Run both checks in parallel; neither depends on the other.
  const [openf1Check, jolpicaCheck] = await Promise.all([
    check(async () => {
      const [session] = await openf1.getSessions([openf1.f("session_key", "latest")]);
      if (!session) return null;
      return {
        session_key: session.session_key,
        session_name: session.session_name,
        location: session.location,
        date_start: session.date_start,
        date_end: session.date_end,
      };
    }),
    check(async () => {
      const races = await jolpica.getSchedule("current");
      return { season: races[0]?.season, rounds: races.length, firstRace: races[0]?.raceName };
    }),
  ]);

  return Response.json(
    {
      ok: openf1Check.ok && jolpicaCheck.ok,
      openf1: { ...openf1Check, authenticated: openf1.hasOpenF1Auth() },
      jolpica: jolpicaCheck,
      checkedAt: new Date().toISOString(),
    },
    // A health check should always be fresh.
    { headers: { "Cache-Control": "no-store" } },
  );
}

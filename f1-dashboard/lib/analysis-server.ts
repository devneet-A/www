/**
 * Builds the /analysis payloads from OpenF1.
 *
 * Position and gap-to-leader per lap are derived from LAP TIMESTAMPS rather
 * than the `intervals` feed: the moment a car finishes lap N is when its lap
 * N+1 starts (or lap N's start + duration). Sorting cars by that moment
 * gives the order at the line, and the time behind the first car is the gap.
 * The intervals feed would be ~36k rows (several MB) per race for the same answer.
 *
 * The built payloads are cached whole ("use cache"), so the raw rows are
 * only processed once per session.
 */
import "server-only";
import { cacheLife } from "next/cache";
import * as openf1 from "./openf1";
import { isRaceSession } from "./f1";
import { ApiError, toErrorResult, unwrap, type CachedResult } from "./http";
import { isCompleted } from "./session-state";
import type {
  AnalysisDriver,
  AnalysisMeeting,
  LapPoint,
  LapTelemetry,
  SessionAnalysis,
  StintBar,
  TelemetrySample,
} from "./analysis";

const { f } = openf1;

// ---------------------------------------------------------------------------
// Session list for the selector
// ---------------------------------------------------------------------------

export async function buildMeetingList(year: number, now: number): Promise<AnalysisMeeting[]> {
  const [sessions, meetings] = await Promise.all([
    openf1.getSessions([f("year", year)], "session"),
    openf1.getMeetings([f("year", year)], "static"),
  ]);
  const byMeeting = new Map<number, AnalysisMeeting>();
  for (const m of meetings) {
    if (m.is_cancelled) continue;
    byMeeting.set(m.meeting_key, { meetingKey: m.meeting_key, name: m.meeting_name, dateStart: m.date_start, sessions: [] });
  }
  for (const s of sessions) {
    // Only sessions that have started have data to analyse.
    if (s.is_cancelled || Date.parse(s.date_start) > now) continue;
    byMeeting.get(s.meeting_key)?.sessions.push({
      sessionKey: s.session_key,
      name: s.session_name,
      dateStart: s.date_start,
      completed: isCompleted({ start: s.date_start, end: s.date_end, name: s.session_name }, now),
    });
  }
  return [...byMeeting.values()]
    .filter((m) => m.sessions.length > 0)
    .map((m) => ({ ...m, sessions: m.sessions.sort((a, b) => a.dateStart.localeCompare(b.dateStart)) }))
    .sort((a, b) => a.dateStart.localeCompare(b.dateStart));
}

// ---------------------------------------------------------------------------
// Session analysis
// ---------------------------------------------------------------------------

/** Laps grouped per driver, sorted by lap number, with each lap's end time (ms). */
function lapEnds(laps: openf1.Lap[]) {
  const perDriver = new Map<number, openf1.Lap[]>();
  for (const lap of laps) {
    const list = perDriver.get(lap.driver_number) ?? [];
    list.push(lap);
    perDriver.set(lap.driver_number, list);
  }
  // endTimes[driver][lap] = epoch ms when that lap was completed.
  const endTimes = new Map<number, Map<number, number>>();
  for (const [driver, list] of perDriver) {
    list.sort((a, b) => a.lap_number - b.lap_number);
    const ends = new Map<number, number>();
    list.forEach((lap, i) => {
      const next = list[i + 1];
      if (next?.date_start && next.lap_number === lap.lap_number + 1) {
        ends.set(lap.lap_number, Date.parse(next.date_start));
      } else if (lap.date_start && lap.lap_duration != null) {
        ends.set(lap.lap_number, Date.parse(lap.date_start) + lap.lap_duration * 1000);
      }
    });
    endTimes.set(driver, ends);
  }
  return { perDriver, endTimes };
}

async function getSession(sessionKey: number) {
  const [session] = await openf1.getSessions([f("session_key", sessionKey)], "session");
  if (!session) throw new ApiError(`Session ${sessionKey} not found`, 404, "openf1");
  return session;
}

/** Look up a session and whether it has finished (cached for a minute). */
async function sessionStatus(sessionKey: number, now: number) {
  const session = await getSession(sessionKey);
  const completed = isCompleted({ start: session.date_start, end: session.date_end, name: session.session_name }, now);
  return { session, completed };
}

async function buildSessionAnalysisUncached(sessionKey: number, completed: boolean): Promise<SessionAnalysis> {
  const session = await getSession(sessionKey);
  const profile: openf1.CacheProfile = completed ? "historical" : "session";
  const race = isRaceSession(session.session_name);

  const [drivers, laps, stints, pits, positionRows, meetings] = await Promise.all([
    openf1.getDrivers(sessionKey, completed ? "historical" : "static"),
    openf1.getLaps(sessionKey, [], profile),
    openf1.getStints(sessionKey, [], profile),
    openf1.getPitStops(sessionKey, [], profile),
    // Only needed for the starting grid (lap 0) of the position chart.
    race ? openf1.getPositions(sessionKey, [], profile) : Promise.resolve([]),
    openf1.getMeetings([f("meeting_key", session.meeting_key)], "static"),
  ]);

  const { perDriver, endTimes } = lapEnds(laps);
  const totalLaps = laps.reduce((max, l) => Math.max(max, l.lap_number), 0);
  const pitInLaps = new Set(pits.map((p) => `${p.driver_number}:${p.lap_number}`));

  // --- Lap times -------------------------------------------------------------
  const lapPoints: Record<number, LapPoint[]> = {};
  const fastestLaps: SessionAnalysis["fastestLaps"] = {};
  for (const [driver, list] of perDriver) {
    lapPoints[driver] = list.map((l) => ({
      lap: l.lap_number,
      time: l.lap_duration,
      pitOut: l.is_pit_out_lap,
      pitIn: pitInLaps.has(`${driver}:${l.lap_number}`),
    }));
    for (const l of list) {
      if (l.lap_duration == null || l.is_pit_out_lap) continue;
      const best = fastestLaps[driver];
      if (!best || l.lap_duration < best.time) fastestLaps[driver] = { lap: l.lap_number, time: l.lap_duration };
    }
  }

  // --- Position & gap per lap (races and sprints) ---------------------------
  const positions: SessionAnalysis["positions"] = {};
  const gaps: SessionAnalysis["gaps"] = {};
  const driverNumbers = [...new Set([...drivers.map((d) => d.driver_number), ...perDriver.keys()])];
  if (race) {
    for (const n of driverNumbers) {
      positions[n] = Array(totalLaps + 1).fill(null);
      gaps[n] = Array(totalLaps + 1).fill(null);
    }
    // Lap 0: each driver's first position row is their grid slot.
    const grid = new Map<number, openf1.Position>();
    for (const p of positionRows) {
      const cur = grid.get(p.driver_number);
      if (!cur || p.date < cur.date) grid.set(p.driver_number, p);
    }
    for (const [n, p] of grid) if (positions[n]) positions[n][0] = p.position;

    for (let lap = 1; lap <= totalLaps; lap++) {
      const finishers = driverNumbers
        .map((n) => ({ n, end: endTimes.get(n)?.get(lap) }))
        .filter((x): x is { n: number; end: number } => x.end !== undefined)
        .sort((a, b) => a.end - b.end);
      const leaderEnd = finishers[0]?.end;
      finishers.forEach(({ n, end }, i) => {
        positions[n][lap] = i + 1;
        gaps[n][lap] = leaderEnd === undefined ? null : Math.round(end - leaderEnd) / 1000;
      });
    }
  }

  // --- Finishing order --------------------------------------------------------
  // Race: most laps completed, then earliest to finish the last one.
  // Other sessions: fastest lap.
  const finishKey = (n: number): [number, number] => {
    if (race) {
      const ends = endTimes.get(n);
      const lastLap = ends ? Math.max(0, ...ends.keys()) : 0;
      return [-lastLap, ends?.get(lastLap) ?? Infinity];
    }
    return [0, fastestLaps[n]?.time ?? Infinity];
  };
  const order = [...driverNumbers].sort((a, b) => {
    const [a1, a2] = finishKey(a);
    const [b1, b2] = finishKey(b);
    return a1 - b1 || a2 - b2 || a - b;
  });

  const driverInfo = new Map(drivers.map((d) => [d.driver_number, d]));
  const teamSeen = new Map<string, number>();
  const analysisDrivers: AnalysisDriver[] = order.map((n, i) => {
    const d = driverInfo.get(n);
    const team = d?.team_name ?? `#${n}`;
    const teamIndex = teamSeen.get(team) ?? 0;
    teamSeen.set(team, teamIndex + 1);
    return {
      driver_number: n,
      name_acronym: d?.name_acronym ?? String(n),
      full_name: d?.full_name ?? `Car ${n}`,
      team_name: d?.team_name ?? null,
      team_colour: d?.team_colour ?? null,
      finish: lapPoints[n]?.length ? i + 1 : null,
      teamIndex,
    };
  });

  const stintBars: StintBar[] = stints.map((s) => ({
    driver: s.driver_number,
    stint: s.stint_number,
    compound: s.compound,
    lapStart: s.lap_start,
    lapEnd: s.lap_end,
    ageAtStart: s.tyre_age_at_start,
  }));

  return {
    session: {
      sessionKey,
      name: session.session_name,
      meetingName: meetings[0]?.meeting_name ?? session.location,
      year: session.year,
      isRace: race,
      completed,
    },
    drivers: analysisDrivers,
    totalLaps,
    laps: lapPoints,
    positions,
    gaps,
    stints: stintBars,
    fastestLaps,
  };
}

/**
 * Cached wrapper. `completed` is part of the cache key on purpose: while a
 * session runs it's cached for a minute; the moment it finishes, the key
 * changes and the final version is built and cached for days.
 */
async function cachedSessionAnalysis(sessionKey: number, completed: boolean): Promise<CachedResult<SessionAnalysis>> {
  "use cache";
  try {
    const data = await buildSessionAnalysisUncached(sessionKey, completed);
    if (completed) cacheLife("historical");
    else cacheLife("session");
    return { ok: true, data };
  } catch (err) {
    cacheLife("error");
    return toErrorResult(err, "openf1");
  }
}

export async function buildSessionAnalysis(sessionKey: number, now: number) {
  const { completed } = await sessionStatus(sessionKey, now);
  return unwrap(await cachedSessionAnalysis(sessionKey, completed));
}

// ---------------------------------------------------------------------------
// Telemetry for a driver's fastest lap
// ---------------------------------------------------------------------------

async function buildTelemetryUncached(sessionKey: number, driverNumber: number, completed: boolean): Promise<LapTelemetry> {
  // During a live session the fastest lap can still improve, so cache briefly.
  const profile: openf1.CacheProfile = completed ? "historical" : "session";

  const laps = await openf1.getLaps(sessionKey, [f("driver_number", driverNumber)], profile);
  const fastest = laps
    .filter((l) => l.lap_duration != null && l.date_start && !l.is_pit_out_lap)
    .sort((a, b) => a.lap_duration! - b.lap_duration!)[0];
  if (!fastest) throw new ApiError(`No timed laps for car ${driverNumber} in this session`, 404, "openf1");

  const start = Date.parse(fastest.date_start!);
  const end = start + fastest.lap_duration! * 1000;
  const rows = await openf1.getCarData(
    sessionKey,
    driverNumber,
    new Date(start).toISOString(),
    new Date(end).toISOString(),
    profile,
  );
  rows.sort((a, b) => a.date.localeCompare(b.date));

  // Integrate speed over time to get distance along the lap (trapezoid rule).
  // OpenF1 doesn't publish distance; this is how FastF1 derives it too.
  const samples: TelemetrySample[] = [];
  let distance = 0;
  rows.forEach((row, i) => {
    const t = (Date.parse(row.date) - start) / 1000;
    if (i > 0) {
      const prev = rows[i - 1];
      const dt = (Date.parse(row.date) - Date.parse(prev.date)) / 1000;
      distance += (((prev.speed + row.speed) / 2) * dt) / 3.6; // km/h → m/s
    }
    samples.push({
      t: Math.round(t * 1000) / 1000,
      d: Math.round(distance),
      speed: row.speed,
      throttle: row.throttle,
      // OpenF1 reports brake as 0 or 100 (on/off), not pressure.
      brake: row.brake > 0 ? 100 : 0,
      gear: row.n_gear,
    });
  });

  return { driverNumber, lap: fastest.lap_number, lapTime: fastest.lap_duration!, samples };
}

async function cachedTelemetry(
  sessionKey: number,
  driverNumber: number,
  completed: boolean,
): Promise<CachedResult<LapTelemetry>> {
  "use cache";
  try {
    const data = await buildTelemetryUncached(sessionKey, driverNumber, completed);
    if (completed) cacheLife("historical");
    else cacheLife("session");
    return { ok: true, data };
  } catch (err) {
    cacheLife("error");
    return toErrorResult(err, "openf1");
  }
}

/** Returns the telemetry plus whether the session has finished (for CDN cache headers). */
export async function buildTelemetry(sessionKey: number, driverNumber: number, now: number) {
  const { completed } = await sessionStatus(sessionKey, now);
  return { telemetry: unwrap(await cachedTelemetry(sessionKey, driverNumber, completed)), completed };
}

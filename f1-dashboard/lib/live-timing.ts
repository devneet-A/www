/**
 * Builds TimingPayloads (see lib/timing.ts) from OpenF1 for one session.
 *
 * Rate-limit strategy:
 *  - Delta payloads only ask OpenF1 for rows newer than a time window
 *    (`date>` filters). The window start is rounded to 5 seconds, so every
 *    visitor in the same 5s slice causes the SAME upstream URLs, and the
 *    "use cache" layer serves all of them from one request.
 *  - Small tables (stints, pit) are fetched whole every time. That's simpler
 *    than tracking which rows changed, and they're only a few dozen rows.
 *  - Everything is reduced to "latest per driver" here, so the browser
 *    downloads a few KB instead of hundreds of KB of raw rows.
 */
import "server-only";
import * as openf1 from "./openf1";
import { ApiError } from "./http";
import { isRaceSession } from "./f1";
import { isCompleted, isLive } from "./session-state";
import {
  DELTA_WINDOW_MS,
  type DriverInterval,
  type DriverLaps,
  type DriverPosition,
  type DriverStint,
  type RaceControlItem,
  type TimingDriver,
  type TimingPayload,
  type WeatherNow,
} from "./timing";

const { f } = openf1;

/** Round down to a 5s boundary so concurrent requests share upstream URLs. */
const bucket = (ms: number) => new Date(Math.floor(ms / 5000) * 5000).toISOString();

// ---------------------------------------------------------------------------
// Reducers: raw OpenF1 rows → latest-per-driver summaries
// ---------------------------------------------------------------------------

function latestPerDriver<T extends { driver_number: number; date: string }>(rows: T[]): T[] {
  const latest = new Map<number, T>();
  for (const row of rows) {
    const cur = latest.get(row.driver_number);
    if (!cur || row.date >= cur.date) latest.set(row.driver_number, row);
  }
  return [...latest.values()];
}

function summariseLaps(rows: openf1.Lap[]): DriverLaps[] {
  const out = new Map<number, DriverLaps>();
  for (const lap of rows) {
    const cur = out.get(lap.driver_number) ?? {
      driver_number: lap.driver_number,
      lap_number: 0,
      last_lap_number: null,
      last_lap_duration: null,
      best_lap_duration: null,
    };
    cur.lap_number = Math.max(cur.lap_number, lap.lap_number);
    if (lap.lap_duration != null) {
      if (cur.last_lap_number == null || lap.lap_number > cur.last_lap_number) {
        cur.last_lap_number = lap.lap_number;
        cur.last_lap_duration = lap.lap_duration;
      }
      // Pit out-laps are slow and never "best" in timing screens.
      if (!lap.is_pit_out_lap && (cur.best_lap_duration == null || lap.lap_duration < cur.best_lap_duration)) {
        cur.best_lap_duration = lap.lap_duration;
      }
    }
    out.set(lap.driver_number, cur);
  }
  return [...out.values()];
}

function currentStints(rows: openf1.Stint[]): DriverStint[] {
  const latest = new Map<number, openf1.Stint>();
  for (const s of rows) {
    const cur = latest.get(s.driver_number);
    if (!cur || s.stint_number > cur.stint_number) latest.set(s.driver_number, s);
  }
  return [...latest.values()].map((s) => ({
    driver_number: s.driver_number,
    stint_number: s.stint_number,
    compound: s.compound,
    lap_start: s.lap_start,
    lap_end: s.lap_end,
    tyre_age_at_start: s.tyre_age_at_start,
  }));
}

function pitCounts(rows: openf1.PitStop[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const p of rows) counts[p.driver_number] = (counts[p.driver_number] ?? 0) + 1;
  return counts;
}

// Pick only the fields the UI uses, so payloads stay small.
const toPosition = (p: openf1.Position): DriverPosition => ({
  driver_number: p.driver_number,
  position: p.position,
  date: p.date,
});
const toInterval = (i: openf1.Interval): DriverInterval => ({
  driver_number: i.driver_number,
  gap_to_leader: i.gap_to_leader,
  interval: i.interval,
  date: i.date,
});
const toRaceControl = (m: openf1.RaceControlMessage): RaceControlItem => ({
  date: m.date,
  category: m.category,
  flag: m.flag,
  scope: m.scope,
  sector: m.sector,
  driver_number: m.driver_number,
  lap_number: m.lap_number,
  message: m.message,
});
const toDriver = (d: openf1.Driver): TimingDriver => ({
  driver_number: d.driver_number,
  name_acronym: d.name_acronym,
  full_name: d.full_name,
  team_name: d.team_name,
  team_colour: d.team_colour,
});
function toWeather(rows: openf1.Weather[]): WeatherNow | null {
  const w = rows.reduce<openf1.Weather | null>((a, b) => (!a || b.date > a.date ? b : a), null);
  if (!w) return null;
  const { date, air_temperature, track_temperature, humidity, pressure, rainfall, wind_direction, wind_speed } = w;
  return { date, air_temperature, track_temperature, humidity, pressure, rainfall, wind_direction, wind_speed };
}

// ---------------------------------------------------------------------------
// Payload builder
// ---------------------------------------------------------------------------

export async function buildTimingPayload(
  sessionKey: number,
  requestedMode: "full" | "delta",
  now: number,
): Promise<TimingPayload> {
  const [session] = await openf1.getSessions([f("session_key", sessionKey)], "session");
  if (!session) throw new ApiError(`Session ${sessionKey} not found`, 404, "openf1");

  const timed = { start: session.date_start, end: session.date_end, name: session.session_name };
  const live = isLive(timed, now);
  // Finished sessions never change: cache them for days. Running (or
  // not-yet-started) sessions get the few-seconds "live" lifetime.
  const completed = isCompleted(timed, now);
  const profile: openf1.CacheProfile = completed ? "historical" : "live";
  // Deltas only make sense while live; otherwise always send everything.
  const mode = live ? requestedMode : "full";
  const race = isRaceSession(session.session_name);

  // Small tables: always fetched whole.
  const smallTables = Promise.all([
    openf1.getStints(sessionKey, [], profile),
    openf1.getPitStops(sessionKey, [], profile),
  ]);

  let positions: openf1.Position[];
  let intervals: openf1.Interval[] = [];
  let laps: openf1.Lap[];
  let raceControl: openf1.RaceControlMessage[];
  let weather: openf1.Weather[];
  let drivers: openf1.Driver[] | undefined;

  if (mode === "delta") {
    const since = bucket(now - DELTA_WINDOW_MS);
    // Laps are stamped with their START time, so look back further to catch
    // laps that started up to ~5 minutes ago (slow laps behind a safety car).
    const lapsSince = bucket(now - 5 * 60_000);
    // Weather rows arrive about once a minute.
    const weatherSince = bucket(now - 2 * 60_000);
    [positions, intervals, laps, raceControl, weather] = await Promise.all([
      openf1.getPositions(sessionKey, [f("date", ">", since)], profile),
      race ? openf1.getIntervals(sessionKey, [f("date", ">", since)], profile) : Promise.resolve([]),
      openf1.getLaps(sessionKey, [f("date_start", ">", lapsSince)], profile),
      openf1.getRaceControl(sessionKey, [f("date", ">", since)], profile),
      openf1.getWeather(sessionKey, [f("date", ">", weatherSince)], profile),
    ]);
  } else {
    [positions, laps, raceControl, weather, drivers] = await Promise.all([
      openf1.getPositions(sessionKey, [], profile),
      openf1.getLaps(sessionKey, [], profile),
      openf1.getRaceControl(sessionKey, [], profile),
      openf1.getWeather(sessionKey, [], profile),
      openf1.getDrivers(sessionKey, profile === "historical" ? "historical" : "static"),
    ]);
    if (race) {
      // The full intervals feed is huge (a row per car every ~4s). We only
      // need the latest gap per car, so look back 2 minutes from the most
      // recent lap start: every car still running has a row in that window.
      const latestLapStart = laps.reduce((max, l) => (l.date_start && l.date_start > max ? l.date_start : max), "");
      const from = latestLapStart
        ? new Date(Date.parse(latestLapStart) - 120_000).toISOString()
        : bucket(now - DELTA_WINDOW_MS);
      intervals = await openf1.getIntervals(sessionKey, [f("date", ">=", from)], profile);
    }
  }

  const [stints, pits] = await smallTables;

  return {
    mode,
    sessionKey,
    sessionName: session.session_name,
    live,
    completed,
    generatedAt: new Date(now).toISOString(),
    drivers: drivers?.map(toDriver),
    positions: latestPerDriver(positions).map(toPosition),
    intervals: latestPerDriver(intervals).map(toInterval),
    laps: summariseLaps(laps),
    stints: currentStints(stints),
    pitCounts: pitCounts(pits),
    raceControl: raceControl.map(toRaceControl).sort((a, b) => b.date.localeCompare(a.date)),
    weather: toWeather(weather),
  };
}

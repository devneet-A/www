/**
 * Live timing data model, shared by the server (which builds payloads) and
 * the browser (which merges them and builds the timing tower).
 *
 * The flow:
 *  1. The browser asks /api/live/timing?mode=full once: the latest state of
 *     every driver, already reduced on the server to a few KB.
 *  2. While the session is live it polls mode=delta every ~4.5s: only rows
 *     from the last ~30s. `mergeTiming()` folds them into the state.
 *  3. If the browser missed too much (tab hidden, network blip) it asks for
 *     a full payload again instead of risking gaps.
 */
import { formatGap, isRaceSession } from "./f1";

// ---------------------------------------------------------------------------
// Payload (what the server sends)
// ---------------------------------------------------------------------------

/** How much history a delta payload covers. The client re-syncs past this. */
export const DELTA_WINDOW_MS = 30_000;
/** Ask for a full payload if the last successful fetch is older than this. */
export const RESYNC_AFTER_MS = 15_000;

export interface TimingDriver {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  team_name: string | null;
  team_colour: string | null;
}

export interface DriverPosition {
  driver_number: number;
  position: number;
  date: string;
}

export interface DriverInterval {
  driver_number: number;
  gap_to_leader: number | string | null;
  interval: number | string | null;
  date: string;
}

export interface DriverLaps {
  driver_number: number;
  /** Highest lap number seen (the lap in progress, or the last one). */
  lap_number: number;
  /** Number and time of the latest lap that has a time. */
  last_lap_number: number | null;
  last_lap_duration: number | null;
  /** Fastest lap time among the rows the server looked at. */
  best_lap_duration: number | null;
}

export interface DriverStint {
  driver_number: number;
  stint_number: number;
  compound: string | null;
  lap_start: number;
  lap_end: number;
  tyre_age_at_start: number | null;
}

export interface RaceControlItem {
  date: string;
  category: string;
  flag: string | null;
  scope: string | null;
  sector: number | null;
  driver_number: number | null;
  lap_number: number | null;
  message: string;
}

export interface WeatherNow {
  date: string;
  air_temperature: number;
  track_temperature: number;
  humidity: number;
  pressure: number;
  rainfall: number;
  wind_direction: number;
  wind_speed: number;
}

export interface TimingPayload {
  mode: "full" | "delta";
  sessionKey: number;
  sessionName: string;
  /** Whether the server considers the session live (drives cache lifetimes). */
  live: boolean;
  /** Finished (past its end + grace): the data won't change any more. */
  completed: boolean;
  generatedAt: string;
  /** Only in full payloads: drivers rarely change during a session. */
  drivers?: TimingDriver[];
  positions: DriverPosition[];
  intervals: DriverInterval[];
  laps: DriverLaps[];
  /** Always complete (small tables), so the client simply replaces them. */
  stints: DriverStint[];
  pitCounts: Record<number, number>;
  raceControl: RaceControlItem[];
  weather: WeatherNow | null;
}

// ---------------------------------------------------------------------------
// Client state + merging
// ---------------------------------------------------------------------------

export interface TimingState {
  sessionKey: number;
  sessionName: string;
  live: boolean;
  /** Browser clock time of the last successful fetch (for the re-sync rule). */
  fetchedAt: number;
  drivers: Record<number, TimingDriver>;
  positions: Record<number, DriverPosition>;
  intervals: Record<number, DriverInterval>;
  laps: Record<number, DriverLaps>;
  stints: Record<number, DriverStint>;
  pitCounts: Record<number, number>;
  /** Newest first, capped. */
  raceControl: RaceControlItem[];
  weather: WeatherNow | null;
}

const MAX_RACE_CONTROL = 150;

const byDriver = <T extends { driver_number: number }>(rows: T[]) =>
  Object.fromEntries(rows.map((r) => [r.driver_number, r])) as Record<number, T>;

/** Keep whichever row is newer per driver (ISO dates compare as strings). */
function mergeNewest<T extends { driver_number: number; date: string }>(
  prev: Record<number, T>,
  rows: T[],
): Record<number, T> {
  const next = { ...prev };
  for (const row of rows) {
    const current = next[row.driver_number];
    if (!current || Date.parse(row.date) >= Date.parse(current.date)) next[row.driver_number] = row;
  }
  return next;
}

function mergeLaps(prev: Record<number, DriverLaps>, rows: DriverLaps[]): Record<number, DriverLaps> {
  const next = { ...prev };
  for (const row of rows) {
    const cur = next[row.driver_number];
    if (!cur) {
      next[row.driver_number] = row;
      continue;
    }
    const newerLast = (row.last_lap_number ?? -1) >= (cur.last_lap_number ?? -1);
    const bests = [cur.best_lap_duration, row.best_lap_duration].filter((v): v is number => v != null);
    next[row.driver_number] = {
      driver_number: row.driver_number,
      lap_number: Math.max(cur.lap_number, row.lap_number),
      last_lap_number: newerLast ? row.last_lap_number : cur.last_lap_number,
      last_lap_duration: newerLast ? row.last_lap_duration : cur.last_lap_duration,
      best_lap_duration: bests.length ? Math.min(...bests) : null,
    };
  }
  return next;
}

function mergeRaceControl(prev: RaceControlItem[], rows: RaceControlItem[]): RaceControlItem[] {
  // Delta windows overlap on purpose, so the same message arrives several
  // times. Date + message identifies it.
  const seen = new Set(prev.map((m) => `${m.date}|${m.message}`));
  const fresh = rows.filter((m) => !seen.has(`${m.date}|${m.message}`));
  return [...fresh, ...prev].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, MAX_RACE_CONTROL);
}

/** Fold a payload into the previous state. A full payload starts from scratch. */
export function mergeTiming(prev: TimingState | null, p: TimingPayload, fetchedAt: number): TimingState {
  const base: TimingState =
    p.mode === "full" || !prev
      ? {
          sessionKey: p.sessionKey,
          sessionName: p.sessionName,
          live: p.live,
          fetchedAt,
          drivers: {},
          positions: {},
          intervals: {},
          laps: {},
          stints: {},
          pitCounts: {},
          raceControl: [],
          weather: null,
        }
      : prev;

  return {
    ...base,
    live: p.live,
    fetchedAt,
    drivers: p.drivers ? byDriver(p.drivers) : base.drivers,
    positions: mergeNewest(base.positions, p.positions),
    intervals: mergeNewest(base.intervals, p.intervals),
    laps: mergeLaps(base.laps, p.laps),
    stints: byDriver(p.stints),
    pitCounts: p.pitCounts,
    raceControl: mergeRaceControl(base.raceControl, p.raceControl),
    weather: p.weather && (!base.weather || p.weather.date >= base.weather.date) ? p.weather : base.weather,
  };
}

// ---------------------------------------------------------------------------
// Timing tower rows
// ---------------------------------------------------------------------------

export interface TowerRow {
  driverNumber: number;
  position: number | null;
  code: string;
  fullName: string;
  teamName: string | null;
  teamColour: string | null;
  /** Display strings, already formatted. */
  gap: string;
  interval: string;
  lastLap: number | null;
  lastLapIsPersonalBest: boolean;
  lastLapIsOverallBest: boolean;
  bestLap: number | null;
  compound: string | null;
  tyreAge: number | null;
  pitStops: number;
}

export function buildTower(state: TimingState): { rows: TowerRow[]; currentLap: number | null } {
  const race = isRaceSession(state.sessionName);
  const numbers = new Set<number>([
    ...Object.keys(state.drivers).map(Number),
    ...Object.keys(state.positions).map(Number),
  ]);

  const bestOverall = Math.min(
    ...Object.values(state.laps)
      .map((l) => l.best_lap_duration)
      .filter((v): v is number => v != null),
  );

  const rows: TowerRow[] = [...numbers].map((n) => {
    const d = state.drivers[n];
    const laps = state.laps[n];
    const stint = state.stints[n];
    const iv = state.intervals[n];
    return {
      driverNumber: n,
      position: state.positions[n]?.position ?? null,
      code: d?.name_acronym ?? String(n),
      fullName: d?.full_name ?? `Car ${n}`,
      teamName: d?.team_name ?? null,
      teamColour: d?.team_colour ?? null,
      gap: race ? formatGap(iv?.gap_to_leader) : "",
      interval: race ? formatGap(iv?.interval) : "",
      lastLap: laps?.last_lap_duration ?? null,
      lastLapIsPersonalBest: laps?.last_lap_duration != null && laps.last_lap_duration === laps.best_lap_duration,
      lastLapIsOverallBest: laps?.last_lap_duration != null && laps.last_lap_duration === bestOverall,
      bestLap: laps?.best_lap_duration ?? null,
      compound: stint?.compound ?? null,
      // Laps on this set = laps it had when fitted + laps done in this stint.
      tyreAge: stint ? (stint.tyre_age_at_start ?? 0) + Math.max(0, stint.lap_end - stint.lap_start + 1) : null,
      pitStops: state.pitCounts[n] ?? 0,
    };
  });

  // Order by official position; cars without one go last, by best lap.
  rows.sort(
    (a, b) =>
      (a.position ?? 99) - (b.position ?? 99) ||
      (a.bestLap ?? Infinity) - (b.bestLap ?? Infinity) ||
      a.driverNumber - b.driverNumber,
  );

  // Position and intervals are separate feeds that update at different
  // moments, so right after an overtake the new leader may still carry their
  // old interval. The leader never has a gap or interval.
  if (rows[0]?.position === 1) {
    rows[0].gap = "";
    rows[0].interval = "";
  }

  // Practice/qualifying have no intervals feed: gaps come from best laps.
  if (!race) {
    const leaderBest = rows[0]?.bestLap ?? null;
    rows.forEach((row, i) => {
      const ahead = rows[i - 1]?.bestLap ?? null;
      if (row.bestLap == null || leaderBest == null) return;
      row.gap = i === 0 ? "" : formatGap(row.bestLap - leaderBest);
      row.interval = i === 0 || ahead == null ? "" : formatGap(row.bestLap - ahead);
    });
  }

  const lapNumbers = Object.values(state.laps).map((l) => l.lap_number);
  return { rows, currentLap: lapNumbers.length ? Math.max(...lapNumbers) : null };
}

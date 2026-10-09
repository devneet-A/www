/**
 * Typed client for the Jolpica F1 API (https://api.jolpi.ca/ergast/f1/),
 * a drop-in replacement for the retired Ergast API, using the same JSON shape.
 *
 * Quirks worth knowing:
 *  - Every response is wrapped in { MRData: { ...pagination, <Table> } }.
 *  - Numbers come back as STRINGS ("25", "1"). We keep them as strings in
 *    the raw types and convert where we use them.
 *  - Pagination: `limit` max is 100. Season-wide results (~480 rows) need
 *    several pages; getAllPages() below handles that.
 *  - Rate limits: roughly 4 requests/second burst and 500/hour, so this data
 *    is cached for hours (it only changes after a session ends anyway).
 */
import "server-only";
import { cacheLife } from "next/cache";
import { fetchJson, toErrorResult, unwrap, type CachedResult } from "./http";

// Overridable so you can point the app at a local mock server for testing.
const BASE_URL = process.env.JOLPICA_BASE_URL ?? "https://api.jolpi.ca/ergast/f1";
const PAGE_LIMIT = 100;

/** "current" works anywhere a year does and means the current season. */
export type Season = number | "current";

// ---------------------------------------------------------------------------
// Raw response types
// ---------------------------------------------------------------------------

interface MRData<K extends string, T> {
  MRData: {
    xmlns: string;
    series: string;
    url: string;
    limit: string;
    offset: string;
    total: string;
  } & Record<K, T>;
}

export interface Location {
  lat: string;
  long: string;
  locality: string;
  country: string;
}

export interface Circuit {
  circuitId: string;
  url: string;
  circuitName: string;
  Location: Location;
}

/** A session slot in the calendar. `time` is UTC with a Z suffix ("13:00:00Z"). */
export interface SessionTime {
  date: string; // "2026-10-11"
  time?: string; // "12:00:00Z" (missing for some old races)
}

export interface Driver {
  driverId: string;
  permanentNumber?: string;
  code?: string; // "VER"
  url: string;
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  nationality: string;
}

export interface Constructor {
  constructorId: string;
  url: string;
  name: string;
  nationality: string;
}

export interface RaceResult {
  number: string;
  position: string;
  positionText: string; // "1", "R" (retired), "D" (disqualified)...
  points: string;
  Driver: Driver;
  Constructor: Constructor;
  grid?: string;
  laps?: string;
  status?: string; // "Finished", "+1 Lap", "Engine"...
  Time?: { millis: string; time: string };
  FastestLap?: {
    rank?: string;
    lap: string;
    Time: { time: string };
  };
}

/** A race weekend. Optional session fields depend on the weekend format. */
export interface Race extends SessionTime {
  season: string;
  round: string;
  url: string;
  raceName: string;
  Circuit: Circuit;
  FirstPractice?: SessionTime;
  SecondPractice?: SessionTime;
  ThirdPractice?: SessionTime;
  Qualifying?: SessionTime;
  Sprint?: SessionTime;
  /** Sprint qualifying; called "SprintShootout" in 2023. */
  SprintQualifying?: SessionTime;
  SprintShootout?: SessionTime;
  Results?: RaceResult[];
  SprintResults?: RaceResult[];
}

export interface RaceTable {
  season: string;
  round?: string;
  Races: Race[];
}

export interface DriverStanding {
  position?: string; // can be missing for excluded drivers
  positionText: string;
  points: string;
  wins: string;
  Driver: Driver;
  Constructors: Constructor[];
}

export interface ConstructorStanding {
  position?: string;
  positionText: string;
  points: string;
  wins: string;
  Constructor: Constructor;
}

export interface StandingsList<T> {
  season: string;
  round: string;
  DriverStandings?: T[];
  ConstructorStandings?: T[];
}

export interface StandingsTable<T> {
  season: string;
  round?: string;
  StandingsLists: StandingsList<T>[];
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/**
 * Cached GET. Jolpica data only changes when a session ends, so the
 * "static" profile (hours) is right for almost everything.
 */
async function cachedResult<T>(url: string): Promise<CachedResult<T>> {
  "use cache";
  try {
    // Jolpica allows about 4 requests/second in bursts.
    const data = await fetchJson<T>(url, { upstream: "jolpica", perSecond: 4 });
    cacheLife("static");
    return { ok: true, data };
  } catch (err) {
    // Cache failures only briefly (see lib/http.ts for why we return, not throw).
    cacheLife("error");
    return toErrorResult(err, "jolpica");
  }
}

const cachedGet = async <T>(url: string): Promise<T> => unwrap(await cachedResult<T>(url));

function url(path: string, limit = PAGE_LIMIT, offset = 0) {
  return `${BASE_URL}/${path}.json?limit=${limit}&offset=${offset}`;
}

/**
 * Fetch every page of a race-table endpoint and merge them.
 * A single race's results can be split across two pages, so we merge
 * races by round and concatenate their Results / SprintResults.
 */
async function getAllRacePages(path: string): Promise<Race[]> {
  const first = await cachedGet<MRData<"RaceTable", RaceTable>>(url(path));
  const total = Number(first.MRData.total);

  const offsets: number[] = [];
  for (let o = PAGE_LIMIT; o < total; o += PAGE_LIMIT) offsets.push(o);
  // Sequential on purpose: firing 5 requests at once can trip the burst limit.
  const pages = [first];
  for (const o of offsets) pages.push(await cachedGet<MRData<"RaceTable", RaceTable>>(url(path, PAGE_LIMIT, o)));

  const byRound = new Map<string, Race>();
  for (const page of pages) {
    for (const race of page.MRData.RaceTable.Races) {
      const existing = byRound.get(race.round);
      if (!existing) {
        byRound.set(race.round, { ...race });
      } else {
        if (race.Results) existing.Results = [...(existing.Results ?? []), ...race.Results];
        if (race.SprintResults) existing.SprintResults = [...(existing.SprintResults ?? []), ...race.SprintResults];
      }
    }
  }
  return [...byRound.values()].sort((a, b) => Number(a.round) - Number(b.round));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Season calendar with all session times (UTC). */
export async function getSchedule(season: Season = "current"): Promise<Race[]> {
  const data = await cachedGet<MRData<"RaceTable", RaceTable>>(url(`${season}`));
  return data.MRData.RaceTable.Races;
}

/** Drivers' championship after the latest round (or a given round). */
export async function getDriverStandings(season: Season = "current", round?: number) {
  const path = round ? `${season}/${round}/driverStandings` : `${season}/driverStandings`;
  const data = await cachedGet<MRData<"StandingsTable", StandingsTable<DriverStanding>>>(url(path));
  const list = data.MRData.StandingsTable.StandingsLists[0];
  return {
    season: data.MRData.StandingsTable.season,
    round: list?.round ?? null,
    standings: list?.DriverStandings ?? [],
  };
}

/** Constructors' championship after the latest round (or a given round). */
export async function getConstructorStandings(season: Season = "current", round?: number) {
  const path = round ? `${season}/${round}/constructorStandings` : `${season}/constructorStandings`;
  const data = await cachedGet<MRData<"StandingsTable", StandingsTable<ConstructorStanding>>>(url(path));
  const list = data.MRData.StandingsTable.StandingsLists[0];
  return {
    season: data.MRData.StandingsTable.season,
    round: list?.round ?? null,
    standings: list?.ConstructorStandings ?? [],
  };
}

/** Every Grand Prix result of a season (used for points progression). */
export const getSeasonResults = (season: Season = "current") => getAllRacePages(`${season}/results`);

/** Every sprint result of a season (sprints award points too). */
export const getSeasonSprintResults = (season: Season = "current") => getAllRacePages(`${season}/sprint`);

/** Only the winner of each race (`results/1`): one small request for the calendar. */
export const getSeasonWinners = (season: Season = "current") => getAllRacePages(`${season}/results/1`);

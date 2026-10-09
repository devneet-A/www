/**
 * Typed client for the OpenF1 API (https://openf1.org).
 *
 * Every interface below mirrors the field names in the official docs
 * (documentation/includes/_api_endpoints.md in github.com/br-g/openf1).
 * All dates are ISO-8601 strings in UTC, e.g. "2023-09-16T13:59:07.606000+00:00".
 *
 * Access rules (from the docs):
 *  - Historical data (2023 onwards) is free and needs no authentication.
 *  - Real-time data during a live session needs a paid account. Auth is
 *    OAuth2: POST username/password to https://api.openf1.org/token and send
 *    the returned token as `Authorization: Bearer <token>`. Tokens last 1h.
 *  - The open-source server rate-limits to 30 requests / 10 s per IP; the
 *    hosted free tier is stricter, so we cache hard and poll gently.
 *
 * Server-only: this file reads credentials from environment variables.
 */
import "server-only";
import { cacheLife } from "next/cache";
import { ApiError, fetchJson, toErrorResult, unwrap, type CachedResult } from "./http";

// Overridable so you can point the app at a local mock server for testing.
const ORIGIN = process.env.OPENF1_BASE_URL ?? "https://api.openf1.org";
const BASE_URL = `${ORIGIN}/v1`;
const TOKEN_URL = `${ORIGIN}/token`;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** Most OpenF1 rows carry these two keys. */
interface SessionScoped {
  meeting_key: number;
  session_key: number;
}

/** A session or meeting key, or the magic value "latest". */
export type KeyOrLatest = number | "latest";

// ---------------------------------------------------------------------------
// Endpoint response types (one interface per endpoint we use)
// ---------------------------------------------------------------------------

/** GET /meetings — one row per Grand Prix weekend (or testing event). */
export interface Meeting {
  meeting_key: number;
  meeting_name: string; // "Singapore Grand Prix"
  meeting_official_name: string;
  circuit_key: number;
  circuit_short_name: string;
  circuit_type?: string; // "Permanent" | "Temporary - Street" | "Temporary - Road"
  circuit_image?: string;
  circuit_info_url?: string;
  country_code: string;
  country_key: number;
  country_name: string;
  country_flag?: string;
  location: string;
  date_start: string;
  date_end?: string;
  gmt_offset: string; // "08:00:00" (can be negative, e.g. "-05:00:00")
  is_cancelled?: boolean;
  year: number;
}

/** GET /sessions — one row per practice / qualifying / sprint / race. */
export interface Session extends SessionScoped {
  session_name: string; // "Practice 1", "Sprint Qualifying", "Race", ...
  session_type: string; // "Practice", "Qualifying", "Race", ...
  circuit_key: number;
  circuit_short_name: string;
  country_code: string;
  country_key: number;
  country_name: string;
  location: string;
  date_start: string;
  date_end: string;
  gmt_offset: string;
  is_cancelled?: boolean;
  year: number;
}

/** GET /drivers — driver info for a session (team colour lives here). */
export interface Driver extends SessionScoped {
  driver_number: number;
  broadcast_name: string; // "M VERSTAPPEN"
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  name_acronym: string; // "VER"
  team_name: string | null;
  team_colour: string | null; // hex WITHOUT '#', e.g. "3671C6"
  headshot_url: string | null;
}

/** GET /laps — one row per completed lap per driver. */
export interface Lap extends SessionScoped {
  driver_number: number;
  lap_number: number;
  date_start: string | null;
  lap_duration: number | null; // seconds; null for laps without a valid time
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  i1_speed: number | null; // km/h at intermediate 1
  i2_speed: number | null;
  st_speed: number | null; // km/h at the speed trap
  is_pit_out_lap: boolean;
  // Mini-sector status codes (2048 yellow, 2049 green, 2051 purple, ...).
  segments_sector_1: (number | null)[] | null;
  segments_sector_2: (number | null)[] | null;
  segments_sector_3: (number | null)[] | null;
}

/** GET /position — emitted whenever a driver's position changes. */
export interface Position extends SessionScoped {
  date: string;
  driver_number: number;
  position: number;
}

/**
 * GET /intervals — race-only, updated roughly every 4 seconds.
 * Gaps are seconds, or a string like "+1 LAP" when lapped; null for the leader.
 */
export interface Interval extends SessionScoped {
  date: string;
  driver_number: number;
  gap_to_leader: number | string | null;
  interval: number | string | null;
}

/** GET /pit — one row per pit lane visit. */
export interface PitStop extends SessionScoped {
  date: string;
  driver_number: number;
  lap_number: number;
  /** Total time in the pit lane (seconds). Newer field name. */
  lane_duration?: number | null;
  /** Older name for the same value; still returned by the API. */
  pit_duration?: number | null;
  /** Stationary time (seconds); only from the 2024 US GP onwards. */
  stop_duration?: number | null;
}

/** Tyre compounds as returned by /stints. */
export type TyreCompound = "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET" | "UNKNOWN" | "TEST_UNKNOWN";

/** GET /stints — one row per tyre stint. lap_end is updated while a stint runs. */
export interface Stint extends SessionScoped {
  driver_number: number;
  stint_number: number;
  lap_start: number;
  lap_end: number;
  // Typed as string too because new compound names would otherwise break the build.
  compound: TyreCompound | (string & {}) | null;
  tyre_age_at_start: number | null;
}

/** GET /car_data — telemetry at ~3.7 Hz. Huge: always filter by driver + date range. */
export interface CarData extends SessionScoped {
  date: string;
  driver_number: number;
  speed: number; // km/h
  throttle: number; // 0-100 %
  brake: number; // 0 or 100
  n_gear: number; // 0 = neutral, 1-8
  rpm: number;
  drs: number; // 10, 12, 14 = DRS open (see docs mapping)
}

/** GET /location — car x/y/z position at ~3.7 Hz. Same filtering advice as car_data. */
export interface Location extends SessionScoped {
  date: string;
  driver_number: number;
  x: number;
  y: number;
  z: number;
}

/** GET /weather — one row about every minute. */
export interface Weather extends SessionScoped {
  date: string;
  air_temperature: number; // °C
  track_temperature: number; // °C
  humidity: number; // %
  pressure: number; // mbar
  rainfall: number; // 0 = dry, >0 = rain
  wind_direction: number; // degrees 0-359
  wind_speed: number; // m/s
}

/** GET /race_control — flags, safety car, penalties, track limits... */
export interface RaceControlMessage extends SessionScoped {
  date: string;
  category: string; // "Flag" | "SafetyCar" | "Drs" | "CarEvent" | "SessionStatus" | "Other" ...
  flag: string | null; // "GREEN" | "YELLOW" | "DOUBLE YELLOW" | "RED" | "CHEQUERED" | "BLUE" ...
  scope: string | null; // "Track" | "Sector" | "Driver"
  sector: number | null;
  driver_number: number | null;
  lap_number: number | null;
  qualifying_phase: number | null;
  message: string;
}

/** GET /team_radio — links to MP3 clips. */
export interface TeamRadio extends SessionScoped {
  date: string;
  driver_number: number;
  recording_url: string;
}

/** GET /session_result — final classification (fills in after the session). */
export interface SessionResult extends SessionScoped {
  driver_number: number;
  position: number | null;
  number_of_laps: number | null;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
  /** Seconds. In qualifying an array [Q1, Q2, Q3]. */
  duration: number | (number | null)[] | null;
  /** Seconds, or "+N LAP(S)". In qualifying an array [Q1, Q2, Q3]. */
  gap_to_leader: number | string | (number | string | null)[] | null;
}

/** GET /starting_grid */
export interface StartingGridEntry extends SessionScoped {
  driver_number: number;
  position: number;
  lap_duration: number | null;
}

// ---------------------------------------------------------------------------
// Query building
// ---------------------------------------------------------------------------

/**
 * OpenF1 filters are plain query params, but comparison filters put the
 * operator in the *key*: `date>2024-01-01`, `lap_number>=10`.
 * So instead of { key: value } we accept a list of filters with an operator.
 */
export type Op = "=" | ">" | ">=" | "<" | "<=";
export interface Filter {
  field: string;
  op?: Op; // default "="
  value: string | number | boolean;
}

/** Shorthand: f("session_key", 9161) or f("date", ">", iso). */
export function f(field: string, value: Filter["value"]): Filter;
export function f(field: string, op: Op, value: Filter["value"]): Filter;
export function f(field: string, a: Op | Filter["value"], b?: Filter["value"]): Filter {
  return b === undefined ? { field, value: a } : { field, op: a as Op, value: b };
}

export function buildUrl(endpoint: string, filters: Filter[] = []): string {
  // Built by hand (not URLSearchParams) because the operator must stay
  // literal: `lap_number>=10`, not `lap_number%3E%3D10`. Field names are
  // plain identifiers, so only the value needs encoding (an ISO date's "+"
  // would otherwise be read as a space).
  const qs = filters
    .map(({ field, op = "=", value }) => `${field}${op}${encodeURIComponent(String(value))}`)
    .join("&");
  return `${BASE_URL}/${endpoint}${qs ? `?${qs}` : ""}`;
}

// ---------------------------------------------------------------------------
// Authentication (optional)
// ---------------------------------------------------------------------------

/**
 * Two ways to provide credentials:
 *  1. OPENF1_API_KEY            – an access token you already have; sent as a Bearer token.
 *  2. OPENF1_USERNAME/PASSWORD  – we exchange them for a 1-hour token and refresh it.
 * Without either, everything still works for historical data.
 */
export function hasOpenF1Auth(): boolean {
  return Boolean(process.env.OPENF1_API_KEY || (process.env.OPENF1_USERNAME && process.env.OPENF1_PASSWORD));
}

// Module-level token cache. On Vercel each warm function instance keeps its
// own copy, which is fine: at worst we request a few extra tokens.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (process.env.OPENF1_API_KEY) return process.env.OPENF1_API_KEY;

  const username = process.env.OPENF1_USERNAME;
  const password = process.env.OPENF1_PASSWORD;
  if (!username || !password) return null;

  // Reuse the token until 60s before it expires.
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value;

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username, password }),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[openf1] token request failed: HTTP ${res.status}`);
      return null; // Degrade to unauthenticated (historical-only) mode.
    }
    // The docs show expires_in as a string ("3600"), so coerce it.
    const data = (await res.json()) as { access_token: string; expires_in: string | number };
    cachedToken = { value: data.access_token, expiresAt: Date.now() + Number(data.expires_in) * 1000 };
    return cachedToken.value;
  } catch (err) {
    console.error("[openf1] token request error", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cached fetchers
// ---------------------------------------------------------------------------

/**
 * How long a response may be reused. The profiles are defined in
 * next.config.ts (cacheLife). Pick per call:
 *  - "live":       data that changes every few seconds during a session
 *  - "session":    session lists / "what's on now" checks
 *  - "static":     drivers, meetings — changes a few times per weekend
 *  - "historical": data from a session that has finished and won't change
 */
export type CacheProfile = "live" | "session" | "static" | "historical";

/**
 * `"use cache"` makes Next.js remember the return value for the given
 * arguments (the URL and profile become the cache key), so 100 visitors
 * polling the same URL cause 1 upstream request per cache period.
 *
 * The auth token is deliberately NOT an argument: it would become part of
 * the cache key and we never want secrets in a cache key.
 */
async function cachedGet<T>(url: string, profile: CacheProfile): Promise<CachedResult<T>> {
  "use cache";
  let result: CachedResult<T>;
  try {
    const token = await getAccessToken();
    const data = await fetchJson<T>(url, {
      upstream: "openf1",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      // Free tier: about 3 requests/second. Authenticated accounts get more.
      perSecond: token ? 10 : 3,
    });
    result = { ok: true, data };
  } catch (err) {
    result = toErrorResult(err, "openf1");
  }

  // Exactly one cacheLife() call runs per invocation (a Next.js rule).
  // Failures are kept only briefly: long enough to stop a burst of visitors
  // hammering a struggling API, short enough to recover quickly.
  // (cacheLife has one typed overload per profile name, hence the if-chain.)
  if (!result.ok) cacheLife("error");
  else if (profile === "live") cacheLife("live");
  else if (profile === "session") cacheLife("session");
  else if (profile === "static") cacheLife("static");
  else cacheLife("historical");
  return result;
}

/** Generic escape hatch: query any endpoint with typed rows. */
export async function query<T>(endpoint: string, filters: Filter[] = [], profile: CacheProfile = "live"): Promise<T[]> {
  return unwrap(await cachedGet<T[]>(buildUrl(endpoint, filters), profile));
}

// ---------------------------------------------------------------------------
// Endpoint helpers. Each accepts extra filters so callers can request only
// new rows, e.g. getPositions(9161, [f("date", ">", lastSeen)]).
// ---------------------------------------------------------------------------

const sk = (sessionKey: KeyOrLatest) => f("session_key", sessionKey);

export const getMeetings = (filters: Filter[] = [], profile: CacheProfile = "static") =>
  query<Meeting>("meetings", filters, profile);

export const getSessions = (filters: Filter[] = [], profile: CacheProfile = "session") =>
  query<Session>("sessions", filters, profile);

export const getDrivers = (sessionKey: KeyOrLatest, profile: CacheProfile = "static") =>
  query<Driver>("drivers", [sk(sessionKey)], profile);

export const getLaps = (sessionKey: KeyOrLatest, extra: Filter[] = [], profile: CacheProfile = "live") =>
  query<Lap>("laps", [sk(sessionKey), ...extra], profile);

export const getPositions = (sessionKey: KeyOrLatest, extra: Filter[] = [], profile: CacheProfile = "live") =>
  query<Position>("position", [sk(sessionKey), ...extra], profile);

export const getIntervals = (sessionKey: KeyOrLatest, extra: Filter[] = [], profile: CacheProfile = "live") =>
  query<Interval>("intervals", [sk(sessionKey), ...extra], profile);

export const getPitStops = (sessionKey: KeyOrLatest, extra: Filter[] = [], profile: CacheProfile = "live") =>
  query<PitStop>("pit", [sk(sessionKey), ...extra], profile);

export const getStints = (sessionKey: KeyOrLatest, extra: Filter[] = [], profile: CacheProfile = "live") =>
  query<Stint>("stints", [sk(sessionKey), ...extra], profile);

export const getWeather = (sessionKey: KeyOrLatest, extra: Filter[] = [], profile: CacheProfile = "live") =>
  query<Weather>("weather", [sk(sessionKey), ...extra], profile);

export const getRaceControl = (sessionKey: KeyOrLatest, extra: Filter[] = [], profile: CacheProfile = "live") =>
  query<RaceControlMessage>("race_control", [sk(sessionKey), ...extra], profile);

export const getTeamRadio = (sessionKey: KeyOrLatest, extra: Filter[] = [], profile: CacheProfile = "live") =>
  query<TeamRadio>("team_radio", [sk(sessionKey), ...extra], profile);

export const getSessionResult = (sessionKey: KeyOrLatest, profile: CacheProfile = "session") =>
  query<SessionResult>("session_result", [sk(sessionKey)], profile);

export const getStartingGrid = (sessionKey: KeyOrLatest, profile: CacheProfile = "static") =>
  query<StartingGridEntry>("starting_grid", [sk(sessionKey)], profile);

/**
 * Telemetry is ~3.7 rows per second per driver, so a full race is ~25k rows
 * per driver. We REQUIRE a driver and a time window so nobody downloads a
 * whole session by accident.
 */
export async function getCarData(
  sessionKey: number,
  driverNumber: number,
  from: string,
  to: string,
  profile: CacheProfile = "historical",
) {
  if (!from || !to) throw new ApiError("car_data needs a time window", 400, "openf1");
  return query<CarData>(
    "car_data",
    [sk(sessionKey), f("driver_number", driverNumber), f("date", ">=", from), f("date", "<=", to)],
    profile,
  );
}

export async function getLocation(
  sessionKey: number,
  driverNumber: number,
  from: string,
  to: string,
  profile: CacheProfile = "historical",
) {
  if (!from || !to) throw new ApiError("location needs a time window", 400, "openf1");
  return query<Location>(
    "location",
    [sk(sessionKey), f("driver_number", driverNumber), f("date", ">=", from), f("date", "<=", to)],
    profile,
  );
}

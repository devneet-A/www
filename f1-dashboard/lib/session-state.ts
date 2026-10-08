/**
 * Session detection: is something live right now, what finished last, what's next?
 *
 * Pure functions with no fetching and no "server-only", so the SAME logic runs:
 *  - on the server, to pick which sessions to send to the browser, and
 *  - in the browser every second, so the LIVE badge and countdown flip at
 *    the exact moment a session starts, without waiting for a refetch.
 */

/** One session in a shape both OpenF1 and Jolpica data can be mapped to. */
export interface HeaderSession {
  /** Stable id, e.g. "openf1-9161" or "jolpica-2026-18-Race". */
  id: string;
  /** OpenF1 session_key. null for sessions known only from the Jolpica calendar. */
  sessionKey: number | null;
  name: string; // "Practice 1", "Qualifying", "Race"...
  type: string; // "Practice", "Qualifying", "Race"...
  meetingId: string;
  meetingName: string; // "Singapore Grand Prix"
  circuit: string; // "Singapore"
  location: string; // "Marina Bay"
  countryName: string;
  countryFlag: string | null; // image URL (OpenF1 only)
  start: string; // ISO UTC
  end: string; // ISO UTC
  /** True when `end` is our estimate (Jolpica only publishes start times). */
  estimatedEnd: boolean;
  /** Track's offset from UTC, "08:00:00" or "-05:00:00". null if unknown. */
  gmtOffset: string | null;
  source: "openf1" | "jolpica";
}

/** What /api/session/current returns. */
export interface SessionOverview {
  /** A trimmed, start-sorted list: recent sessions + the live/next weekend. */
  sessions: HeaderSession[];
  /** Whether the server has OpenF1 credentials for real-time data. */
  hasLiveAuth: boolean;
  /** Non-fatal problems (e.g. one upstream down), shown as small notes. */
  warnings: string[];
  generatedAt: string;
}

export type Mode =
  | "live" // a session is running and we can show its data
  | "live-no-auth" // a session is running but we lack credentials: show latest completed
  | "latest" // nothing running: show the latest completed session
  | "none"; // no data at all (e.g. both APIs down)

export interface SessionState {
  mode: Mode;
  live: HeaderSession | null;
  latestCompleted: HeaderSession | null;
  next: HeaderSession | null;
  /** The session whose timing/race-control/weather data we should display. */
  dataSession: HeaderSession | null;
  /** The weekend the header is about: the live one, else the next, else the last. */
  headerMeeting: HeaderSession[];
}

const MINUTE = 60_000;

/**
 * Sessions often run past their scheduled end (red flags, a race's last lap,
 * post-session data still arriving), so we keep treating a session as live
 * for a while after `date_end`. Races and sprints get more slack.
 */
export function graceMs(session: Pick<HeaderSession, "name">): number {
  return /^(race|sprint)$/i.test(session.name) ? 60 * MINUTE : 15 * MINUTE;
}

export function isLive(s: HeaderSession, now: number): boolean {
  const start = Date.parse(s.start);
  const end = Date.parse(s.end) + graceMs(s);
  return start <= now && now <= end;
}

export function isCompleted(s: HeaderSession, now: number): boolean {
  return Date.parse(s.end) + graceMs(s) < now;
}

export function resolveSessionState(sessions: HeaderSession[], now: number, hasLiveAuth: boolean): SessionState {
  const sorted = [...sessions].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  // If two sessions overlap (rare), prefer the one that started most recently.
  const live = sorted.filter((s) => isLive(s, now)).at(-1) ?? null;
  // Only OpenF1 sessions (with a session_key) can be "latest": we need their data.
  const latestCompleted = sorted.filter((s) => s.sessionKey !== null && isCompleted(s, now)).at(-1) ?? null;
  const next = sorted.find((s) => Date.parse(s.start) > now) ?? null;

  const canShowLive = live !== null && live.sessionKey !== null && hasLiveAuth;
  const dataSession = canShowLive ? live : latestCompleted;

  let mode: Mode;
  if (live) mode = canShowLive ? "live" : "live-no-auth";
  else mode = latestCompleted ? "latest" : "none";

  const anchor = live ?? next ?? latestCompleted;
  const headerMeeting = anchor ? sorted.filter((s) => s.meetingId === anchor.meetingId) : [];

  return { mode, live, latestCompleted, next, dataSession, headerMeeting };
}

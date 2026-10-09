/**
 * Builds the SessionOverview served by /api/session/current.
 *
 * Sources, in order of preference:
 *  1. OpenF1 sessions + meetings for this year (and last year in January,
 *     before the first session has happened). These carry session_keys, so
 *     they're the only ones we can show data for.
 *  2. Jolpica's calendar, only to fill in UPCOMING sessions when OpenF1
 *     hasn't published them yet (so the countdown always has a target).
 */
import "server-only";
import * as openf1 from "./openf1";
import * as jolpica from "./jolpica";
import { isCompleted, isLive, resolveSessionState, type HeaderSession, type SessionOverview } from "./session-state";

// ---------------------------------------------------------------------------
// Mapping upstream rows to HeaderSession
// ---------------------------------------------------------------------------

function fromOpenF1(s: openf1.Session, meeting: openf1.Meeting | undefined): HeaderSession {
  return {
    id: `openf1-${s.session_key}`,
    sessionKey: s.session_key,
    name: s.session_name,
    type: s.session_type,
    meetingId: `openf1-${s.meeting_key}`,
    // Testing events have meeting names like "Pre-Season Testing".
    meetingName: meeting?.meeting_name ?? `${s.country_name} ${s.year}`,
    circuit: s.circuit_short_name,
    location: s.location,
    countryName: s.country_name,
    countryFlag: meeting?.country_flag ?? null,
    start: s.date_start,
    end: s.date_end,
    estimatedEnd: false,
    gmtOffset: s.gmt_offset,
    source: "openf1",
  };
}

/**
 * Jolpica only publishes start times, so we estimate durations to know when
 * a session is "over". These are typical lengths, not official ones.
 */
export const JOLPICA_SESSIONS: { field: keyof jolpica.Race; name: string; type: string; minutes: number }[] = [
  { field: "FirstPractice", name: "Practice 1", type: "Practice", minutes: 60 },
  { field: "SecondPractice", name: "Practice 2", type: "Practice", minutes: 60 },
  { field: "ThirdPractice", name: "Practice 3", type: "Practice", minutes: 60 },
  { field: "SprintShootout", name: "Sprint Qualifying", type: "Qualifying", minutes: 45 },
  { field: "SprintQualifying", name: "Sprint Qualifying", type: "Qualifying", minutes: 45 },
  { field: "Sprint", name: "Sprint", type: "Race", minutes: 60 },
  { field: "Qualifying", name: "Qualifying", type: "Qualifying", minutes: 60 },
];

function fromJolpica(race: jolpica.Race): HeaderSession[] {
  const toIso = (t: jolpica.SessionTime) => `${t.date}T${t.time ?? "00:00:00Z"}`;
  const base = {
    sessionKey: null,
    meetingId: `jolpica-${race.season}-${race.round}`,
    meetingName: race.raceName,
    circuit: race.Circuit.circuitName,
    location: race.Circuit.Location.locality,
    countryName: race.Circuit.Location.country,
    countryFlag: null,
    estimatedEnd: true,
    gmtOffset: null,
    source: "jolpica" as const,
  };

  const slots = JOLPICA_SESSIONS.flatMap(({ field, name, type, minutes }) => {
    const t = race[field] as jolpica.SessionTime | undefined;
    return t ? [{ t, name, type, minutes }] : [];
  });
  slots.push({ t: race, name: "Race", type: "Race", minutes: 120 });

  return slots
    .filter(({ t }) => t.time) // without a time we can't count down to it
    .map(({ t, name, type, minutes }) => {
      const start = toIso(t);
      return {
        ...base,
        id: `${base.meetingId}-${name.replace(/\s/g, "")}`,
        name,
        type,
        start,
        end: new Date(Date.parse(start) + minutes * 60_000).toISOString(),
      };
    });
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadOpenF1Year(year: number): Promise<HeaderSession[]> {
  // Two requests for a whole season: cheap, and cached on the server.
  const [sessions, meetings] = await Promise.all([
    openf1.getSessions([openf1.f("year", year)], "session"),
    openf1.getMeetings([openf1.f("year", year)], "static"),
  ]);
  const meetingByKey = new Map(meetings.map((m) => [m.meeting_key, m]));
  return sessions
    .filter((s) => !s.is_cancelled && !meetingByKey.get(s.meeting_key)?.is_cancelled)
    .map((s) => fromOpenF1(s, meetingByKey.get(s.meeting_key)));
}

async function loadJolpicaUpcoming(year: number, now: number): Promise<HeaderSession[]> {
  let races = await jolpica.getSchedule(year);
  let upcoming = races.flatMap(fromJolpica).filter((s) => Date.parse(s.start) > now);
  if (upcoming.length === 0) {
    // Season over: try next year's calendar (it may not be published yet).
    races = await jolpica.getSchedule(year + 1).catch(() => []);
    upcoming = races.flatMap(fromJolpica).filter((s) => Date.parse(s.start) > now);
  }
  return upcoming;
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function buildSessionOverview(now: number): Promise<SessionOverview> {
  const year = new Date(now).getUTCFullYear();
  const warnings: string[] = [];

  // --- OpenF1 -------------------------------------------------------------
  let sessions: HeaderSession[] = [];
  try {
    sessions = await loadOpenF1Year(year);
    // Early in the year nothing has finished yet: add last season so we still
    // have a "latest completed session" to show.
    if (!sessions.some((s) => s.sessionKey !== null && isCompleted(s, now))) {
      sessions = [...(await loadOpenF1Year(year - 1)), ...sessions];
    }
  } catch (err) {
    warnings.push(`OpenF1 unavailable: ${errorMessage(err)}`);
  }

  // --- Jolpica fallback for upcoming sessions -----------------------------
  const hasUpcoming = sessions.some((s) => Date.parse(s.start) > now || isLive(s, now));
  if (!hasUpcoming) {
    try {
      sessions = [...sessions, ...(await loadJolpicaUpcoming(year, now))];
    } catch (err) {
      warnings.push(`Calendar unavailable: ${errorMessage(err)}`);
    }
  }

  sessions.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  // --- Trim to what the browser needs -------------------------------------
  // The whole season is ~120 sessions; the header only needs the weekend
  // around "now". We keep:
  //  - every session of the latest completed weekend and of the live/next one
  //  - the next few upcoming sessions, so the client can roll over to the
  //    next countdown by itself without refetching.
  const hasLiveAuth = openf1.hasOpenF1Auth();
  const state = resolveSessionState(sessions, now, hasLiveAuth);
  const keepMeetings = new Set(
    [state.latestCompleted, state.live, state.next].filter((s) => s !== null).map((s) => s.meetingId),
  );
  const upcoming = sessions.filter((s) => Date.parse(s.start) > now).slice(0, 8);
  const keep = new Set([...sessions.filter((s) => keepMeetings.has(s.meetingId)), ...upcoming]);

  return {
    sessions: sessions.filter((s) => keep.has(s)),
    hasLiveAuth,
    warnings,
    generatedAt: new Date(now).toISOString(),
  };
}

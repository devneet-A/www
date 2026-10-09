/**
 * Builds the /standings and /calendar payloads.
 *
 * Jolpica (Ergast) has the championship data but no team colours, so we
 * borrow colours from OpenF1's driver list for the same season and match
 * them by driver code ("VER"). Constructors get the colour of their
 * drivers, because team names differ between the two APIs
 * ("RB F1 Team" vs "Racing Bulls", "Sauber" vs "Kick Sauber").
 */
import "server-only";
import * as jolpica from "./jolpica";
import * as openf1 from "./openf1";
import { JOLPICA_SESSIONS } from "./session-overview";
import type { CalendarPayload, CalendarRace, ConstructorRow, DriverRow, Progression, RoundInfo, StandingsPayload } from "./standings";

// ---------------------------------------------------------------------------
// Team colours from OpenF1
// ---------------------------------------------------------------------------

/**
 * driver code → team colour, from the season's most recent session.
 * Colours are a nice-to-have: if OpenF1 has nothing (seasons before 2023)
 * or is down, we return an empty map and the UI falls back to grey.
 */
async function seasonColours(year: number, now: number): Promise<Map<string, string>> {
  try {
    const sessions = await openf1.getSessions([openf1.f("year", year)], "session");
    const latest = sessions.filter((s) => Date.parse(s.date_start) <= now).sort((a, b) => a.date_start.localeCompare(b.date_start)).at(-1);
    if (!latest) return new Map();
    const drivers = await openf1.getDrivers(latest.session_key, "static");
    return new Map(drivers.filter((d) => d.team_colour).map((d) => [d.name_acronym, d.team_colour!]));
  } catch (err) {
    console.warn("[standings] team colours unavailable:", err instanceof Error ? err.message : err);
    return new Map();
  }
}

/** Jolpica drivers before ~2014 may lack a `code`; build one from the surname. */
const driverCode = (d: jolpica.Driver) => d.code ?? d.familyName.slice(0, 3).toUpperCase();

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

function cumulative(rounds: RoundInfo[], pointsByRound: Map<number, Map<string, number>>): Progression {
  const ids = new Set<string>();
  for (const m of pointsByRound.values()) for (const id of m.keys()) ids.add(id);
  const out: Progression = {};
  for (const id of ids) {
    let total = 0;
    // A driver who joins mid-season simply has 0 before their first race.
    out[id] = rounds.map((r) => (total += pointsByRound.get(r.round)?.get(id) ?? 0));
  }
  return out;
}

export async function buildStandings(year: number, now: number): Promise<StandingsPayload> {
  const [driverStandings, constructorStandings, results, sprints, colours] = await Promise.all([
    jolpica.getDriverStandings(year),
    jolpica.getConstructorStandings(year),
    jolpica.getSeasonResults(year),
    // Seasons without sprints simply return no races.
    jolpica.getSeasonSprintResults(year),
    seasonColours(year, now),
  ]);

  const drivers: DriverRow[] = driverStandings.standings.map((s) => {
    const code = driverCode(s.Driver);
    return {
      position: s.position ? Number(s.position) : null,
      driverId: s.Driver.driverId,
      code,
      name: `${s.Driver.givenName} ${s.Driver.familyName}`,
      nationality: s.Driver.nationality,
      // A driver who switched teams lists several; the last is the current one.
      team: s.Constructors.at(-1)?.name ?? "",
      teamColour: colours.get(code) ?? null,
      points: Number(s.points),
      wins: Number(s.wins),
    };
  });

  // Constructor colour = colour of its first driver in the standings.
  const constructorColour = new Map<string, string | null>();
  for (const s of driverStandings.standings) {
    const team = s.Constructors.at(-1);
    if (team && !constructorColour.get(team.constructorId)) {
      constructorColour.set(team.constructorId, colours.get(driverCode(s.Driver)) ?? null);
    }
  }

  const constructors: ConstructorRow[] = constructorStandings.standings.map((s) => ({
    position: s.position ? Number(s.position) : null,
    constructorId: s.Constructor.constructorId,
    name: s.Constructor.name,
    nationality: s.Constructor.nationality,
    teamColour: constructorColour.get(s.Constructor.constructorId) ?? null,
    points: Number(s.points),
    wins: Number(s.wins),
  }));

  // --- Points progression: add up race + sprint points round by round ------
  // (Computed from results, so rare penalties applied later by the FIA may
  // make the last point differ slightly from the official table.)
  const rounds: RoundInfo[] = results
    .filter((r) => r.Results?.length)
    .map((r) => ({ round: Number(r.round), name: r.raceName, country: r.Circuit.Location.country }));
  const driverPoints = new Map<number, Map<string, number>>();
  const teamPoints = new Map<number, Map<string, number>>();
  const add = (map: Map<number, Map<string, number>>, round: number, id: string, pts: number) => {
    const m = map.get(round) ?? new Map<string, number>();
    m.set(id, (m.get(id) ?? 0) + pts);
    map.set(round, m);
  };
  for (const race of [...results, ...sprints]) {
    const round = Number(race.round);
    for (const r of [...(race.Results ?? []), ...(race.SprintResults ?? [])]) {
      add(driverPoints, round, r.Driver.driverId, Number(r.points));
      add(teamPoints, round, r.Constructor.constructorId, Number(r.points));
    }
  }

  return {
    season: year,
    round: driverStandings.round ? Number(driverStandings.round) : null,
    drivers,
    constructors,
    rounds,
    driverProgression: cumulative(rounds, driverPoints),
    constructorProgression: cumulative(rounds, teamPoints),
  };
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export async function buildCalendar(year: number, now: number): Promise<CalendarPayload> {
  const [schedule, winners, colours] = await Promise.all([
    jolpica.getSchedule(year),
    // Winners are a bonus: a failure here shouldn't break the calendar.
    jolpica.getSeasonWinners(year).catch(() => [] as jolpica.Race[]),
    seasonColours(year, now),
  ]);
  const winnerByRound = new Map(winners.map((r) => [r.round, r.Results?.[0]]));

  const toIso = (t: jolpica.SessionTime) => `${t.date}T${t.time ?? "00:00:00Z"}`;

  const races: CalendarRace[] = schedule.map((race) => {
    const sessions = JOLPICA_SESSIONS.flatMap(({ field, name }) => {
      const t = race[field] as jolpica.SessionTime | undefined;
      return t ? [{ name, start: toIso(t) }] : [];
    });
    sessions.push({ name: "Race", start: toIso(race) });
    sessions.sort((a, b) => a.start.localeCompare(b.start));

    const w = winnerByRound.get(race.round);
    return {
      round: Number(race.round),
      name: race.raceName,
      circuit: race.Circuit.circuitName,
      locality: race.Circuit.Location.locality,
      country: race.Circuit.Location.country,
      sprint: Boolean(race.Sprint),
      sessions,
      winner: w
        ? { code: driverCode(w.Driver), name: `${w.Driver.givenName} ${w.Driver.familyName}`, teamColour: colours.get(driverCode(w.Driver)) ?? null }
        : null,
    };
  });

  return { season: year, races };
}

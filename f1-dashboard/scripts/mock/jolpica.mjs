/**
 * Mock Jolpica (Ergast) API: a 24-round season whose dates are relative to
 * today, so there is always a finished part (with results and standings)
 * and an upcoming part. Round NEXT_ROUND is the weekend that OpenF1's mock
 * calls "next" (see server.mjs). Results are fictional.
 */
import { DRIVERS } from "./sim.mjs";

const H = 3_600_000;
const DAY = 24 * H;
export const NEXT_ROUND = 18;
const NAMES = ["Australian", "Chinese", "Japanese", "Bahrain", "Saudi Arabian", "Miami", "Canadian", "Monaco", "Spanish", "Austrian", "British", "Belgian", "Hungarian", "Dutch", "Italian", "Madrid", "Azerbaijan", "Singapore", "United States", "Mexico City", "São Paulo", "Las Vegas", "Qatar", "Abu Dhabi"];
const SPRINTS = new Set([2, 6, 11, 13, 19, 23]);
const RACE_PTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SPRINT_PTS = [8, 7, 6, 5, 4, 3, 2, 1];

const t = (ms) => ({ date: new Date(ms).toISOString().slice(0, 10), time: new Date(ms).toISOString().slice(11, 19) + "Z" });
const driver = ([n, code, full]) => {
  const [given, ...rest] = full.split(" ");
  const family = rest.join(" ")[0] + rest.join(" ").slice(1).toLowerCase();
  return { driverId: family.toLowerCase(), permanentNumber: String(n), code, url: "", givenName: given, familyName: family, dateOfBirth: "2000-01-01", nationality: "—" };
};
// Jolpica's team names differ from OpenF1's ("RB F1 Team" vs "Racing Bulls"): kept on purpose.
const constructor = (team) => ({ constructorId: team.toLowerCase().replace(/\W+/g, "_"), url: "", name: team.replace(" Racing", "").replace("Racing Bulls", "RB F1 Team"), nationality: "—" });

/** First practice of a round: every 14 days, with NEXT_ROUND's in `nextFp1Ms`. */
export function buildSchedule(nextFp1Ms, year) {
  return NAMES.map((name, i) => {
    const round = i + 1;
    const fp1 = nextFp1Ms + (round - NEXT_ROUND) * 14 * DAY;
    const base = {
      season: String(year), round: String(round), url: "", raceName: `${name} Grand Prix`,
      Circuit: { circuitId: name.toLowerCase().replace(/\W+/g, "_"), url: "", circuitName: `${name} Circuit`, Location: { lat: "0", long: "0", locality: `${name} City`, country: name } },
      ...t(fp1 + 50.5 * H), FirstPractice: t(fp1),
    };
    return SPRINTS.has(round)
      ? { ...base, SprintQualifying: t(fp1 + 4 * H), Sprint: t(fp1 + 24 * H), Qualifying: t(fp1 + 28 * H) }
      : { ...base, SecondPractice: t(fp1 + 3.5 * H), ThirdPractice: t(fp1 + 24 * H), Qualifying: t(fp1 + 27.5 * H) };
  });
}

/** Deterministic finishing order, loosely favouring the front of DRIVERS. */
function order(round, salt) {
  return DRIVERS.map((d, i) => [d, i + ((round * 7 + i * 13 + salt) % 9) - 4]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
}
const result = (pts) => (d, p) => ({
  number: String(d[0]), position: String(p + 1), positionText: String(p + 1), points: String(pts[p] ?? 0),
  Driver: driver(d), Constructor: constructor(d[3]), grid: "1", laps: "57", status: "Finished",
});

function standings(races, sprints) {
  const drivers = new Map();
  const teams = new Map();
  for (const r of [...races, ...sprints]) {
    for (const x of [...(r.Results ?? []), ...(r.SprintResults ?? [])]) {
      const win = r.Results && x.position === "1" ? 1 : 0;
      const d = drivers.get(x.Driver.driverId) ?? { Driver: x.Driver, Constructors: [x.Constructor], points: 0, wins: 0 };
      d.points += Number(x.points);
      d.wins += win;
      drivers.set(x.Driver.driverId, d);
      const c = teams.get(x.Constructor.constructorId) ?? { Constructor: x.Constructor, points: 0, wins: 0 };
      c.points += Number(x.points);
      c.wins += win;
      teams.set(x.Constructor.constructorId, c);
    }
  }
  const rank = (list) =>
    list.sort((a, b) => b.points - a.points).map((x, i) => ({ ...x, position: String(i + 1), positionText: String(i + 1), points: String(x.points), wins: String(x.wins) }));
  return { drivers: rank([...drivers.values()]), constructors: rank([...teams.values()]) };
}

const mrData = (table, total = "0", limit = "100", offset = "0") => ({ MRData: { xmlns: "", series: "f1", url: "", limit, offset, total, ...table } });

/** Ergast paginates by result ROWS, so one race can be split across two pages. */
function paginate(year, list, key, limit, offset) {
  const rows = list.flatMap((race) => race[key].map((row) => ({ race, row })));
  const races = [];
  for (const { race, row } of rows.slice(offset, offset + limit)) {
    let last = races.at(-1);
    if (!last || last.round !== race.round) {
      last = { ...race, Results: undefined, SprintResults: undefined, [key]: [] };
      races.push(last);
    }
    last[key].push(row);
  }
  return mrData({ RaceTable: { season: String(year), Races: races } }, String(rows.length), String(limit), String(offset));
}

/** Handle /ergast/f1/... requests. Returns a JSON-able object, or null if not a Jolpica path. */
export function handleJolpica(pathname, search, { schedule, year, now }) {
  const m = pathname.match(/^\/ergast\/f1\/(\w+)(?:\/(.+))?\.json$/);
  if (!m) return null;
  const season = m[1] === "current" ? String(year) : m[1];
  const rest = m[2];
  const q = new URLSearchParams(search);
  const limit = Number(q.get("limit") ?? 30);
  const offset = Number(q.get("offset") ?? 0);
  if (season !== String(year)) return mrData({ RaceTable: { season, Races: [] }, StandingsTable: { season, StandingsLists: [] } });

  // A round has results once its race has started + 2 hours.
  const raced = schedule.filter((r) => Date.parse(`${r.date}T${r.time}`) + 2 * H < now);
  const races = raced.map((r) => ({ ...r, Results: order(Number(r.round), 0).map(result(RACE_PTS)) }));
  const sprints = raced.filter((r) => r.Sprint).map((r) => ({ ...r, SprintResults: order(Number(r.round), 3).map(result(SPRINT_PTS)) }));
  const lastRound = String(raced.length);

  if (!rest) return mrData({ RaceTable: { season, Races: schedule } }, String(schedule.length));
  if (rest === "results") return paginate(year, races, "Results", limit, offset);
  if (rest === "results/1") return paginate(year, races.map((r) => ({ ...r, Results: r.Results.slice(0, 1) })), "Results", limit, offset);
  if (rest === "sprint") return paginate(year, sprints, "SprintResults", limit, offset);
  const s = standings(races, sprints);
  if (rest === "driverStandings")
    return mrData({ StandingsTable: { season, round: lastRound, StandingsLists: raced.length ? [{ season, round: lastRound, DriverStandings: s.drivers }] : [] } }, "20");
  if (rest === "constructorStandings")
    return mrData({ StandingsTable: { season, round: lastRound, StandingsLists: raced.length ? [{ season, round: lastRound, ConstructorStandings: s.constructors }] : [] } }, "10");
  return mrData({});
}

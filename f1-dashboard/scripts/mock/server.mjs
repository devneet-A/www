/**
 * Local mock of the OpenF1 and Jolpica APIs, for developing and demoing the
 * dashboard without a live F1 session or a paid OpenF1 account.
 *
 *   node scripts/mock/server.mjs [scenario]     (or: npm run mock -- [scenario])
 *
 * Scenarios (all dates are relative to when the server starts):
 *   between        (default) last weekend finished, next one starts in 2 days
 *   live-practice  Practice 1 started 20 minutes ago
 *   live-race      the race started 50 minutes ago and progresses in real time
 *   down           every request fails with HTTP 500 (to see error states)
 *
 * Like the real OpenF1, data for a session that is live (or ended less than an
 * hour ago) needs an `Authorization: Bearer ...` header; any token works except
 * "bad". All racing data is fictional.
 */
import http from "node:http";
import { applyFilters, carData, simulate } from "./sim.mjs";
import { NEXT_ROUND, buildSchedule, handleJolpica } from "./jolpica.mjs";

const SCENARIO = process.argv[2] ?? process.env.SCENARIO ?? "between";
const PORT = Number(process.env.MOCK_PORT ?? 4555);
const H = 3_600_000;
const MIN = 60_000;
const now = Date.now();
const year = new Date(now).getUTCFullYear();

// When the "next" weekend's first practice starts, per scenario.
const nextFp1 = {
  between: Math.ceil((now + 48 * H) / H) * H,
  "live-practice": now - 20 * MIN,
  "live-race": now - 50 * MIN - 50.5 * H, // so the race (FP1 + 50.5h) began 50 minutes ago
  down: now + 48 * H,
}[SCENARIO];
if (nextFp1 === undefined) {
  console.error(`Unknown scenario "${SCENARIO}". Use: between, live-practice, live-race, down.`);
  process.exit(1);
}

const schedule = buildSchedule(nextFp1, year);
const iso = (ms) => new Date(ms).toISOString().replace(".000Z", "+00:00");

// OpenF1 knows the last finished weekend and the next one (like the real
// API early in a race week). Names match the Jolpica mock's rounds.
const weekends = [
  { round: NEXT_ROUND - 1, meetingKey: 1295, sessionBase: 9900, country: "Azerbaijan", code: "AZE", circuit: "Baku", location: "Baku", gmt: "04:00:00" },
  { round: NEXT_ROUND, meetingKey: 1296, sessionBase: 9910, country: "Singapore", code: "SGP", circuit: "Singapore", location: "Marina Bay", gmt: "08:00:00" },
];
const meetings = [];
const sessions = [];
for (const w of weekends) {
  const race = schedule[w.round - 1];
  const fp1 = Date.parse(`${race.FirstPractice.date}T${race.FirstPractice.time}`);
  const common = { meeting_key: w.meetingKey, circuit_key: w.meetingKey, circuit_short_name: w.circuit, country_code: w.code, country_key: w.meetingKey, country_name: w.country, location: w.location, gmt_offset: w.gmt, year, is_cancelled: false };
  meetings.push({ ...common, meeting_name: race.raceName, meeting_official_name: race.raceName.toUpperCase(), circuit_type: "Temporary - Street", country_flag: null, date_start: iso(fp1), date_end: iso(fp1 + 52.5 * H) });
  const slots = [["Practice 1", "Practice", 0, 60], ["Practice 2", "Practice", 3.5, 60], ["Practice 3", "Practice", 24, 60], ["Qualifying", "Qualifying", 27.5, 60], ["Race", "Race", 50.5, 120]];
  slots.forEach(([name, type, offsetH, minutes], i) => {
    const start = fp1 + offsetH * H;
    sessions.push({ ...common, session_key: w.sessionBase + i, session_name: name, session_type: type, date_start: iso(start), date_end: iso(start + minutes * MIN) });
  });
}

const SESSION_ENDPOINTS = ["drivers", "laps", "position", "intervals", "stints", "pit", "race_control", "weather"];

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;
    if (SCENARIO === "down") return send(res, 500, { detail: "Mock outage" });

    // ---- Jolpica ----
    if (path.startsWith("/ergast/")) {
      const body = handleJolpica(path, url.search, { schedule, year, now: Date.now() });
      return body ? send(res, 200, body) : send(res, 404, {});
    }

    // ---- OpenF1 ----
    const endpoint = path.replace(/^\/v1\//, "");
    if (endpoint === "sessions") return send(res, 200, applyFilters(sessions, url.search));
    if (endpoint === "meetings") return send(res, 200, applyFilters(meetings, url.search));

    const session = sessions.find((s) => s.session_key === Number(url.searchParams.get("session_key")));
    if (!session) return send(res, 404, { detail: "No results found." });

    // Live data needs a token, like the real API.
    const recent = Date.parse(session.date_end) > Date.now() - H;
    const auth = req.headers.authorization;
    if (recent && (!auth || auth === "Bearer bad")) return send(res, 401, { detail: "Live data requires authentication" });

    if (endpoint === "car_data") {
      const q = decodeURIComponent(url.search);
      const from = Date.parse(q.match(/date>=([^&]+)/)?.[1] ?? "");
      const to = Date.parse(q.match(/date<=([^&]+)/)?.[1] ?? "");
      if (!from || !to) return send(res, 422, { detail: "car_data needs a date window" });
      return send(res, 200, carData(session, Number(url.searchParams.get("driver_number")), from, to));
    }
    if (SESSION_ENDPOINTS.includes(endpoint)) {
      const rows = applyFilters(simulate(session, Date.now())[endpoint], url.search);
      return rows.length ? send(res, 200, rows) : send(res, 404, { detail: "No results found." });
    }
    send(res, 404, { detail: "No results found." });
  })
  .listen(PORT, () => console.log(`Mock F1 APIs on http://localhost:${PORT} (scenario: ${SCENARIO})`));

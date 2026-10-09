/**
 * Session simulator for the mock API: produces OpenF1-shaped rows (laps,
 * positions, intervals, stints, pit stops, race control, weather) for a
 * session, up to the current time, so a "live" session really progresses.
 *
 * The racing is FICTIONAL: same inputs, same output (seeded by session key),
 * just realistic enough to exercise every part of the UI.
 */
export const DRIVERS = [
  [1, "VER", "Max VERSTAPPEN", "Red Bull Racing", "3671C6"], [22, "TSU", "Yuki TSUNODA", "Red Bull Racing", "3671C6"],
  [4, "NOR", "Lando NORRIS", "McLaren", "FF8000"], [81, "PIA", "Oscar PIASTRI", "McLaren", "FF8000"],
  [16, "LEC", "Charles LECLERC", "Ferrari", "E8002D"], [44, "HAM", "Lewis HAMILTON", "Ferrari", "E8002D"],
  [63, "RUS", "George RUSSELL", "Mercedes", "27F4D2"], [12, "ANT", "Kimi ANTONELLI", "Mercedes", "27F4D2"],
  [14, "ALO", "Fernando ALONSO", "Aston Martin", "229971"], [18, "STR", "Lance STROLL", "Aston Martin", "229971"],
  [10, "GAS", "Pierre GASLY", "Alpine", "0093CC"], [43, "COL", "Franco COLAPINTO", "Alpine", "0093CC"],
  [23, "ALB", "Alexander ALBON", "Williams", "64C4FF"], [55, "SAI", "Carlos SAINZ", "Williams", "64C4FF"],
  [31, "OCO", "Esteban OCON", "Haas F1 Team", "B6BABD"], [87, "BEA", "Oliver BEARMAN", "Haas F1 Team", "B6BABD"],
  [27, "HUL", "Nico HULKENBERG", "Audi", "F50537"], [5, "BOR", "Gabriel BORTOLETO", "Audi", "F50537"],
  [30, "LAW", "Liam LAWSON", "Racing Bulls", "6692FF"], [6, "HAD", "Isack HADJAR", "Racing Bulls", "6692FF"],
];
const iso = (ms) => new Date(ms).toISOString().replace("Z", "+00:00");
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

export function simulate(session, now) {
  const { session_key: sk, meeting_key: mk, session_name } = session;
  const race = /^(Race|Sprint)$/.test(session_name);
  const start = Date.parse(session.date_start), end = Date.parse(session.date_end);
  const until = Math.min(now, end + 30 * 60_000);
  const rand = rng(sk);
  const base = { meeting_key: mk, session_key: sk };
  const out = { drivers: [], laps: [], position: [], intervals: [], stints: [], pit: [], race_control: [], weather: [] };
  if (now < start) { out.drivers = DRIVERS.map(d => drv(d)); return out; }
  function drv([n, code, full, team, col]) { return { ...base, driver_number: n, broadcast_name: full, full_name: full, first_name: full.split(" ")[0], last_name: full.split(" ")[1], name_acronym: code, team_name: team, team_colour: col, headshot_url: null }; }
  out.drivers = DRIVERS.map(drv);
  const totalLaps = race ? 62 : 25;
  const pace = DRIVERS.map((_, i) => 96 + i * 0.12 + rand() * 0.3);
  const pitLap = DRIVERS.map(() => 18 + Math.floor(rand() * 12));
  const cum = DRIVERS.map(() => 0);
  const best = DRIVERS.map(() => Infinity);
  const stopped = DRIVERS.map(() => false);
  let lastOrder = [];
  for (let lap = 1; lap <= totalLaps; lap++) {
    const lapEnds = [];
    DRIVERS.forEach(([n], i) => {
      const pitIn = race && lap === pitLap[i], pitOut = race && lap === pitLap[i] + 1;
      let dur = pace[i] + rand() * 0.8 - (lap > pitLap[i] ? 0.6 : 0) + (pitIn ? 2 : 0) + (pitOut ? 20 : 0) + (lap === 1 ? 8 + i * 0.4 : 0);
      dur = Math.round(dur * 1000) / 1000;
      const lapStart = start + cum[i] * 1000;
      if (stopped[i] || lapStart > until) return;
      const lapEnd = lapStart + dur * 1000;
      const done = lapEnd <= until;
      out.laps.push({ ...base, driver_number: n, lap_number: lap, date_start: iso(lapStart), lap_duration: done ? dur : null,
        duration_sector_1: null, duration_sector_2: null, duration_sector_3: null, i1_speed: null, i2_speed: null, st_speed: 300,
        is_pit_out_lap: pitOut, segments_sector_1: null, segments_sector_2: null, segments_sector_3: null });
      if (!done) { stopped[i] = true; return; }
      cum[i] += dur;
      if (!pitOut) best[i] = Math.min(best[i], dur);
      if (pitIn) out.pit.push({ ...base, driver_number: n, lap_number: lap, date: iso(lapEnd), lane_duration: 22.1, pit_duration: 22.1, stop_duration: 2.4 });
      lapEnds.push([i, lapEnd]);
    });
    // Position & interval rows at each lap end.
    const order = race ? DRIVERS.map((_, i) => i).sort((a, b) => cum[a] - cum[b]) : DRIVERS.map((_, i) => i).sort((a, b) => best[a] - best[b]);
    const t = lapEnds.length ? Math.max(...lapEnds.map(e => e[1])) : null;
    if (t) {
      order.forEach((i, pos) => { if (lastOrder[pos] !== i) out.position.push({ ...base, driver_number: DRIVERS[i][0], position: pos + 1, date: iso(t) }); });
      lastOrder = order;
      if (race) for (const [i, at] of lapEnds) {
        const p = order.indexOf(i);
        out.intervals.push({ ...base, driver_number: DRIVERS[i][0], date: iso(at),
          gap_to_leader: p === 0 ? null : Math.round((cum[i] - cum[order[0]]) * 1000) / 1000,
          interval: p === 0 ? null : Math.round((cum[i] - cum[order[p - 1]]) * 1000) / 1000 });
      }
    }
  }
  // Stints: one stop in races, single stint otherwise.
  DRIVERS.forEach(([n], i) => {
    const lapsDone = Math.max(1, ...out.laps.filter(l => l.driver_number === n).map(l => l.lap_number));
    if (race && lapsDone > pitLap[i]) {
      out.stints.push({ ...base, driver_number: n, stint_number: 1, compound: "MEDIUM", lap_start: 1, lap_end: pitLap[i], tyre_age_at_start: 0 });
      out.stints.push({ ...base, driver_number: n, stint_number: 2, compound: i % 3 ? "HARD" : "SOFT", lap_start: pitLap[i] + 1, lap_end: lapsDone, tyre_age_at_start: i % 3 ? 0 : 3 });
    } else out.stints.push({ ...base, driver_number: n, stint_number: 1, compound: race ? "MEDIUM" : "SOFT", lap_start: 1, lap_end: lapsDone, tyre_age_at_start: race ? 0 : 2 });
  });
  const rc = (offsetS, category, flag, message, extra = {}) => { const at = start + offsetS * 1000; if (at <= until) out.race_control.push({ ...base, date: iso(at), category, flag, scope: flag ? "Track" : null, sector: null, driver_number: null, lap_number: null, qualifying_phase: null, message, ...extra }); };
  rc(-300, "Flag", "GREEN", "GREEN LIGHT - PIT EXIT OPEN");
  rc(400, "Flag", "YELLOW", "YELLOW IN TRACK SECTOR 7", { scope: "Sector", sector: 7, lap_number: 4 });
  rc(430, "Flag", "CLEAR", "CLEAR IN TRACK SECTOR 7", { scope: "Sector", sector: 7, lap_number: 4 });
  rc(900, "Other", null, "CAR 44 (HAM) TIME 1:37.803 DELETED - TRACK LIMITS AT TURN 7 LAP 9 14:21:39", { driver_number: 44, lap_number: 10 });
  if (race) {
    rc(1500, "SafetyCar", null, "SAFETY CAR DEPLOYED", { lap_number: 16 });
    rc(1800, "SafetyCar", null, "SAFETY CAR IN THIS LAP", { lap_number: 19 });
    rc(2400, "Other", null, "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 31 (OCO) - CAUSING A COLLISION", { driver_number: 31, lap_number: 25 });
  }
  for (let s = 60; s <= 4000; s += 15) rc(s, "Drs", null, s % 2 ? "DRS ENABLED" : "DRS DISABLED");
  out.race_control = out.race_control.filter(m => m.category !== "Drs" || Date.parse(m.date) > until - 120_000);
  if (until >= end) rc((end - start) / 1000, "Flag", "CHEQUERED", "CHEQUERED FLAG");
  for (let at = start - 600_000; at <= until; at += 60_000) {
    const k = (at - start) / 60_000;
    out.weather.push({ ...base, date: iso(at), air_temperature: 29.5 + Math.sin(k / 20), track_temperature: 36 + Math.sin(k / 15) * 2, humidity: 74 + Math.round(Math.cos(k / 10) * 3), pressure: 1008.2, rainfall: 0, wind_direction: 135, wind_speed: 1.8 });
  }
  return out;
}

/** OpenF1-style filters from a query string: "date>2026-..", "lap_number>=3", "driver_number=1". */
export function applyFilters(rows, search) {
  const filters = search.replace(/^\?/, "").split("&").filter(Boolean).map((part) => {
    const m = decodeURIComponent(part).match(/^([a-z_0-9]+)(>=|<=|>|<|=)(.*)$/);
    return m && { field: m[1], op: m[2], value: m[3] };
  }).filter(Boolean);
  return rows.filter((row) => filters.every(({ field, op, value }) => {
    if (!(field in row)) return true; // e.g. year on rows that lack it
    const v = row[field];
    const isDate = typeof v === "string" && /^\d{4}-\d\d-\d\d/.test(v);
    const a = isDate ? Date.parse(v) : typeof v === "number" ? v : String(v);
    const b = isDate ? Date.parse(value.replace(" ", "+")) : typeof v === "number" ? Number(value) : value;
    return op === "=" ? a == b : op === ">" ? a > b : op === ">=" ? a >= b : op === "<" ? a < b : a <= b;
  }));
}

/** Synthetic car_data between two dates (~3.7 Hz), shaped like a lap with 6 braking zones. */
export function carData(session, driverNumber, fromMs, toMs) {
  const rows = [];
  const variation = (driverNumber % 7) * 0.8;
  const iso = (ms) => new Date(ms).toISOString().replace("Z", "+00:00");
  for (let t = fromMs; t <= toMs; t += 270) {
    const u = ((t - fromMs) / 96_000) % 1; // fraction of a ~96 s lap
    const wave = Math.cos(2 * Math.PI * 6 * u);
    const speed = Math.round(Math.max(85, 205 + 115 * wave - variation * (wave < -0.5 ? 3 : 0)));
    const slope = -Math.sin(2 * Math.PI * 6 * u);
    rows.push({ meeting_key: session.meeting_key, session_key: session.session_key, driver_number: driverNumber, date: iso(t),
      speed, throttle: slope > -0.15 ? (wave > 0.6 ? 100 : Math.round(60 + 40 * Math.max(0, slope))) : 0,
      brake: slope < -0.45 && wave > -0.6 ? 100 : 0, n_gear: Math.min(8, Math.max(1, Math.round(speed / 42))), rpm: 11000, drs: wave > 0.9 ? 12 : 0 });
  }
  return rows;
}

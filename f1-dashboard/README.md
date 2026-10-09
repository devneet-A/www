# F1 Live Dashboard

A second-screen Formula 1 dashboard: live timing, race control, weather, strategy charts, standings and calendar.
Built with Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query and Recharts. Deploys to Vercel.

> **Status:** step 5 of 7 (standings and calendar). The full setup and deploy guide arrives in step 7.

## Run locally

```bash
cd f1-dashboard
npm install
cp .env.example .env.local   # optional: add OpenF1 credentials for live data
npm run dev
```

- http://localhost:3000: the Home page: event header, timing tower, weather and race control.
- http://localhost:3000/analysis: lap times, race trace, tyre strategy, gap to leader and telemetry for any session since 2023.
- http://localhost:3000/standings: drivers' and constructors' championships with points progression.
- http://localhost:3000/calendar: every round and session in your timezone (or IST / UTC).
- http://localhost:3000/api/session/current: the session list the header is built from.
- http://localhost:3000/api/live/timing?session_key=…&mode=full: the timing payload for one session.
- http://localhost:3000/api/health: connectivity check for both upstream APIs.

## Architecture

```
app/
  api/                 Route Handlers: the ONLY place that talks to external APIs
    health/route.ts            connectivity check
    session/current/route.ts   sessions around "now" (for live/next detection)
    live/timing/route.ts       timing tower + race control + weather (full or delta)
    analysis/sessions          Grands Prix + sessions of a season (selector)
    analysis/session           per-lap data for the charts of one session
    analysis/telemetry         fastest-lap telemetry for one driver
    standings                  championships + cumulative points per round
    calendar                   season schedule + winners
  analysis/page.tsx    the charts page
  standings/page.tsx   championship tables + points progression
  calendar/page.tsx    season calendar
  layout.tsx           dark theme, fonts, providers
  providers.tsx        TanStack Query client (browser cache + polling)
components/
  ui/                  shadcn/ui components (card, badge, skeleton)
  home/                Home page: event header, live dashboard, timing tower, race control, weather
  f1/                  reusable F1 bits (tyre badge, team colour bar)
  charts/              chart frame (chart/table toggle), legend, tooltip, series styles
  analysis/            selector + the five analysis charts
  standings/           standings tables + points progression chart
  calendar/            calendar cards with timezone switch
hooks/
  use-now.ts           ticking clock (hydration-safe)
  use-session-state.ts live / latest / next session, re-evaluated every second
  use-timing.ts        polls timing deltas while live, merges them into the state
lib/
  http.ts              fetch with timeout, ApiError, "use cache" result helpers
  openf1.ts            typed OpenF1 client (+ optional OAuth token handling)
  jolpica.ts           typed Jolpica (Ergast-compatible) client
  api-response.ts      JSON responses with CDN Cache-Control headers
  api-client.ts        browser helper for calling our own /api routes
  session-state.ts     pure live/latest/next logic (shared by server and browser)
  session-overview.ts  builds the session list from OpenF1 (+ Jolpica fallback)
  format.ts            your-time / IST / track-time formatting, countdown
  f1.ts                team colours, tyre compounds, lap/gap formatting
  timing.ts            timing payload types, delta merging, tower rows (shared)
  live-timing.ts       builds timing payloads from OpenF1 (server)
  analysis.ts          analysis payload types (shared)
  analysis-server.ts   builds analysis + telemetry payloads (server, cached whole)
  params.ts            query-string validation for route handlers
  standings.ts         standings + calendar payload types (shared)
  standings-server.ts  builds standings + calendar from Jolpica, colours from OpenF1
```

### Caching (two layers)

1. **Server data cache.** Every upstream call goes through a `"use cache"` function with a
   `cacheLife` profile defined in `next.config.ts`:

   | Profile | Refreshes after | Used for |
   | --- | --- | --- |
   | `live` | 4 s | positions, intervals, race control, laps during a session |
   | `session` | 60 s | session lists, live/next-session detection |
   | `static` | 3 h | drivers, calendar, standings |
   | `historical` | 7 days | data from finished sessions |
   | `error` | 5 s | failed calls, so an outage doesn't get hammered |

2. **CDN cache.** Route handlers send `Cache-Control: s-maxage=…, stale-while-revalidate=…`
   (`lib/api-response.ts`). On Vercel the server cache lives per function instance, so the CDN is
   what makes many visitors share one upstream request.

### Session detection

`lib/session-state.ts` decides, from session start/end times alone:

- **live**: started, and not more than 15 min past its scheduled end (60 min for a race or sprint, since they overrun with red flags)
- **latest completed**: the most recent finished OpenF1 session (it has a `session_key`, so we can show its data)
- **next**: the first session that hasn't started yet

The server loads this year's OpenF1 `sessions` + `meetings` (and last year's in January), fills in
upcoming sessions from Jolpica's calendar if OpenF1 hasn't published them yet, and sends a trimmed
list to the browser. The browser re-runs the same function every second, so the LIVE badge and the
countdown switch on time without polling. If a session is live but no OpenF1 credentials are set,
the page says so and shows the latest completed session's data instead.

### Live timing and polling

`/api/live/timing` has two modes:

- **full**: the latest state of every car (position, gap, interval, last/best lap, tyre, pit
  stops), plus race control and weather, reduced on the server to ~13 KB.
- **delta**: only rows from the last 30 seconds (`date>` filters), ~6 KB.

While a session is live, the browser polls `delta` every 4.5 s and merges it in (`lib/timing.ts`).
It polls only during a live session, pauses while the tab is hidden, and asks for `full` again if
its last update is over 15 s old. The delta window is rounded to 5-second steps, so every viewer
requests the same upstream URLs and shares one cached OpenF1 call. Each poll costs at most 7
upstream requests (position, intervals, laps, race_control, weather, stints, pit), regardless of
how many people are watching.

Gaps and intervals come from OpenF1's `intervals` feed in races and sprints. In practice and
qualifying, they are computed from best lap times. If OpenF1 rejects the configured credentials,
the page stops polling and falls back to the latest completed session with a note.

### Analysis charts

- **Selection lives in the URL** (`/analysis?year=2026&session=9161&drivers=1,4`), so views can be
  bookmarked and shared. The default is the latest finished race and its top 5.
- **Position and gap per lap come from lap timestamps**, not the `intervals` feed. A car finishes
  lap N when it starts lap N+1, so ranking those moments gives the order, and the difference to
  the first car gives the gap. This avoids downloading ~36k interval rows per race.
- **Telemetry** is fetched only for the fastest lap's time window (`car_data` with `date>=`/`date<=`).
  Distance is integrated from speed, because OpenF1 doesn't provide it. Both laps are resampled to
  a shared 10 m grid so the synced tooltips compare the same point on track.
- **Colours:** team colours from the API, as requested. Teammates share a colour and some team
  colours are close (a colour-blindness check flagged Haas grey vs Williams blue), so the second
  driver of each team gets a dashed line, and every chart has a legend, end labels and a
  **Table** view with the exact numbers.
- Finished sessions are cached for days, both server-side and at the CDN.

### Standings and calendar

- Data comes from **Jolpica**. It has no team colours, so they're borrowed from OpenF1's driver list
  for the same season and matched by driver code. Constructors take the colour of their drivers,
  because team names differ between the two APIs ("RB F1 Team" vs "Racing Bulls").
- **Points progression** adds up race and sprint results round by round. The full season's results
  come back in pages of 100 rows (~4 requests), which are merged by round.
- **Calendar winners** use `/{year}/results/1`: only P1 of each round, in one request.
- Times are converted in the browser with `Intl.DateTimeFormat`, so they're always in the viewer's
  timezone; the IST/UTC switch and the season are kept in the URL.
- The current season is cached for 3 hours, past seasons for days.

### OpenF1 access

The [OpenF1 docs](https://openf1.org) say historical data (2023 onwards) is free with no auth, and
**real-time data needs a paid account**. Auth is OAuth2: the server POSTs your username and password
to `https://api.openf1.org/token` and sends the 1-hour token as `Authorization: Bearer …`.
Set either `OPENF1_API_KEY` (a token you already have) or `OPENF1_USERNAME` + `OPENF1_PASSWORD`.
With neither set, the app shows the latest completed session.

## Data plan: endpoints per feature

| Feature | OpenF1 (`/v1/...`) | Jolpica |
| --- | --- | --- |
| Live vs latest session detection | `sessions` (date_start/date_end, `session_key=latest`), `meetings` | `{year}` schedule as backup |
| Home header + countdown | `meetings`, `sessions` | `current` schedule (next session) |
| Timing tower | `position`, `intervals`, `laps` (last lap), `stints` (tyre + age), `pit` (stop count), `drivers` (code, team colour) | n/a |
| Race control feed | `race_control` | n/a |
| Weather card | `weather` | n/a |
| Lap time chart | `laps`, `drivers` | n/a |
| Position / race trace | `laps` (lap → date) + `position` | n/a |
| Tyre strategy | `stints`, `drivers` | n/a |
| Gap to leader | `intervals` (sampled per lap via `laps.date_start`) | n/a |
| Telemetry comparison | `laps` (fastest lap window), `car_data` (speed, throttle, brake, n_gear) | n/a |
| Standings | n/a | `driverStandings`, `constructorStandings` |
| Points progression | n/a | `{year}/results`, `{year}/sprint` (cumulated per round) |
| Calendar | n/a | `{year}` schedule (all session times, UTC) |

Live polling only requests new rows (e.g. `position?session_key=…&date>LAST_SEEN`).

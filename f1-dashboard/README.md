# F1 Live Dashboard

A second-screen Formula 1 dashboard: live timing, race control, weather, strategy charts, standings and calendar.
Built with Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query and Recharts. Deploys to Vercel.

> **Status:** step 1 of 7 (project setup, typed API clients, test route). The full setup and deploy guide arrives in step 7.

## Run locally

```bash
cd f1-dashboard
npm install
cp .env.example .env.local   # optional: add OpenF1 credentials for live data
npm run dev
```

- http://localhost:3000 shows an API status page with one card per upstream (OpenF1 and Jolpica).
- http://localhost:3000/api/health returns the same check as raw JSON.

## Architecture

```
app/
  api/                 Route Handlers: the ONLY place that talks to external APIs
    health/route.ts    step-1 test route
  layout.tsx           dark theme, fonts, providers
  providers.tsx        TanStack Query client (browser cache + polling)
components/
  ui/                  shadcn/ui components (card, badge, skeleton)
lib/
  http.ts              fetch with timeout, ApiError, "use cache" result helpers
  openf1.ts            typed OpenF1 client (+ optional OAuth token handling)
  jolpica.ts           typed Jolpica (Ergast-compatible) client
  api-response.ts      JSON responses with CDN Cache-Control headers
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

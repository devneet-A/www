# F1 Live Dashboard

A second-screen Formula 1 dashboard for following a session as it happens: live timing tower,
race control feed and weather during practice, qualifying, sprints and races, then lap-time,
strategy and telemetry charts, championship standings and the season calendar.

Built with Next.js 16 (App Router) and TypeScript, Tailwind CSS v4 and shadcn/ui, TanStack Query
and Recharts. Data from [OpenF1](https://openf1.org) and [Jolpica F1](https://github.com/jolpica/jolpica-f1).
No database. Runs on Vercel's free (Hobby) plan.

> Unofficial fan project, not associated with Formula 1. F1, FORMULA ONE, FORMULA 1, FIA FORMULA
> ONE WORLD CHAMPIONSHIP and GRAND PRIX are trademarks of Formula One Licensing B.V.

## Features

| Page | What you get |
| --- | --- |
| **Live** (`/`) | Current or next Grand Prix with a LIVE badge, countdown, and session times in your timezone, IST and track time. Timing tower (position, gap, interval, last/best lap, tyre and age, pit stops), race control feed, weather. Updates every 4.5 s while a session is live. |
| **Analysis** (`/analysis`) | Any session since 2023: lap times, race trace, tyre strategy, gap to leader, and a fastest-lap telemetry comparison (speed, throttle, brake, gear). |
| **Standings** (`/standings`) | Drivers' and constructors' championships with a points-progression chart. |
| **Calendar** (`/calendar`) | Every round and session in your timezone (or IST / UTC), winners of past rounds, countdown to the next session. |

Dark broadcast-style theme with a floating pill navigation bar, floating rounded panels and
pill-shaped controls; team colours from the API; mobile-first; no layout jumps while loading; and a
friendly message (never a blank screen) when something fails.

## Quick start

You need **Node.js 20.9 or newer** (`node -v` to check) and npm.

```bash
git clone <your-repo-url>
cd <repo>/f1-dashboard        # the app lives in this subfolder
npm install
npm run dev
```

Open http://localhost:3000. No API keys are needed: without them you get every page, and the Live
page shows the **latest completed session** instead of live timing.

### Try it with simulated data (no internet, no account)

`npm run mock` starts a local fake OpenF1 + Jolpica (in `scripts/mock/`) and runs the app against
it. The racing is fictional, but it behaves like the real APIs, including live sessions that
progress in real time:

```bash
npm run mock                          # between race weekends
npm run mock -- live-race             # race in progress, no credentials -> latest-session fallback
npm run mock -- live-race --key       # race in progress with credentials -> live timing updating
npm run mock -- live-practice --key   # practice in progress (gaps from best laps)
npm run mock -- down                  # both APIs failing -> error states
```

Press Ctrl+C to stop both the mock and the app.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` / `npm start` | Production build / serve it locally |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check (generates Next's route and cache types first) |
| `npm run mock -- [scenario] [--key]` | App + local mock APIs (see above) |

## Environment variables

All optional. Copy the template and fill in what you have:

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `OPENF1_API_KEY` | An OpenF1 access token you already have. Sent as `Authorization: Bearer ...`. |
| `OPENF1_USERNAME`, `OPENF1_PASSWORD` | Your OpenF1 account login. The server exchanges them for a 1-hour token and renews it automatically. |
| `OPENF1_BASE_URL`, `JOLPICA_BASE_URL` | Advanced: point the API clients elsewhere (the mock uses these). Leave unset normally. |

Use **either** the API key **or** the username and password. They're only read on the server
(`lib/openf1.ts`) and never sent to the browser. `.env.local` is git-ignored, so secrets stay out
of the repository.

**Why live data needs an account:** OpenF1's historical data (2023 onwards) is free, but real-time
data during a session requires a paid account (see [openf1.org](https://openf1.org)). Without
credentials, or if OpenF1 rejects them, the app says so and shows the latest completed session.

## Deploy to Vercel

The app is in the `f1-dashboard/` subfolder of this repository, so Vercel needs to be told where
it is (the **Root Directory** setting).

### Option A: Vercel dashboard (recommended)

1. Push the repository to GitHub (or GitLab / Bitbucket).
2. Go to [vercel.com/new](https://vercel.com/new), sign in, and **Import** the repository.
3. On the configuration screen:
   - **Root Directory**: click **Edit** and choose `f1-dashboard`. *This is the important one.*
   - **Framework Preset**: Next.js (detected automatically once the root directory is set).
   - Build and output settings: leave the defaults (`npm run build`, output handled by Next.js).
4. Under **Environment Variables**, add `OPENF1_API_KEY`, or `OPENF1_USERNAME` and
   `OPENF1_PASSWORD`, if you have them. You can skip this and add them later.
5. Click **Deploy**. After about a minute you get a URL like `https://f1-dashboard-xxxx.vercel.app`.

Every push to the production branch redeploys automatically; other branches get preview URLs.

**Changing settings later:** Project → **Settings**:
- **Build and Deployment** → **Root Directory**.
- **Environment Variables** → add or edit the keys. Environment variables only apply to new
  deployments, so redeploy afterwards (Deployments → ⋯ → **Redeploy**).

### Option B: Vercel CLI

```bash
npm i -g vercel
cd f1-dashboard
vercel            # first run links the folder to a new project; accept the detected Next.js settings
vercel env add OPENF1_API_KEY    # optional; repeat for other variables
vercel --prod     # production deployment
```

Running the CLI from inside `f1-dashboard/` makes that folder the project root automatically.

### After deploying: check it works

- `https://<your-app>.vercel.app/api/health` should show `"ok": true`, with both `openf1` and
  `jolpica` answering, and `"authenticated": true` if you set credentials.
- The Live page should show the current or next Grand Prix with a countdown.
- In Vercel → **Logs** you can see each API route call. Upstream failures are logged with an
  `[openf1]` or `[jolpica]` prefix.

### Free-tier notes

- **Function time:** the slowest request (a cold analysis load) takes a few seconds, well within
  the Hobby plan's function limit.
- **Usage:** caching keeps usage low. Most requests are answered by Vercel's CDN without running
  a function, and finished sessions are cached for days.
- **Images:** flag images are loaded directly from formula1.com (`unoptimized`), so they don't use
  the free image-optimization quota.

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| Vercel: "No Next.js version detected" | Root Directory isn't `f1-dashboard`. Fix it in Settings → Build and Deployment. |
| "Live timing needs an OpenF1 account" during a session | No credentials set. Add them in `.env.local` or on Vercel, then restart or redeploy. |
| "OpenF1 refused the configured credentials" | Wrong or expired key, or wrong username/password. Check them, then redeploy. |
| "The data provider is busy (rate limit)" | Too many uncached requests at once. Wait a few seconds; caching makes this rare. |
| Lots of errors on every page | Check `/api/health`. If an upstream is down, the app retries on its own when it's back. |
| Times look wrong | Times use your device's timezone. On the calendar, switch "Times in" to IST or UTC to compare. |

## Fonts

The official F1 typeface ("Formula1 Display") is proprietary and licensed by Formula One, so it
isn't included. The app uses **Titillium Web** (free, SIL Open Font License), which has a similar
sporty, technical look, plus **Geist Mono** for timing numbers so columns don't shift as digits
change. Both are downloaded at build time by `next/font` and served from your own domain.

If you hold a licence for the official font, put the `.woff2` files in `app/fonts/` and replace
the `Titillium_Web(...)` call in `app/layout.tsx`. Keeping the same CSS variable name means
nothing else needs to change:

```ts
import localFont from "next/font/local";

const titillium = localFont({
  variable: "--font-titillium", // same variable: the rest of the app picks it up
  src: [
    { path: "./fonts/Formula1-Regular.woff2", weight: "400" },
    { path: "./fonts/Formula1-Bold.woff2", weight: "700" },
    { path: "./fonts/Formula1-Black.woff2", weight: "900" },
  ],
});
```

## Project structure

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
  error.tsx, global-error.tsx, not-found.tsx   safety-net pages
  layout.tsx           dark theme, fonts, providers, offline banner
  providers.tsx        TanStack Query client (browser cache + polling)
components/
  ui/                  shadcn/ui components (card, badge, skeleton), shared error card, pill styles
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
scripts/
  mock/                fake OpenF1 + Jolpica for local development (fictional data)
  dev-mock.mjs         `npm run mock`: starts the mock and the app together
```

Every external request goes through a Route Handler in `app/api/*`; the browser only ever calls
our own `/api` routes. API logic lives in `lib/openf1.ts` and `lib/jolpica.ts` with a TypeScript
interface for every endpoint used.

## How it works

### Caching and rate limits

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

3. **Request spacing.** `lib/http.ts` spaces out upstream requests (OpenF1 3/s, or 10/s with
   credentials; Jolpica 4/s) and retries once on HTTP 429, honouring `Retry-After`. A cold
   analysis load fires ~7 requests at once; this keeps them inside the burst limits.

| Route | CDN cache | Browser refresh |
| --- | --- | --- |
| `/api/session/current` | 30 s (4 s if an upstream failed) | every 60 s |
| `/api/live/timing` | 4 s while live/upcoming, 1 day once finished | every 4.5 s, only while live |
| `/api/analysis/sessions` | 30 s | on demand |
| `/api/analysis/session`, `/telemetry` | 30 s while running, 1 day once finished | on demand |
| `/api/standings`, `/api/calendar` | 3 h (current season), 1 day (past seasons) | on demand |
| `/api/health` | never | on demand |

Errors are never cached at the CDN (`no-store`), and only for 5 s on the server.

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

### Loading and error states

- **No layout jumps.** Skeletons match the final layout, and the Home dashboard waits for the
  header to settle before rendering below it. Measured CLS (layout shift) is 0.000 on every page
  at 360, 768 and 1280 px.
- **One error card** (`components/ui/error-state.tsx`) everywhere: what failed, why in plain
  words (offline, rate limit, timeout, credentials), and a Retry button.
- **Safety nets:** `app/error.tsx` for unexpected rendering errors, `app/global-error.tsx` if the
  layout itself fails, `app/not-found.tsx` for unknown URLs.
- **Offline banner** when the browser loses its connection; data refreshes on reconnect.
- **Accessibility:** a "Skip to content" link, animations off when the OS asks for reduced
  motion, table views for every chart.

### OpenF1 authentication

The [OpenF1 docs](https://openf1.org) say historical data (2023 onwards) is free with no auth, and
**real-time data needs a paid account**. Auth is OAuth2: the server POSTs your username and password
to `https://api.openf1.org/token` and sends the 1-hour token as `Authorization: Bearer …`.
Set either `OPENF1_API_KEY` (a token you already have) or `OPENF1_USERNAME` + `OPENF1_PASSWORD`.
With neither set, the app shows the latest completed session.

## Data sources: endpoints per feature

| Feature | OpenF1 (`/v1/...`) | Jolpica |
| --- | --- | --- |
| Live vs latest session detection | `sessions`, `meetings` | season schedule (fills in upcoming sessions) |
| Header and countdown | `sessions`, `meetings` (flag, track time offset) | schedule |
| Timing tower | `position`, `intervals`, `laps`, `stints`, `pit`, `drivers` | |
| Race control / weather | `race_control` / `weather` | |
| Lap times, tyre strategy | `laps`, `stints`, `pit`, `drivers` | |
| Position and gap per lap | `laps` (timestamps), `position` (grid) | |
| Telemetry comparison | `laps` (fastest-lap window), `car_data` | |
| Standings and points progression | `drivers` (team colours) | `driverStandings`, `constructorStandings`, `results`, `sprint` |
| Calendar | `drivers` (winner colours) | season schedule, `results/1` (winners) |

While a session is live, requests use time-window filters (`date>…`) so only new rows are fetched.

## Credits

Data: [OpenF1](https://openf1.org) (MIT-licensed, unofficial) and [Jolpica F1](https://github.com/jolpica/jolpica-f1)
(Ergast-compatible). Please respect their rate limits; the caching in this app exists for that.

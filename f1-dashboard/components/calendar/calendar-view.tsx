"use client";

/**
 * /calendar: every round of a season with its session times converted to
 * the viewer's timezone (or IST / UTC on request). Finished races show the
 * winner; the next race is pinned at the top with a countdown.
 */
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Countdown } from "@/components/f1/countdown";
import { TeamBar } from "@/components/f1/team-bar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/hooks/use-now";
import { getJson } from "@/lib/api-client";
import { IST, localZoneName } from "@/lib/format";
import type { CalendarPayload, CalendarRace } from "@/lib/standings";
import { cn } from "@/lib/utils";

type Zone = "local" | "ist" | "utc";
const ZONES: Record<Zone, string | undefined> = { local: undefined, ist: IST, utc: "UTC" };

const fmt = (iso: string, zone: Zone, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, { timeZone: ZONES[zone], hourCycle: "h23", ...opts }).format(new Date(iso));

/** "9–11 Oct", or "30 Mar – 1 Apr" across months: first session to race day. */
function dateRange(race: CalendarRace, zone: Zone) {
  const first = race.sessions[0]?.start ?? race.sessions.at(-1)!.start;
  const last = race.sessions.at(-1)!.start;
  const day = (iso: string) => fmt(iso, zone, { day: "numeric" });
  const month = (iso: string) => fmt(iso, zone, { month: "short" });
  if (day(first) === day(last) && month(first) === month(last)) return `${day(last)} ${month(last)}`;
  if (month(first) === month(last)) return `${day(first)}–${day(last)} ${month(last)}`;
  return `${day(first)} ${month(first)} – ${day(last)} ${month(last)}`;
}

/** A race is "done" a couple of hours after its start; good enough for a calendar. */
const raceDone = (race: CalendarRace, now: number) => Date.parse(race.sessions.at(-1)!.start) + 3 * 3_600_000 < now;

function SessionList({ race, zone, now }: { race: CalendarRace; zone: Zone; now: number }) {
  return (
    <ul className="space-y-1 text-sm">
      {race.sessions.map((s) => {
        const past = Date.parse(s.start) < now;
        return (
          <li key={s.name} className={cn("flex justify-between gap-3", past && "text-muted-foreground")}>
            <span className={cn(s.name === "Race" && "font-semibold")}>{s.name}</span>
            <span className="tabular-nums">
              {fmt(s.start, zone, { weekday: "short", day: "numeric", month: "short" })} · {fmt(s.start, zone, { hour: "2-digit", minute: "2-digit" })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function RaceCard({ race, zone, now, isNext }: { race: CalendarRace; zone: Zone; now: number; isNext: boolean }) {
  const done = raceDone(race, now);
  return (
    <Card id={`round-${race.round}`} className={cn("gap-3", isNext && "border-primary", done && "opacity-75")}>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              Round {race.round} · {dateRange(race, zone)}
            </p>
            <h2 className="font-semibold text-balance">{race.name}</h2>
            <p className="text-sm text-muted-foreground">
              {race.locality}, {race.country}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {isNext && <Badge>NEXT</Badge>}
            {race.sprint && <Badge variant="outline">Sprint</Badge>}
          </div>
        </div>
        {done && race.winner ? (
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">Winner</span>
            <TeamBar colour={race.winner.teamColour} />
            <span className="font-medium">{race.winner.name}</span>
          </p>
        ) : (
          <SessionList race={race} zone={zone} now={now} />
        )}
      </CardContent>
    </Card>
  );
}

export function CalendarView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const thisYear = new Date().getFullYear();
  const year = Number(params.get("year")) || thisYear;
  const zone: Zone = (["local", "ist", "utc"] as Zone[]).find((z) => z === params.get("tz")) ?? "local";
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(k, v);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  // Ticks every second for the countdown; null until mounted (avoids hydration mismatch).
  const now = useNow(1000);

  const query = useQuery({
    queryKey: ["calendar", year],
    queryFn: ({ signal }) => getJson<CalendarPayload>(`/api/calendar?year=${year}`, signal),
    staleTime: 10 * 60_000,
  });

  const years = [thisYear + 1, ...Array.from({ length: thisYear - 2023 + 1 }, (_, i) => thisYear - i)];
  const races = query.data?.races ?? [];
  const next = now === null ? null : (races.find((r) => !raceDone(r, now)) ?? null);
  const nextSession = next && now !== null ? next.sessions.find((s) => Date.parse(s.start) > now) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Season" value={year} onChange={(e) => setParam("year", e.target.value)} className="rounded-md border bg-card px-2 py-1.5 text-sm">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Times in</span>
          <select aria-label="Timezone" value={zone} onChange={(e) => setParam("tz", e.target.value)} className="rounded-md border bg-card px-2 py-1.5 text-sm">
            <option value="local">Your timezone{now !== null ? ` (${localZoneName()})` : ""}</option>
            <option value="ist">India (IST)</option>
            <option value="utc">UTC</option>
          </select>
        </label>
      </div>

      {query.isPending || now === null ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : !query.data ? (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 text-sm">
            <span>
              <span className="font-medium">Couldn&apos;t load the calendar.</span> <span className="text-muted-foreground">{query.error?.message}</span>
            </span>
            <button onClick={() => query.refetch()} className="shrink-0 rounded-md border px-3 py-1.5">
              Retry
            </button>
          </CardContent>
        </Card>
      ) : races.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">The {year} calendar hasn&apos;t been published yet.</CardContent>
        </Card>
      ) : (
        <>
          {next && nextSession && (
            <Card className="gap-3 border-t-4 border-t-primary">
              <CardContent className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Next up · {nextSession.name}
                  </p>
                  <p className="text-lg font-bold">{next.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {fmt(nextSession.start, zone, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Countdown target={nextSession.start} now={now} size="md" />
                  <a href={`#round-${next.round}`} className="text-xs text-muted-foreground underline">
                    Jump to round {next.round}
                  </a>
                </div>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {races.map((r) => (
              <RaceCard key={r.round} race={r} zone={zone} now={now} isNext={r.round === next?.round} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

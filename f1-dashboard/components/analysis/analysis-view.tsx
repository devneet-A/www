"use client";

/**
 * The /analysis page: one selector row (year → Grand Prix → session, then
 * drivers) that scopes every chart below it.
 *
 * Selections live in the URL (?year=2026&session=9161&drivers=1,4), so a
 * view can be bookmarked or shared, and the back button works.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { TeamBar } from "@/components/f1/team-bar";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnalysisDriver, AnalysisMeeting, SessionAnalysis } from "@/lib/analysis";
import { getJson } from "@/lib/api-client";
import { formatGap } from "@/lib/f1";
import { pillButton, pillSelect } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import { LapTimeChart } from "./lap-time-chart";
import { RaceTraceChart } from "./race-trace-chart";
import { TelemetryCompare } from "./telemetry-compare";
import { TyreStrategy } from "./tyre-strategy";

/** OpenF1 has data from 2023; the list grows by itself each season. */
const FIRST_YEAR = 2023;
const DEFAULT_DRIVER_COUNT = 5;

/** Default session: the latest finished race, else the latest finished session. */
function defaultSession(meetings: AnalysisMeeting[]) {
  const all = meetings.flatMap((m) => m.sessions.map((s) => ({ ...s, meetingKey: m.meetingKey })));
  const done = all.filter((s) => s.completed);
  return done.filter((s) => s.name === "Race").at(-1) ?? done.at(-1) ?? all.at(-1) ?? null;
}

const selectClass = pillSelect;

export function AnalysisView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const currentYear = new Date().getFullYear();
  const year = Number(params.get("year")) || currentYear;

  /** Update some URL params, keeping the rest. replace() so each click isn't a history entry. */
  const setParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const meetingsQuery = useQuery({
    queryKey: ["analysis-meetings", year],
    queryFn: ({ signal }) => getJson<AnalysisMeeting[]>(`/api/analysis/sessions?year=${year}`, signal),
    staleTime: 60_000,
  });
  const meetings = useMemo(() => meetingsQuery.data ?? [], [meetingsQuery.data]);

  // Resolve the session: from the URL if it's in this year's list, else the default.
  const urlSession = Number(params.get("session")) || null;
  const fallback = defaultSession(meetings);
  const sessionKey = meetings.some((m) => m.sessions.some((s) => s.sessionKey === urlSession)) ? urlSession : (fallback?.sessionKey ?? null);
  const meeting = meetings.find((m) => m.sessions.some((s) => s.sessionKey === sessionKey)) ?? null;

  const analysisQuery = useQuery({
    queryKey: ["analysis", sessionKey],
    queryFn: ({ signal }) => getJson<SessionAnalysis>(`/api/analysis/session?session_key=${sessionKey}`, signal),
    enabled: sessionKey !== null,
    staleTime: 60_000,
    // While a new session loads, keep showing the previous one (faded)
    // instead of flashing skeletons.
    placeholderData: keepPreviousData,
  });
  const data = analysisQuery.data;
  const dimmed = analysisQuery.isPlaceholderData;

  // Selected drivers: from the URL, else the top finishers.
  const selected: AnalysisDriver[] = useMemo(() => {
    if (!data) return [];
    const raw = params.get("drivers");
    if (raw === null) return data.drivers.slice(0, DEFAULT_DRIVER_COUNT);
    const wanted = new Set(raw.split(",").filter(Boolean).map(Number));
    return data.drivers.filter((d) => wanted.has(d.driver_number));
  }, [data, params]);

  const setDrivers = (list: AnalysisDriver[]) => setParams({ drivers: list.map((d) => d.driver_number).join(",") });
  const toggleDriver = (d: AnalysisDriver) =>
    setDrivers(
      selected.some((s) => s.driver_number === d.driver_number)
        ? selected.filter((s) => s.driver_number !== d.driver_number)
        : // Keep the finishing order so legends and tables read top-down.
          data!.drivers.filter((x) => x.driver_number === d.driver_number || selected.some((s) => s.driver_number === x.driver_number)),
    );

  const years = Array.from({ length: currentYear - FIRST_YEAR + 1 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-4">
      {/* ---- Selector row: scopes everything below ---- */}
      {/* A grid with fixed column widths, so the row doesn't reflow when the
          option texts change from "Loading…" to long Grand Prix names. */}
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 sm:grid-cols-[5.5rem_16rem_12rem]">
        <select
          aria-label="Season"
          value={year}
          onChange={(e) => setParams({ year: e.target.value, session: null, drivers: null })}
          className={selectClass}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          aria-label="Grand Prix"
          value={meeting?.meetingKey ?? ""}
          disabled={meetings.length === 0}
          onChange={(e) => {
            const m = meetings.find((x) => x.meetingKey === Number(e.target.value));
            const pick = m && (m.sessions.filter((s) => s.name === "Race").at(-1) ?? m.sessions.at(-1));
            setParams({ session: pick ? String(pick.sessionKey) : null, drivers: null });
          }}
          className={selectClass}
        >
          {meetings.length === 0 && <option value="">{meetingsQuery.isPending ? "Loading…" : "No sessions yet"}</option>}
          {meetings.map((m) => (
            <option key={m.meetingKey} value={m.meetingKey}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Session"
          value={sessionKey ?? ""}
          disabled={!meeting}
          onChange={(e) => setParams({ session: e.target.value, drivers: null })}
          className={cn(selectClass, "col-span-2 sm:col-span-1")}
        >
          {meeting?.sessions.map((s) => (
            <option key={s.sessionKey} value={s.sessionKey}>
              {s.name}
              {s.completed ? "" : " (live)"}
            </option>
          ))}
        </select>
      </div>

      {meetingsQuery.error && (
        <ErrorState title="Couldn't load the season's sessions" error={meetingsQuery.error} onRetry={() => meetingsQuery.refetch()} retrying={meetingsQuery.isFetching} />
      )}
      {!meetingsQuery.isPending && !meetingsQuery.error && meetings.length === 0 && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            No sessions with data in {year} yet.{" "}
            <button className="underline" onClick={() => setParams({ year: String(year - 1), session: null, drivers: null })}>
              Show {year - 1}
            </button>
          </CardContent>
        </Card>
      )}

      {analysisQuery.error && !data && (
        <ErrorState title="Couldn't load this session" error={analysisQuery.error} onRetry={() => analysisQuery.refetch()} retrying={analysisQuery.isFetching} />
      )}

      {(meetingsQuery.isPending || (sessionKey !== null && analysisQuery.isPending)) && <AnalysisSkeleton />}

      {data && (
        <>
          {/* ---- Driver picker ---- */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Drivers</span>
              <button className={pillButton("sm")} onClick={() => setDrivers(data.drivers.slice(0, DEFAULT_DRIVER_COUNT))}>
                Top {DEFAULT_DRIVER_COUNT}
              </button>
              <button className={pillButton("sm")} onClick={() => setDrivers(data.drivers)}>
                All
              </button>
              <button className={pillButton("sm")} onClick={() => setDrivers([])}>
                None
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.drivers.map((d) => {
                const on = selected.some((s) => s.driver_number === d.driver_number);
                return (
                  <button
                    key={d.driver_number}
                    onClick={() => toggleDriver(d)}
                    aria-pressed={on}
                    title={`${d.full_name}${d.team_name ? ` · ${d.team_name}` : ""}`}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-2 text-xs font-bold transition-colors",
                      on
                        ? "border-white/25 bg-white/10 shadow-sm shadow-black/30"
                        : "border-white/[0.06] bg-card/60 text-muted-foreground hover:border-white/15 hover:text-foreground",
                    )}
                  >
                    <TeamBar colour={d.team_colour} />
                    {d.name_acronym}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <LapTimeChart data={data} selected={selected} dimmed={dimmed} />
            <TyreStrategy data={data} selected={selected} dimmed={dimmed} />
            {/* Position and gap charts only make sense with a race order. */}
            {data.session.isRace && (
              <>
                <RaceTraceChart
                  title="Position"
                  description="Race order at the end of each lap. Grey lines are the rest of the field."
                  values={data.positions}
                  totalLaps={data.totalLaps}
                  allDrivers={data.drivers}
                  selected={selected}
                  showOthers
                  fromLap={0}
                  reversed
                  yDomain={[1, Math.max(1, data.drivers.length)]}
                  yTicks={[1, 5, 10, 15, 20].filter((t) => t <= data.drivers.length)}
                  formatValue={(v) => `P${v}`}
                  dimmed={dimmed}
                />
                <RaceTraceChart
                  title="Gap to leader"
                  description="Seconds behind the first car to complete each lap. Leader on top."
                  values={data.gaps}
                  totalLaps={data.totalLaps}
                  allDrivers={data.drivers}
                  selected={selected}
                  fromLap={1}
                  reversed
                  yDomain={[0, "auto"]}
                  formatValue={(v) => (v === 0 ? "Leader" : formatGap(v))}
                  formatTick={(v) => `${v} s`}
                  dimmed={dimmed}
                />
              </>
            )}
          </div>
          <TelemetryCompare key={data.session.sessionKey} data={data} />
        </>
      )}
    </div>
  );
}

export function AnalysisSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <Skeleton className="h-16 w-full" />
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-80 w-full rounded-3xl" />
        ))}
      </div>
    </div>
  );
}

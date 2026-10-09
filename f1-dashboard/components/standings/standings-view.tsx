"use client";

/**
 * /standings: drivers' or constructors' championship table plus a points
 * progression chart. One control row (season + Drivers/Constructors) scopes
 * both. Clicking a table row highlights that entry in the chart.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { Legend } from "@/components/charts/legend";
import { CHART, seriesStyle, type SeriesStyle } from "@/components/charts/series";
import { TeamBar } from "@/components/f1/team-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getJson } from "@/lib/api-client";
import type { StandingsPayload } from "@/lib/standings";
import { cn } from "@/lib/utils";

type Kind = "drivers" | "constructors";
/** How many leaders are highlighted in the chart by default. */
const DEFAULT_HIGHLIGHT = 6;

/** One row shape for both tables, so the table and chart code is shared. */
interface Entry {
  id: string;
  position: number | null;
  label: string; // "Max Verstappen" / "McLaren"
  short: string; // "VER" / "McLaren"
  sub: string; // team or nationality
  colour: string | null;
  teamIndex: number; // second driver of a team gets a dashed line
  points: number;
  wins: number;
}

function toEntries(data: StandingsPayload, kind: Kind): Entry[] {
  if (kind === "constructors") {
    return data.constructors.map((c) => ({
      id: c.constructorId,
      position: c.position,
      label: c.name,
      short: c.name,
      sub: c.nationality,
      colour: c.teamColour,
      teamIndex: 0,
      points: c.points,
      wins: c.wins,
    }));
  }
  const seen = new Map<string, number>();
  return data.drivers.map((d) => {
    const teamIndex = seen.get(d.team) ?? 0;
    seen.set(d.team, teamIndex + 1);
    return { id: d.driverId, position: d.position, label: d.name, short: d.code, sub: d.team, colour: d.teamColour, teamIndex, points: d.points, wins: d.wins };
  });
}

const styleFor = (e: Entry): SeriesStyle => ({
  ...seriesStyle({ driver_number: 0, name_acronym: e.short, team_colour: e.colour, teamIndex: e.teamIndex }),
  key: e.id,
});

export function StandingsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const thisYear = new Date().getFullYear();
  const year = Number(params.get("year")) || thisYear;
  const kind: Kind = params.get("view") === "constructors" ? "constructors" : "drivers";
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(k, v);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  const query = useQuery({
    queryKey: ["standings", year],
    queryFn: ({ signal }) => getJson<StandingsPayload>(`/api/standings?year=${year}`, signal),
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });

  // Highlight state per view; null = default (the leaders).
  const [picked, setPicked] = useState<Record<Kind, string[] | null>>({ drivers: null, constructors: null });

  const entries = useMemo(() => (query.data ? toEntries(query.data, kind) : []), [query.data, kind]);
  const highlighted = picked[kind] ?? entries.slice(0, DEFAULT_HIGHLIGHT).map((e) => e.id);
  const toggle = (id: string) =>
    setPicked((p) => ({ ...p, [kind]: highlighted.includes(id) ? highlighted.filter((x) => x !== id) : [...highlighted, id] }));

  // From 2023, matching the analysis page (OpenF1, our source of team colours, starts then).
  const years = Array.from({ length: thisYear - 2023 + 1 }, (_, i) => thisYear - i);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Season"
          value={year}
          onChange={(e) => setParam("year", e.target.value)}
          className="rounded-md border bg-card px-2 py-1.5 text-sm"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <div role="tablist" aria-label="Championship" className="flex rounded-md border p-0.5 text-sm">
          {(["drivers", "constructors"] as Kind[]).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => setParam("view", k)}
              className={cn("rounded px-3 py-1 capitalize", kind === k ? "bg-secondary" : "text-muted-foreground")}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {query.isPending ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <Skeleton className="h-[36rem]" />
          <Skeleton className="h-[28rem]" />
        </div>
      ) : !query.data ? (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 text-sm">
            <span>
              <span className="font-medium">Couldn&apos;t load the standings.</span>{" "}
              <span className="text-muted-foreground">{query.error?.message}</span>
            </span>
            <button onClick={() => query.refetch()} className="shrink-0 rounded-md border px-3 py-1.5">
              Retry
            </button>
          </CardContent>
        </Card>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">No results yet for {year}. The table fills in after the first race.</CardContent>
        </Card>
      ) : (
        <div className={cn("grid items-start gap-4 transition-opacity lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]", query.isPlaceholderData && "opacity-50")}>
          <StandingsTable entries={entries} kind={kind} round={query.data.round} highlighted={highlighted} onToggle={toggle} />
          <PointsChart data={query.data} kind={kind} entries={entries} highlighted={highlighted} />
        </div>
      )}
    </div>
  );
}

function StandingsTable({
  entries,
  kind,
  round,
  highlighted,
  onToggle,
}: {
  entries: Entry[];
  kind: Kind;
  round: number | null;
  highlighted: string[];
  onToggle: (id: string) => void;
}) {
  const leader = entries[0]?.points ?? 0;
  return (
    <Card className="gap-2">
      <CardHeader>
        <CardTitle>{kind === "drivers" ? "Drivers' championship" : "Constructors' championship"}</CardTitle>
        <p className="text-xs text-muted-foreground">{round ? `After round ${round}. ` : ""}Tap a row to highlight it in the chart.</p>
      </CardHeader>
      <CardContent className="px-2 sm:px-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="h-7 text-[11px] tracking-wider text-muted-foreground uppercase">
              <th className="w-8 text-left font-medium">Pos</th>
              <th className="text-left font-medium">{kind === "drivers" ? "Driver" : "Team"}</th>
              <th className="w-10 text-right font-medium">Wins</th>
              <th className="w-14 text-right font-medium">Pts</th>
              <th className="w-14 text-right font-medium">Gap</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const on = highlighted.includes(e.id);
              return (
                <tr
                  key={e.id}
                  onClick={() => onToggle(e.id)}
                  className={cn("h-10 cursor-pointer border-t border-border/50 hover:bg-muted/40", on && "bg-muted/30")}
                >
                  <td className="font-mono font-semibold tabular-nums">{e.position ?? "–"}</td>
                  <td className="min-w-0">
                    {/* A real button inside the row so keyboard users can toggle too. */}
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onToggle(e.id);
                      }}
                      className="flex w-full min-w-0 items-center gap-2 text-left"
                    >
                      <TeamBar colour={e.colour} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{e.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{e.sub}</span>
                      </span>
                    </button>
                  </td>
                  <td className="text-right font-mono tabular-nums">{e.wins || ""}</td>
                  <td className="text-right font-mono font-semibold tabular-nums">{e.points}</td>
                  <td className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                    {e.points === leader ? "" : `−${leader - e.points}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function PointsChart({ data, kind, entries, highlighted }: { data: StandingsPayload; kind: Kind; entries: Entry[]; highlighted: string[] }) {
  const progression = kind === "drivers" ? data.driverProgression : data.constructorProgression;
  const highlightSet = new Set(highlighted);
  // Entries in standings order: highlighted get colour; the rest are grey context.
  const series = entries.filter((e) => highlightSet.has(e.id)).map(styleFor);
  const others = entries.filter((e) => !highlightSet.has(e.id) && progression[e.id]);

  const rows = useMemo(
    () =>
      data.rounds.map((r, i) => {
        const row: Record<string, number | string> = { round: r.round, name: r.name };
        for (const [id, values] of Object.entries(progression)) row[id] = values[i];
        return row;
      }),
    [data.rounds, progression],
  );
  const roundName = new Map(data.rounds.map((r) => [r.round, r.name]));
  const lastIndex = rows.length - 1;

  const table = () => ({
    columns: ["Round", ...series.map((s) => s.label)],
    rows: rows.map((r) => [`R${r.round} ${r.name}`, ...series.map((s) => (r[s.key] as number | undefined) ?? 0)]),
  });

  return (
    <ChartCard
      title="Points progression"
      description="Cumulative points after each round (race + sprint results)."
      legend={<Legend series={series} />}
      table={table}
    >
      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No rounds completed yet.</p>
      ) : (
        <div className="h-80 sm:h-[28rem]">
          <ResponsiveContainer width="100%" height="100%">
            {/* Right margin leaves room for the end labels; team names need more than driver codes. */}
            <LineChart data={rows} margin={{ top: 8, right: kind === "drivers" ? 72 : 124, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="round" type="number" domain={["dataMin", "dataMax"]} tick={CHART.tick} stroke={CHART.axis} tickLine={false} allowDecimals={false} tickFormatter={(v: number) => `R${v}`} />
              <YAxis tick={CHART.tick} stroke={CHART.axis} tickLine={false} width={44} />
              <Tooltip
                cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
                content={
                  <ChartTooltip
                    series={series}
                    sort="desc"
                    formatValue={(v) => `${v} pts`}
                    formatLabel={(x) => `R${x} · ${roundName.get(x) ?? ""}`}
                  />
                }
              />
              {others.map((e) => (
                <Line key={e.id} dataKey={e.id} stroke={CHART.muted} strokeWidth={1} dot={false} activeDot={false} isAnimationActive={false} />
              ))}
              {series.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  stroke={s.colour}
                  strokeDasharray={s.dash}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                  isAnimationActive={false}
                  label={(p: { index?: number; x?: number | string; y?: number | string; value?: unknown }) =>
                    p.index === lastIndex ? (
                      <text key={s.key} x={Number(p.x) + 6} y={Number(p.y)} dy={4} fontSize={11} fill="var(--foreground)">
                        <tspan fontWeight={600}>{s.label}</tspan> {String(p.value)}
                      </text>
                    ) : (
                      <g key={`${s.key}-${p.index}`} />
                    )
                  }
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

"use client";

/**
 * Fastest-lap telemetry, driver A vs driver B: speed, throttle, brake and
 * gear against distance (or time). Each measure is its own small chart with
 * its own y-axis (never two scales on one chart); hovering one shows the
 * same point on all four (Recharts `syncId`).
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { Legend } from "@/components/charts/legend";
import { CHART, seriesStyle, type SeriesStyle } from "@/components/charts/series";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnalysisDriver, LapTelemetry, SessionAnalysis, TelemetrySample } from "@/lib/analysis";
import { getJson } from "@/lib/api-client";
import { formatLapTime } from "@/lib/f1";

type Axis = "d" | "t";
type Channel = "speed" | "throttle" | "brake" | "gear";
const GRID_STEP = { d: 10, t: 0.1 }; // 10 m or 0.1 s

/**
 * Both laps are sampled at slightly different moments (~3.7 Hz each), so we
 * resample them onto one shared grid. Then a tooltip at "1,250 m" compares
 * both drivers at the same point on track.
 */
function resample(samples: TelemetrySample[], axis: Axis, grid: number[]) {
  const out: Record<Channel, (number | null)[]> = { speed: [], throttle: [], brake: [], gear: [] };
  let j = 0;
  for (const x of grid) {
    while (j < samples.length - 2 && samples[j + 1][axis] < x) j++;
    const a = samples[j];
    const b = samples[j + 1];
    if (!a || !b || x < a[axis] || x > b[axis]) {
      for (const k of Object.keys(out) as Channel[]) out[k].push(null);
      continue;
    }
    const span = b[axis] - a[axis] || 1;
    const f = (x - a[axis]) / span;
    // Continuous channels interpolate; gear and brake are steps, so take the nearer sample.
    out.speed.push(Math.round(a.speed + (b.speed - a.speed) * f));
    out.throttle.push(Math.round(a.throttle + (b.throttle - a.throttle) * f));
    out.brake.push(f < 0.5 ? a.brake : b.brake);
    out.gear.push(f < 0.5 ? a.gear : b.gear);
  }
  return out;
}

function useTelemetry(sessionKey: number, driver: number | null) {
  return useQuery({
    queryKey: ["telemetry", sessionKey, driver],
    queryFn: ({ signal }) => getJson<LapTelemetry>(`/api/analysis/telemetry?session_key=${sessionKey}&driver_number=${driver}`, signal),
    enabled: driver !== null,
    staleTime: 5 * 60_000,
  });
}

function summary(t: LapTelemetry) {
  const s = t.samples;
  const n = Math.max(1, s.length);
  return {
    top: Math.max(...s.map((x) => x.speed)),
    avg: Math.round(s.reduce((a, x) => a + x.speed, 0) / n),
    fullThrottle: Math.round((s.filter((x) => x.throttle >= 98).length / n) * 100),
    braking: Math.round((s.filter((x) => x.brake > 0).length / n) * 100),
  };
}

function DriverSelect({ label, value, onChange, drivers }: { label: string; value: number | null; onChange: (n: number) => void; drivers: AnalysisDriver[] }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border bg-card px-2 py-1 text-sm"
      >
        {drivers.map((d) => (
          <option key={d.driver_number} value={d.driver_number}>
            {d.name_acronym} · {d.full_name}
          </option>
        ))}
      </select>
    </label>
  );
}

const PANELS: { key: Channel; title: string; unit: string; height: string; domain: [number, number]; ticks?: number[] }[] = [
  { key: "speed", title: "Speed", unit: "km/h", height: "h-52 sm:h-60", domain: [0, 360] },
  { key: "throttle", title: "Throttle", unit: "%", height: "h-24 sm:h-28", domain: [0, 100], ticks: [0, 50, 100] },
  { key: "brake", title: "Brake", unit: "", height: "h-16 sm:h-20", domain: [0, 100], ticks: [0, 100] },
  { key: "gear", title: "Gear", unit: "", height: "h-24 sm:h-28", domain: [0, 8], ticks: [2, 4, 6, 8] },
];

export function TelemetryCompare({ data }: { data: SessionAnalysis }) {
  const withLaps = data.drivers.filter((d) => data.fastestLaps[d.driver_number]);
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const [axis, setAxis] = useState<Axis>("d");
  // Default to the top two finishers until the user picks.
  const driverA = withLaps.find((d) => d.driver_number === a) ?? withLaps[0] ?? null;
  const driverB = withLaps.find((d) => d.driver_number === b) ?? withLaps[1] ?? null;

  const ta = useTelemetry(data.session.sessionKey, driverA?.driver_number ?? null);
  const tb = useTelemetry(data.session.sessionKey, driverB?.driver_number ?? null);

  // If both drivers are teammates (same colour), the second gets the dash.
  const sA: SeriesStyle | null = driverA ? { ...seriesStyle({ ...driverA, teamIndex: 0 }), key: "a" } : null;
  const sB: SeriesStyle | null = driverB
    ? { ...seriesStyle({ ...driverB, teamIndex: driverA?.team_name === driverB.team_name ? 1 : 0 }), key: "b" }
    : null;
  const series = [sA, sB].filter((s): s is SeriesStyle => s !== null);

  const rows = useMemo(() => {
    if (!ta.data || !tb.data) return [];
    const max = Math.min(ta.data.samples.at(-1)?.[axis] ?? 0, tb.data.samples.at(-1)?.[axis] ?? 0);
    const step = GRID_STEP[axis];
    const grid = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => Math.round(i * step * 10) / 10);
    const ra = resample(ta.data.samples, axis, grid);
    const rb = resample(tb.data.samples, axis, grid);
    return grid.map((x, i) => {
      const row: Record<string, number | null> = { x };
      for (const k of ["speed", "throttle", "brake", "gear"] as Channel[]) {
        row[`a_${k}`] = ra[k][i];
        row[`b_${k}`] = rb[k][i];
      }
      return row;
    });
  }, [ta.data, tb.data, axis]);

  const sumA = ta.data ? summary(ta.data) : null;
  const sumB = tb.data ? summary(tb.data) : null;

  const table = () => ({
    columns: ["", sA?.label ?? "A", sB?.label ?? "B"],
    rows: [
      ["Fastest lap", ta.data ? `${formatLapTime(ta.data.lapTime)} (L${ta.data.lap})` : "—", tb.data ? `${formatLapTime(tb.data.lapTime)} (L${tb.data.lap})` : "—"],
      ["Top speed (km/h)", sumA?.top ?? "—", sumB?.top ?? "—"],
      ["Average speed (km/h)", sumA?.avg ?? "—", sumB?.avg ?? "—"],
      ["Full throttle (% of lap)", sumA?.fullThrottle ?? "—", sumB?.fullThrottle ?? "—"],
      ["Braking (% of lap)", sumA?.braking ?? "—", sumB?.braking ?? "—"],
    ],
  });

  const error = ta.error ?? tb.error;
  const loading = ta.isPending || tb.isPending;
  const delta = ta.data && tb.data ? tb.data.lapTime - ta.data.lapTime : null;

  return (
    <ChartCard
      title="Driver comparison · fastest lap telemetry"
      description={
        delta !== null && sA && sB ? (
          <>
            {sA.label} {formatLapTime(ta.data!.lapTime)} vs {sB.label} {formatLapTime(tb.data!.lapTime)} ·{" "}
            {delta === 0 ? "identical" : `${delta > 0 ? sA.label : sB.label} faster by ${Math.abs(delta).toFixed(3)}s`}
          </>
        ) : (
          "Speed, throttle, brake and gear on each driver's fastest lap."
        )
      }
      legend={
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <DriverSelect label="Driver A" value={driverA?.driver_number ?? null} onChange={setA} drivers={withLaps} />
            <DriverSelect label="Driver B" value={driverB?.driver_number ?? null} onChange={setB} drivers={withLaps} />
            <div role="group" aria-label="X axis" className="flex rounded-md border p-0.5 text-xs">
              {(["d", "t"] as Axis[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setAxis(v)}
                  aria-pressed={axis === v}
                  className={axis === v ? "rounded bg-secondary px-2 py-0.5" : "px-2 py-0.5 text-muted-foreground"}
                >
                  {v === "d" ? "Distance" : "Time"}
                </button>
              ))}
            </div>
          </div>
          <Legend series={series} />
        </div>
      }
      table={table}
    >
      {withLaps.length < 1 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No timed laps in this session.</p>
      ) : error ? (
        <p className="py-12 text-center text-sm text-destructive">{error.message}</p>
      ) : loading ? (
        <div className="space-y-2">
          {PANELS.map((p) => (
            <Skeleton key={p.key} className={`w-full ${p.height}`} />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {PANELS.map((panel, i) => {
            const last = i === PANELS.length - 1;
            const fmt = (v: number) => (panel.key === "brake" ? (v > 0 ? "On" : "Off") : `${v}${panel.unit ? ` ${panel.unit}` : ""}`);
            const panelSeries = series.map((s) => ({ ...s, key: `${s.key}_${panel.key}` }));
            return (
              <div key={panel.key}>
                <div className="text-[11px] text-muted-foreground">
                  {panel.title}
                  {panel.unit && ` (${panel.unit})`}
                </div>
                <div className={panel.height}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rows} syncId="telemetry" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke={CHART.grid} vertical={false} />
                      <XAxis
                        dataKey="x"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        hide={!last}
                        tick={CHART.tick}
                        stroke={CHART.axis}
                        tickLine={false}
                        tickFormatter={(v: number) => (axis === "d" ? `${(v / 1000).toFixed(1)} km` : `${v.toFixed(0)} s`)}
                      />
                      <YAxis
                        domain={panel.domain}
                        ticks={panel.ticks}
                        tick={CHART.tick}
                        stroke={CHART.axis}
                        tickLine={false}
                        width={40}
                        tickFormatter={(v: number) => (panel.key === "brake" ? (v > 0 ? "On" : "Off") : String(v))}
                      />
                      <Tooltip
                        cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
                        content={
                          <ChartTooltip
                            series={panelSeries}
                            formatValue={fmt}
                            sort={false}
                            formatLabel={(x) => (axis === "d" ? `${x.toLocaleString()} m` : `${x.toFixed(1)} s`)}
                          />
                        }
                      />
                      {panelSeries.map((s) => (
                        <Line
                          key={s.key}
                          dataKey={s.key}
                          stroke={s.colour}
                          strokeDasharray={s.dash}
                          strokeWidth={panel.key === "speed" ? 2 : 1.5}
                          dot={false}
                          type={panel.key === "gear" || panel.key === "brake" ? "stepAfter" : "linear"}
                          isAnimationActive={false}
                          activeDot={{ r: 3, strokeWidth: 2, stroke: "var(--card)" }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}

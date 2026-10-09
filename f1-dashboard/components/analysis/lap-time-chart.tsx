"use client";

/** Lap time per lap for the selected drivers. */
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { Legend } from "@/components/charts/legend";
import { CHART, seriesStyle } from "@/components/charts/series";
import type { AnalysisDriver, SessionAnalysis } from "@/lib/analysis";
import { formatLapTime } from "@/lib/f1";

/**
 * Laps slower than this multiple of the session's fastest lap are hidden by
 * default: pit laps and safety-car laps are 20-50% slower and would squash
 * every racing lap into a flat line. It's the same idea as the 107% rule.
 */
const SLOW_LAP_FACTOR = 1.07;

export function LapTimeChart({ data, selected, dimmed }: { data: SessionAnalysis; selected: AnalysisDriver[]; dimmed: boolean }) {
  const [hideSlow, setHideSlow] = useState(true);
  const series = useMemo(() => selected.map(seriesStyle), [selected]);

  const rows = useMemo(() => {
    const fastest = Math.min(...Object.values(data.fastestLaps).map((f) => f?.time ?? Infinity));
    const limit = fastest * SLOW_LAP_FACTOR;
    const out: Record<string, number | null>[] = [];
    for (let lap = 1; lap <= data.totalLaps; lap++) out.push({ lap });
    for (const d of selected) {
      for (const p of data.laps[d.driver_number] ?? []) {
        const slow = p.pitIn || p.pitOut || (p.time != null && p.time > limit);
        const row = out[p.lap - 1];
        // `null` makes Recharts break the line instead of joining over a gap.
        if (row) row[d.driver_number] = p.time == null || (hideSlow && slow) ? null : p.time;
      }
    }
    return out;
  }, [data, selected, hideSlow]);

  // Round axis bounds and ticks to half or whole seconds so labels read "1:35.5", not "1:35.64".
  const { domain, ticks } = useMemo(() => {
    const values = rows.flatMap((r) => series.map((s) => r[s.key])).filter((v): v is number => v != null);
    if (values.length === 0) return { domain: undefined, ticks: undefined };
    const lo = Math.floor(Math.min(...values) * 2) / 2;
    const hi = Math.ceil(Math.max(...values) * 2) / 2;
    const step = hi - lo > 6 ? 2 : hi - lo > 3 ? 1 : 0.5;
    const t: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) t.push(Math.round(v * 10) / 10);
    return { domain: [lo, hi] as [number, number], ticks: t };
  }, [rows, series]);

  const table = () => ({
    columns: ["Lap", ...series.map((s) => s.label)],
    rows: rows.map((r) => [r.lap as number, ...series.map((s) => formatLapTime(r[s.key]))]),
  });

  return (
    <ChartCard
      title="Lap times"
      description={hideSlow ? "Pit laps and laps over 107% of the fastest lap are hidden." : "All laps."}
      legend={<Legend series={series} />}
      dimmed={dimmed}
      table={table}
      controls={
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={hideSlow} onChange={(e) => setHideSlow(e.target.checked)} className="accent-primary" />
          Hide slow laps
        </label>
      }
    >
      {selected.length === 0 ? (
        <EmptyChart />
      ) : (
        <div className="h-72 sm:h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="lap" type="number" domain={[1, data.totalLaps]} tick={CHART.tick} stroke={CHART.axis} tickLine={false} />
              <YAxis
                domain={domain ?? ["auto", "auto"]}
                ticks={ticks}
                interval={0}
                // 95.5 → "1:35.5": drop the last two of the three decimals.
                tickFormatter={(v: number) => formatLapTime(v).slice(0, -2)}
                tick={CHART.tick}
                stroke={CHART.axis}
                tickLine={false}
                width={56}
              />
              <Tooltip
                cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
                content={<ChartTooltip series={series} formatValue={formatLapTime} />}
              />
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
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

export function EmptyChart({ message = "Pick at least one driver above." }: { message?: string }) {
  return <p className="py-12 text-center text-sm text-muted-foreground">{message}</p>;
}

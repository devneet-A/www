"use client";

/**
 * Shared chart for "one value per driver per lap" data: the position chart
 * (race trace) and the gap-to-leader chart.
 *
 * With `showOthers`, every driver is drawn: selected ones in team colours,
 * the rest as faint grey context lines (the "emphasis" pattern: highlight
 * the story, keep the field visible). Selected lines get their driver code
 * at the end of the line as a direct label.
 */
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { Legend } from "@/components/charts/legend";
import { CHART, seriesStyle, type SeriesStyle } from "@/components/charts/series";
import type { AnalysisDriver } from "@/lib/analysis";
import { EmptyChart } from "./lap-time-chart";

interface Props {
  title: string;
  description: string;
  values: Record<number, (number | null)[]>;
  totalLaps: number;
  allDrivers: AnalysisDriver[];
  selected: AnalysisDriver[];
  showOthers?: boolean;
  /** Lap 0 holds meaningful data (the grid) for positions. */
  fromLap: number;
  reversed: boolean;
  yDomain?: [number | "auto", number | "auto"];
  yTicks?: number[];
  formatValue: (v: number) => string;
  /** Axis tick labels; defaults to formatValue. */
  formatTick?: (v: number) => string;
  dimmed: boolean;
}

export function RaceTraceChart(props: Props) {
  const { values, totalLaps, allDrivers, selected, showOthers = false, fromLap, formatValue } = props;
  const series = useMemo(() => selected.map(seriesStyle), [selected]);
  const selectedKeys = new Set(series.map((s) => s.key));
  const others: SeriesStyle[] = showOthers
    ? allDrivers.filter((d) => !selectedKeys.has(String(d.driver_number))).map((d) => ({ ...seriesStyle(d), colour: CHART.muted, dash: undefined }))
    : [];

  const rows = useMemo(() => {
    const out: Record<string, number | null>[] = [];
    for (let lap = fromLap; lap <= totalLaps; lap++) {
      const row: Record<string, number | null> = { lap };
      for (const [n, arr] of Object.entries(values)) row[n] = arr[lap] ?? null;
      out.push(row);
    }
    return out;
  }, [values, totalLaps, fromLap]);

  // Index of each selected driver's last value, where its end label goes.
  const lastIndex = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of series) {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i][s.key] != null) {
          map.set(s.key, i);
          break;
        }
      }
    }
    return map;
  }, [rows, series]);

  const table = () => ({
    columns: ["Lap", ...series.map((s) => s.label)],
    rows: rows.map((r) => [r.lap === 0 ? "Grid" : (r.lap as number), ...series.map((s) => (r[s.key] == null ? "—" : formatValue(r[s.key]!)))]),
  });

  if (Object.keys(values).length === 0) {
    return (
      <ChartCard title={props.title} description={props.description} table={table} dimmed={props.dimmed}>
        <EmptyChart message="Only available for races and sprints." />
      </ChartCard>
    );
  }

  return (
    <ChartCard title={props.title} description={props.description} legend={<Legend series={series} />} table={table} dimmed={props.dimmed}>
      {series.length === 0 && !showOthers ? (
        <EmptyChart />
      ) : (
        <div className="h-72 sm:h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 40, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis
                dataKey="lap"
                type="number"
                domain={[fromLap, totalLaps]}
                tick={CHART.tick}
                stroke={CHART.axis}
                tickLine={false}
                tickFormatter={(v: number) => (v === 0 ? "Grid" : String(v))}
              />
              <YAxis
                reversed={props.reversed}
                domain={props.yDomain ?? ["auto", "auto"]}
                ticks={props.yTicks}
                interval={0}
                tickFormatter={(v: number) => (props.formatTick ?? formatValue)(v)}
                tick={CHART.tick}
                stroke={CHART.axis}
                tickLine={false}
                width={44}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
                content={
                  <ChartTooltip series={series} formatValue={formatValue} formatLabel={(x) => (x === 0 ? "Grid" : `Lap ${x}`)} />
                }
              />
              {/* Context lines first, so the selected drivers draw on top. */}
              {others.map((s) => (
                <Line key={s.key} dataKey={s.key} stroke={s.colour} strokeWidth={1} dot={false} activeDot={false} isAnimationActive={false} />
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
                  label={(p: { index?: number; x?: number | string; y?: number | string }) =>
                    p.index === lastIndex.get(s.key) ? (
                      // Text uses the foreground colour, not the series colour.
                      <text key={s.key} x={Number(p.x) + 6} y={Number(p.y)} dy={4} fontSize={11} fontWeight={600} fill="var(--foreground)">
                        {s.label}
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

"use client";

/**
 * Tooltip content for Recharts line charts: one row per series at the
 * hovered lap, value first (strong) and driver code second, keyed by a
 * short line in the series colour. Recharts passes `payload` and `label`.
 */
import { LineKey } from "./legend";
import type { SeriesStyle } from "./series";

interface Props {
  active?: boolean;
  label?: number | string;
  payload?: { dataKey?: string | number; value?: number | string | null }[];
  series: SeriesStyle[];
  formatValue: (v: number) => string;
  /** Heading of the tooltip, from the x value. Defaults to "Lap N". */
  formatLabel?: (x: number) => string;
  /** Row order: "asc" for lap times/positions/gaps, "desc" for points, false to keep series order. */
  sort?: "asc" | "desc" | false;
}

export function ChartTooltip({ active, label, payload, series, formatValue, formatLabel = (x) => `Lap ${x}`, sort = "asc" }: Props) {
  if (!active || !payload?.length) return null;
  const byKey = new Map(series.map((s) => [s.key, s]));
  const rows = payload
    .filter((p) => typeof p.value === "number" && byKey.has(String(p.dataKey)))
    .map((p) => ({ s: byKey.get(String(p.dataKey))!, v: p.value as number }));
  if (sort) rows.sort((a, b) => (sort === "asc" ? a.v - b.v : b.v - a.v));
  if (rows.length === 0) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-popover/95 px-3 py-2 text-xs shadow-xl shadow-black/40 backdrop-blur">
      <div className="mb-1 text-muted-foreground">{formatLabel(Number(label))}</div>
      <ul className="space-y-0.5">
        {rows.slice(0, 12).map(({ s, v }) => (
          <li key={s.key} className="flex items-center gap-2">
            <LineKey s={s} width={14} />
            <span className="min-w-14 font-mono font-semibold tabular-nums">{formatValue(v)}</span>
            <span className="text-muted-foreground">{s.label}</span>
          </li>
        ))}
        {rows.length > 12 && <li className="text-muted-foreground">+{rows.length - 12} more</li>}
      </ul>
    </div>
  );
}

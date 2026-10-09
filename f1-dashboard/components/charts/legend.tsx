import type { SeriesStyle } from "./series";

/** A short line in the series colour (and dash), used in legends and tooltips. */
export function LineKey({ s, width = 18 }: { s: Pick<SeriesStyle, "colour" | "dash">; width?: number }) {
  return (
    <svg width={width} height="8" aria-hidden className="shrink-0">
      <line x1="1" y1="4" x2={width - 1} y2="4" stroke={s.colour} strokeWidth="2" strokeDasharray={s.dash} strokeLinecap="round" />
    </svg>
  );
}

/** Legend row above a chart. Text stays in text colours; the key carries identity. */
export function Legend({ series }: { series: SeriesStyle[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <LineKey s={s} />
          <span className="font-medium text-foreground">{s.label}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * How a driver's line looks in every chart: team colour, and a dashed line
 * for the team's second driver. Teammates share a colour, and some team
 * colours are close to each other, so the dash (plus legend and direct
 * labels) keeps identity from depending on colour alone.
 */
import { teamColour } from "@/lib/f1";

export interface SeriesDriver {
  driver_number: number;
  name_acronym: string;
  team_colour: string | null;
  teamIndex: number;
}

export interface SeriesStyle {
  key: string; // dataKey in chart rows
  label: string; // driver code
  colour: string;
  dash?: string; // SVG strokeDasharray
}

export function seriesStyle(d: SeriesDriver): SeriesStyle {
  return {
    key: String(d.driver_number),
    label: d.name_acronym,
    colour: teamColour(d.team_colour),
    dash: d.teamIndex > 0 ? "6 4" : undefined,
  };
}

/** Shared chart chrome: recessive hairline grid, muted axis text. */
export const CHART = {
  grid: "rgba(255,255,255,0.08)",
  axis: "rgba(255,255,255,0.18)",
  tick: { fill: "oklch(0.7 0.01 270)", fontSize: 11 },
  muted: "rgba(160,160,175,0.35)",
} as const;

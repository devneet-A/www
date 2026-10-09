"use client";

/**
 * The timing tower: one row per car, ordered by position.
 * Uses a fixed-layout table with fixed row heights so nothing shifts when
 * numbers change every few seconds.
 */
import { TeamBar } from "@/components/f1/team-bar";
import { TyreBadge } from "@/components/f1/tyre-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLapTime } from "@/lib/f1";
import type { TowerRow } from "@/lib/timing";
import { cn } from "@/lib/utils";

/** TV-graphics colours for lap times: purple = fastest overall, green = personal best. */
function lapColour(row: TowerRow) {
  if (row.lastLapIsOverallBest) return "text-purple-400";
  if (row.lastLapIsPersonalBest) return "text-emerald-400";
  return "";
}

// Table text is 11px on narrow phones so a 7-character gap ("+14.126") fits its column.
const ROW = "h-8 border-b border-border/50 last:border-0";
const NUM = "text-right font-mono tabular-nums";

export function TimingTowerSkeleton({ rows = 20 }: { rows?: number }) {
  return (
    <div className="space-y-1.5" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-6.5 w-full" />
      ))}
    </div>
  );
}

export function TimingTower({
  rows,
  isRace,
  currentLap,
  status,
}: {
  rows: TowerRow[];
  isRace: boolean;
  currentLap: number | null;
  /** Small text in the header, e.g. "Live · updated 2s ago". */
  status: React.ReactNode;
}) {
  // The session's fastest lap, highlighted purple in the Best column.
  const fastest = Math.min(...rows.map((r) => r.bestLap ?? Infinity));
  return (
    <Card className="gap-2">
      <CardHeader>
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle>
            Timing{isRace && currentLap ? <span className="ml-2 text-muted-foreground">Lap {currentLap}</span> : null}
          </CardTitle>
          <div className="text-xs text-muted-foreground">{status}</div>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-4">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No timing data for this session yet.</p>
        ) : (
          <table className="w-full table-fixed text-[11px] min-[400px]:text-xs sm:text-sm">
            <colgroup>
              <col className="w-7" />
              <col className="w-14 sm:w-20" />
              <col />
              <col />
              <col className="w-[4.6rem] sm:w-24" />
              <col className="hidden sm:table-column sm:w-24" />
              <col className="w-11 sm:w-14" />
              <col className="w-6 sm:w-9" />
            </colgroup>
            <thead>
              <tr className="h-7 text-[10px] tracking-wider text-muted-foreground uppercase sm:text-xs">
                <th className="text-left font-medium">P</th>
                <th className="text-left font-medium">Driver</th>
                <th className={cn(NUM, "font-medium")}>Gap</th>
                <th className={cn(NUM, "font-medium")}>Int</th>
                <th className={cn(NUM, "font-medium")}>Last</th>
                <th className={cn(NUM, "hidden font-medium sm:table-cell")}>Best</th>
                <th className="text-center font-medium">Tyre</th>
                <th className={cn(NUM, "font-medium")} title="Pit stops">
                  Pit
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.driverNumber} className={ROW} title={`${row.fullName}${row.teamName ? ` · ${row.teamName}` : ""}`}>
                  <td className="font-mono font-semibold tabular-nums">{row.position ?? "–"}</td>
                  <td>
                    <span className="flex items-center gap-1.5">
                      <TeamBar colour={row.teamColour} />
                      <span className="font-semibold tracking-wide">{row.code}</span>
                    </span>
                  </td>
                  <td className={cn(NUM, "truncate")}>{row.position === 1 ? <Leader isRace={isRace} /> : row.gap}</td>
                  <td className={cn(NUM, "truncate text-muted-foreground")}>{row.interval}</td>
                  <td className={cn(NUM, lapColour(row))}>{formatLapTime(row.lastLap)}</td>
                  <td className={cn(NUM, "hidden sm:table-cell", row.bestLap != null && row.bestLap === fastest && "text-purple-400")}>
                    {formatLapTime(row.bestLap)}
                  </td>
                  <td>
                    <span className="flex items-center justify-center gap-1">
                      <TyreBadge compound={row.compound} className="size-4.5 text-[9px] sm:size-5 sm:text-[10px]" />
                      <span className="w-4 font-mono text-[11px] text-muted-foreground tabular-nums">{row.tyreAge ?? ""}</span>
                    </span>
                  </td>
                  <td className={NUM}>{row.pitStops || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function Leader({ isRace }: { isRace: boolean }) {
  return <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{isRace ? "Leader" : "Fastest"}</span>;
}

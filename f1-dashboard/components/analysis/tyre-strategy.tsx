"use client";

/**
 * Tyre strategy: one horizontal bar per driver (finishing order), split
 * into stints coloured by compound. Built with plain HTML rather than
 * Recharts because each driver has a different number of stints, which
 * doesn't map to a stacked bar chart's fixed series.
 *
 * Every driver is shown; drivers not in the selection are faded so the
 * selection still "scopes" the view without hiding the field.
 */
import { useState } from "react";
import { ChartCard } from "@/components/charts/chart-card";
import { TeamBar } from "@/components/f1/team-bar";
import type { AnalysisDriver, SessionAnalysis, StintBar } from "@/lib/analysis";
import { COMPOUNDS, compoundInfo } from "@/lib/f1";
import { cn } from "@/lib/utils";

/** Light tyres (hard, medium) need dark text inside the bar; dark ones need white. */
const DARK_TEXT = new Set(["HARD", "MEDIUM"]);

function describe(d: AnalysisDriver, s: StintBar) {
  const laps = s.lapEnd - s.lapStart + 1;
  const age = s.ageAtStart ? ` · ${s.ageAtStart} laps old when fitted` : " · new";
  return `${d.name_acronym} · stint ${s.stint} · ${compoundInfo(s.compound).label} · laps ${s.lapStart}–${s.lapEnd} (${laps})${age}`;
}

export function TyreStrategy({ data, selected, dimmed }: { data: SessionAnalysis; selected: AnalysisDriver[]; dimmed: boolean }) {
  const [hover, setHover] = useState<string | null>(null);
  const selectedSet = new Set(selected.map((d) => d.driver_number));
  const total = Math.max(1, data.totalLaps);
  const byDriver = new Map<number, StintBar[]>();
  for (const s of data.stints) byDriver.set(s.driver, [...(byDriver.get(s.driver) ?? []), s]);
  const drivers = data.drivers.filter((d) => byDriver.has(d.driver_number));

  const table = () => ({
    columns: ["Driver", "Stints"],
    rows: drivers.map((d) => [
      d.name_acronym,
      (byDriver.get(d.driver_number) ?? [])
        .sort((a, b) => a.stint - b.stint)
        .map((s) => `${compoundInfo(s.compound).letter} ${s.lapStart}–${s.lapEnd}`)
        .join("  ·  "),
    ]),
  });

  const ticks = Array.from({ length: Math.floor(total / 10) + 1 }, (_, i) => i * 10).filter((t) => t <= total);
  const usedCompounds = Object.entries(COMPOUNDS).filter(([key]) => data.stints.some((s) => s.compound === key));

  return (
    <ChartCard
      title="Tyre strategy"
      description="Every driver in finishing order. Hover or tap a stint for details."
      table={table}
      dimmed={dimmed}
      legend={
        <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {usedCompounds.map(([key, c]) => (
            <li key={key} className="flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: c.colour }} />
              {c.label}
            </li>
          ))}
        </ul>
      }
    >
      {drivers.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No tyre data for this session.</p>
      ) : (
        <div>
          {/* Fixed-height readout instead of a floating tooltip: works with touch and never jumps. */}
          <p className="mb-2 h-5 truncate text-xs text-muted-foreground" aria-live="polite">
            {hover ?? " "}
          </p>
          <ol className="space-y-1">
            {drivers.map((d) => (
              <li
                key={d.driver_number}
                className={cn("flex items-center gap-2 transition-opacity", selectedSet.size > 0 && !selectedSet.has(d.driver_number) && "opacity-40")}
              >
                <span className="flex w-12 shrink-0 items-center gap-1.5 text-xs font-semibold">
                  <TeamBar colour={d.team_colour} />
                  {d.name_acronym}
                </span>
                <div className="relative h-5 flex-1">
                  {(byDriver.get(d.driver_number) ?? []).map((s) => {
                    const info = compoundInfo(s.compound);
                    const left = ((s.lapStart - 1) / total) * 100;
                    const width = ((s.lapEnd - s.lapStart + 1) / total) * 100;
                    const text = describe(d, s);
                    return (
                      <button
                        key={s.stint}
                        type="button"
                        aria-label={text}
                        onMouseEnter={() => setHover(text)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover(text)}
                        onBlur={() => setHover(null)}
                        onClick={() => setHover(text)}
                        // calc(... - 2px): the 2px gap in the card colour between stints.
                        className="absolute top-0 flex h-full items-center justify-center overflow-visible rounded-[4px] text-[10px] font-bold outline-offset-1 hover:brightness-110 focus-visible:outline-2"
                        style={{
                          left: `${left}%`,
                          width: `calc(${width}% - 2px)`,
                          backgroundColor: info.colour,
                          color: DARK_TEXT.has(s.compound ?? "") ? "#111" : "#fff",
                        }}
                      >
                        {/* Only label stints wide enough to fit the text; the rest use the readout. */}
                        {width >= 12 ? `${info.letter} ${s.lapEnd - s.lapStart + 1}` : ""}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ol>
          {/* Lap axis */}
          <div className="relative mt-1 ml-14 h-4 text-[10px] text-muted-foreground">
            {ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${(t / total) * 100}%` }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

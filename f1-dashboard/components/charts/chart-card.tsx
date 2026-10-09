"use client";

/**
 * Frame for every chart: title, subtitle, legend, and a Chart / Table
 * toggle. The table view is the accessible equivalent of the chart
 * (screen readers, colour-vision deficiency, or just reading exact numbers).
 */
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pillGroup, pillItem } from "@/components/ui/pill";
import { cn } from "@/lib/utils";

export interface TableData {
  columns: string[];
  rows: (string | number)[][];
}

export function DataTable({ data }: { data: TableData }) {
  return (
    <div className="max-h-80 overflow-auto rounded-2xl border border-white/[0.07]">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card">
          <tr>
            {data.columns.map((c, i) => (
              <th key={i} className={cn("px-2 py-1.5 font-medium whitespace-nowrap text-muted-foreground", i === 0 ? "text-left" : "text-right")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, r) => (
            <tr key={r} className="border-t border-border/50">
              {row.map((cell, i) => (
                <td key={i} className={cn("px-2 py-1 whitespace-nowrap tabular-nums", i === 0 ? "text-left font-medium" : "text-right font-mono")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartCard({
  title,
  description,
  legend,
  controls,
  table,
  dimmed = false,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  legend?: React.ReactNode;
  /** Extra controls in the header (e.g. a "hide slow laps" switch). */
  controls?: React.ReactNode;
  /** Built lazily: only computed when the table view is opened. */
  table: () => TableData;
  /** True while new data loads: keep the old chart, faded, instead of a skeleton flash. */
  dimmed?: boolean;
  children: React.ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <Card className="gap-3">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription className="mt-1">{description}</CardDescription>}
          </div>
          <div className="flex items-center gap-2">
            {controls}
            <div role="group" aria-label="View" className={pillGroup("sm")}>
              {(["chart", "table"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={pillItem(view === v, "neutral", "sm")}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
        {legend && <div className="mt-2">{legend}</div>}
      </CardHeader>
      <CardContent className={cn("transition-opacity", dimmed && "opacity-50")}>
        {view === "chart" ? children : <DataTable data={table()} />}
      </CardContent>
    </Card>
  );
}

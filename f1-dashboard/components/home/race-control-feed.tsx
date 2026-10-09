"use client";

/**
 * Race control messages (flags, safety car, penalties, track limits),
 * newest first, in a fixed-height scrolling box so new messages never push
 * the rest of the page around.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RaceControlItem } from "@/lib/timing";
import { cn } from "@/lib/utils";

/** Chip style for a message: flag colour first, then category. */
function chip(m: RaceControlItem): { label: string; className: string } {
  const flag = m.flag?.toUpperCase();
  switch (flag) {
    case "GREEN":
    case "CLEAR":
      return { label: flag === "CLEAR" ? "CLEAR" : "GREEN", className: "bg-emerald-600 text-white" };
    case "YELLOW":
      return { label: "YELLOW", className: "bg-yellow-400 text-black" };
    case "DOUBLE YELLOW":
      return { label: "DBL YEL", className: "bg-yellow-400 text-black" };
    case "RED":
      return { label: "RED", className: "bg-red-600 text-white" };
    case "BLUE":
      return { label: "BLUE", className: "bg-blue-600 text-white" };
    case "CHEQUERED":
      return {
        label: "CHQ",
        // A small checkerboard via a CSS conic gradient.
        className: "bg-[repeating-conic-gradient(#fff_0_25%,#111_0_50%)] bg-[length:8px_8px] text-transparent",
      };
    case "BLACK AND WHITE":
      return { label: "B/W", className: "bg-neutral-200 text-black" };
  }
  if (m.category === "SafetyCar") {
    return { label: /VIRTUAL/i.test(m.message) ? "VSC" : "SC", className: "bg-orange-500 text-black" };
  }
  if (/PENALTY|INVESTIGATION|NOTED/i.test(m.message)) return { label: "STEWARDS", className: "bg-purple-600 text-white" };
  if (m.category === "Drs") return { label: "DRS", className: "bg-secondary text-secondary-foreground" };
  return { label: m.category.toUpperCase().slice(0, 8), className: "bg-secondary text-secondary-foreground" };
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

export function RaceControlFeed({ messages }: { messages: RaceControlItem[] }) {
  return (
    <Card className="gap-2">
      <CardHeader>
        <CardTitle>Race control</CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          <ol className="h-80 space-y-1 overflow-y-auto overscroll-contain pr-1 lg:h-[26rem]" aria-label="Race control messages, newest first">
            {messages.map((m) => {
              const c = chip(m);
              return (
                <li key={`${m.date}|${m.message}`} className="flex gap-2 rounded-xl px-1.5 py-1.5 text-xs hover:bg-muted/50 sm:text-sm">
                  <span className={cn("mt-0.5 h-4.5 min-w-12 shrink-0 rounded-full px-1.5 text-center text-[10px] leading-[1.125rem] font-bold", c.className)}>
                    {c.label}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] text-muted-foreground tabular-nums">
                      {timeFmt.format(new Date(m.date))}
                      {m.lap_number ? ` · Lap ${m.lap_number}` : ""}
                    </span>
                    <span className="break-words">{m.message}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

import { countdownParts } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "02d 14h 05m 33s" countdown to `target`. `now` comes from useNow() so all countdowns tick together. */
export function Countdown({ target, now, size = "lg" }: { target: string; now: number; size?: "lg" | "md" }) {
  const { days, hours, minutes, seconds } = countdownParts(Date.parse(target) - now);
  const parts: [number, string][] = [
    [days, "d"],
    [hours, "h"],
    [minutes, "m"],
    [seconds, "s"],
  ];
  return (
    // aria-live off: a screen reader announcing every second would be unbearable.
    <div className="flex items-baseline gap-2 font-mono" aria-live="off">
      {parts.map(([value, unit]) => (
        <span key={unit} className="flex items-baseline">
          <span className={cn("font-bold tabular-nums", size === "lg" ? "text-3xl sm:text-4xl" : "text-2xl")}>{String(value).padStart(2, "0")}</span>
          <span className="ml-0.5 text-sm text-muted-foreground">{unit}</span>
        </span>
      ))}
    </div>
  );
}

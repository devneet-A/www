/**
 * Shared "pill" styles for controls, so every select, segmented toggle and
 * button across the app has the same floating, fully rounded look.
 */
import { cn } from "@/lib/utils";

/** Native <select> as a pill (chevron comes from .pill-select in globals.css). */
export const pillSelect =
  "pill-select h-9 min-w-0 rounded-full border border-white/10 bg-card/80 pl-3.5 text-sm font-semibold shadow-sm shadow-black/20 backdrop-blur transition-colors hover:border-white/20 focus-visible:outline-2 disabled:opacity-50";

/** Container for a segmented control (e.g. Drivers | Constructors). */
export const pillGroup = (size: "md" | "sm" = "md") =>
  cn(
    "inline-flex items-center rounded-full border border-white/10 bg-card/80 shadow-sm shadow-black/20 backdrop-blur",
    size === "md" ? "p-1 text-sm" : "p-0.5 text-xs",
  );

/**
 * One option inside a pillGroup. "primary" fills the active option in F1 red
 * (main page tabs); "neutral" uses a quieter fill (small toggles inside cards).
 */
export const pillItem = (active: boolean, tone: "primary" | "neutral" = "primary", size: "md" | "sm" = "md") =>
  cn(
    "rounded-full font-semibold capitalize transition-colors",
    size === "md" ? "px-3.5 py-1" : "px-2.5 py-0.5",
    active
      ? tone === "primary"
        ? "bg-primary text-primary-foreground shadow shadow-primary/30"
        : "bg-white/12 text-foreground"
      : "text-muted-foreground hover:text-foreground",
  );

/** Standalone pill button (Retry, Top 5, All...). */
export const pillButton = (size: "md" | "sm" = "md") =>
  cn(
    "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-card/80 font-semibold shadow-sm shadow-black/20 backdrop-blur transition-colors hover:border-white/25 hover:bg-white/5 disabled:opacity-50",
    size === "md" ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-0.5 text-xs",
  );

/**
 * Small F1-specific helpers shared by the server and the browser:
 * team colours, tyre compounds and time formatting.
 */

/** Neutral grey for drivers whose team colour is missing (e.g. reserve drivers). */
const FALLBACK_TEAM_COLOUR = "#7a7a85";

/** OpenF1's team_colour is hex WITHOUT '#' ("3671C6"). Returns a CSS colour. */
export function teamColour(hex: string | null | undefined): string {
  return hex && /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : FALLBACK_TEAM_COLOUR;
}

/**
 * Tyre compound display info. Colours follow Pirelli's sidewall colours
 * (used by the TV graphics), so fans recognise them instantly.
 */
export const COMPOUNDS: Record<string, { letter: string; colour: string; label: string }> = {
  SOFT: { letter: "S", colour: "#e8002d", label: "Soft" },
  MEDIUM: { letter: "M", colour: "#ffd12e", label: "Medium" },
  HARD: { letter: "H", colour: "#f0f0ec", label: "Hard" },
  INTERMEDIATE: { letter: "I", colour: "#43b02a", label: "Intermediate" },
  WET: { letter: "W", colour: "#0067ad", label: "Wet" },
};

export function compoundInfo(compound: string | null | undefined) {
  return (compound && COMPOUNDS[compound.toUpperCase()]) || { letter: "?", colour: "#6b6b75", label: "Unknown" };
}

/** 91.743 → "1:31.743"; 59.1 → "59.100". null → "—". */
export function formatLapTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = (seconds - minutes * 60).toFixed(3).padStart(6, "0");
  return minutes > 0 ? `${minutes}:${rest}` : (seconds).toFixed(3);
}

/**
 * Gap/interval display. OpenF1 sends seconds as a number, or a string such
 * as "+1 LAP" for lapped cars, or null for the leader.
 */
export function formatGap(value: number | string | null | undefined): string {
  if (value == null) return "";
  if (typeof value === "string") return value.replace(/^\+?/, "+").replace(/LAPS?/, (m) => m.toLowerCase());
  // Big gaps don't need milliseconds, and the shorter text fits phone columns.
  return `+${value.toFixed(Math.abs(value) >= 100 ? 1 : 3)}`;
}

/** True for sessions that have a race order with gaps (intervals endpoint). */
export function isRaceSession(sessionName: string): boolean {
  return /^(race|sprint)$/i.test(sessionName);
}

/**
 * Date/time formatting helpers. All upstream times are UTC; we format them
 * for three audiences: the viewer's own timezone, IST, and the track.
 */

export const IST = "Asia/Kolkata";

/** "Sat 11 Oct, 17:30" in the given IANA timezone (default: the viewer's). */
export function formatDateTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** "17:30" in the given timezone. */
export function formatTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(undefined, { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso),
  );
}

/** Short name of the viewer's timezone, e.g. "GMT+1" or "PDT". */
export function localZoneName(): string {
  const part = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "Local";
}

/**
 * Convert OpenF1's gmt_offset ("08:00:00", "-05:00:00", "05:30:00") to minutes.
 */
export function gmtOffsetMinutes(offset: string): number {
  const negative = offset.startsWith("-");
  const [h = "0", m = "0"] = offset.replace(/^[-+]/, "").split(":");
  const minutes = Number(h) * 60 + Number(m);
  return negative ? -minutes : minutes;
}

/**
 * Track-local time. We only know the track's UTC offset (not its IANA zone),
 * so we shift the timestamp by the offset and format it as UTC.
 */
export function formatTrackTime(iso: string, gmtOffset: string): string {
  const shifted = new Date(Date.parse(iso) + gmtOffsetMinutes(gmtOffset) * 60_000);
  return formatTime(shifted.toISOString(), "UTC");
}

/** "UTC+8" / "UTC-5" / "UTC+5:30" label for a gmt_offset. */
export function gmtOffsetLabel(offset: string): string {
  const total = gmtOffsetMinutes(offset);
  const sign = total < 0 ? "-" : "+";
  const h = Math.floor(Math.abs(total) / 60);
  const m = Math.abs(total) % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** Split a duration into countdown parts. Negative durations clamp to zero. */
export function countdownParts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

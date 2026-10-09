/**
 * Types for the /analysis page, shared by the server (which builds them)
 * and the browser (which charts them). Kept compact: one array per driver
 * indexed by lap number, rather than one object per lap per driver.
 */
import type { TimingDriver } from "./timing";

/** /api/analysis/sessions?year= — the selector's data. */
export interface AnalysisMeeting {
  meetingKey: number;
  name: string; // "Singapore Grand Prix"
  dateStart: string;
  sessions: { sessionKey: number; name: string; dateStart: string; completed: boolean }[];
}

export interface AnalysisDriver extends TimingDriver {
  /** Final classification position (from the last lap order), for sorting. */
  finish: number | null;
  /** 0 for the first driver of a team in finishing order, 1 for the second... Used for dashed lines. */
  teamIndex: number;
}

export interface LapPoint {
  lap: number;
  /** Seconds; null when the lap has no valid time. */
  time: number | null;
  pitOut: boolean;
  pitIn: boolean;
}

export interface StintBar {
  driver: number;
  stint: number;
  compound: string | null;
  lapStart: number;
  lapEnd: number;
  ageAtStart: number | null;
}

/** /api/analysis/session?session_key= */
export interface SessionAnalysis {
  session: { sessionKey: number; name: string; meetingName: string; year: number; isRace: boolean; completed: boolean };
  /** Sorted by finishing position. */
  drivers: AnalysisDriver[];
  totalLaps: number;
  laps: Record<number, LapPoint[]>;
  /** positions[driver][lap]: lap 0 is the grid; null when not classified on that lap. */
  positions: Record<number, (number | null)[]>;
  /** gaps[driver][lap]: seconds behind the first car to finish that lap. */
  gaps: Record<number, (number | null)[]>;
  stints: StintBar[];
  /** Each driver's fastest lap, used to pick the telemetry window. */
  fastestLaps: Record<number, { lap: number; time: number } | undefined>;
}

/** One telemetry sample on a driver's fastest lap. */
export interface TelemetrySample {
  /** Seconds since the lap started. */
  t: number;
  /** Metres since the lap started (integrated from speed). */
  d: number;
  speed: number;
  throttle: number;
  brake: number;
  gear: number;
}

/** /api/analysis/telemetry?session_key=&driver_number= */
export interface LapTelemetry {
  driverNumber: number;
  lap: number;
  lapTime: number;
  samples: TelemetrySample[];
}

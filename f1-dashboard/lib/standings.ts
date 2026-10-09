/**
 * Types for the /standings and /calendar pages, shared by the server
 * (which builds them from Jolpica + OpenF1 colours) and the browser.
 */

export interface DriverRow {
  position: number | null;
  driverId: string; // Jolpica id, e.g. "max_verstappen"
  code: string; // "VER"
  name: string; // "Max Verstappen"
  nationality: string;
  team: string; // current (last) constructor name
  teamColour: string | null; // hex without '#', from OpenF1
  points: number;
  wins: number;
}

export interface ConstructorRow {
  position: number | null;
  constructorId: string;
  name: string;
  nationality: string;
  teamColour: string | null;
  points: number;
  wins: number;
}

export interface RoundInfo {
  round: number;
  name: string; // "Monaco Grand Prix"
  country: string;
}

/** Cumulative points after each round, aligned with `rounds`. */
export type Progression = Record<string, number[]>;

/** /api/standings?year= */
export interface StandingsPayload {
  season: number;
  /** Round the standings are "after", or null before the first race. */
  round: number | null;
  drivers: DriverRow[];
  constructors: ConstructorRow[];
  rounds: RoundInfo[];
  /** Keyed by driverId / constructorId. */
  driverProgression: Progression;
  constructorProgression: Progression;
}

export interface CalendarSession {
  name: string; // "Practice 1", "Sprint", "Race"...
  start: string; // ISO UTC
}

export interface CalendarRace {
  round: number;
  name: string;
  circuit: string;
  locality: string;
  country: string;
  sprint: boolean;
  sessions: CalendarSession[]; // sorted by start; the last one is the race
  /** Winner's code and name, once the race has a result. */
  winner: { code: string; name: string; teamColour: string | null } | null;
}

/** /api/calendar?year= */
export interface CalendarPayload {
  season: number;
  races: CalendarRace[];
}

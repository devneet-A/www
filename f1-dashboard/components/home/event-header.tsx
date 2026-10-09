"use client";

/**
 * Home page header: the current or next Grand Prix, a LIVE badge, a
 * countdown to the next session, its time in your timezone / IST / at the
 * track, and the weekend's schedule.
 */
import Image from "next/image";
import { useState } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Countdown } from "@/components/f1/countdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSessionState } from "@/hooks/use-session-state";
import {
  IST,
  formatDateTime,
  formatTime,
  formatTrackTime,
  gmtOffsetLabel,
  localZoneName,
} from "@/lib/format";
import { isCompleted, isLive, type HeaderSession, type SessionState } from "@/lib/session-state";
import { cn } from "@/lib/utils";

/** Compact labels for the schedule strip. */
function shortName(name: string): string {
  const map: Record<string, string> = {
    "Practice 1": "FP1",
    "Practice 2": "FP2",
    "Practice 3": "FP3",
    "Sprint Qualifying": "SQ",
    "Sprint Shootout": "SQ",
    Sprint: "SPR",
    Qualifying: "Q",
    Race: "RACE",
  };
  return map[name] ?? name;
}

/**
 * Country flag that quietly disappears if the image fails to load.
 * `unoptimized` serves the tiny flag straight from formula1.com instead of
 * spending Vercel's free-tier image-optimisation quota on it.
 */
function Flag({ src, country }: { src: string; country: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Image
      src={src}
      alt={`${country} flag`}
      width={40}
      height={24}
      unoptimized
      onError={() => setFailed(true)}
      className="h-6 w-10 shrink-0 rounded-sm object-cover"
    />
  );
}

export function LiveBadge() {
  return (
    <Badge className="gap-1.5 bg-primary px-2.5 text-primary-foreground">
      {/* Pulsing dot: the ping layer animates, the solid dot stays put. */}
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-white" />
      </span>
      LIVE
    </Badge>
  );
}

/** "Your time / IST / Track" lines for one session start. */
function SessionTimes({ session }: { session: HeaderSession }) {
  const rows: [string, string][] = [
    [`Your time (${localZoneName()})`, formatDateTime(session.start)],
    ["India (IST)", formatDateTime(session.start, IST)],
  ];
  if (session.gmtOffset) {
    rows.push([`Track (${gmtOffsetLabel(session.gmtOffset)})`, formatTrackTime(session.start, session.gmtOffset)]);
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function WeekendSchedule({ sessions, now }: { sessions: HeaderSession[]; now: number }) {
  if (sessions.length === 0) return null;
  return (
    // Horizontal scroll on narrow phones instead of wrapping into a messy grid.
    <ol className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {sessions.map((s) => {
        const live = isLive(s, now);
        const done = !live && isCompleted(s, now);
        return (
          <li
            key={s.id}
            className={cn(
              "min-w-[4.5rem] shrink-0 rounded-md border px-2.5 py-1.5 text-center",
              live && "border-primary bg-primary/15",
              done && "opacity-50",
            )}
          >
            <div className="text-xs font-bold">{shortName(s.name)}</div>
            <div className="text-[11px] text-muted-foreground">
              {new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(s.start))} {formatTime(s.start)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Explains whose data the rest of the page shows, and why. */
function DataSourceNote({ state }: { state: SessionState }) {
  const { mode, dataSession, live } = state;
  if (mode === "live" || !dataSession) return null;
  const label = `${dataSession.name} · ${dataSession.meetingName}`;
  if (mode === "live-no-auth") {
    return (
      <p className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm text-amber-200">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>
          {live?.name} is live, but live timing needs an OpenF1 account (see README). Showing the latest completed
          session instead: <strong>{label}</strong>.
        </span>
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      No session running. Showing the latest completed session: <span className="text-foreground">{label}</span>
    </p>
  );
}

function ScheduleError({ message, onRetry, retrying }: { message?: string; onRetry: () => void; retrying: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">Couldn&apos;t load the F1 schedule</p>
          <p className="text-sm text-muted-foreground">{message ?? "Please try again in a moment."}</p>
        </div>
        <button
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          <RotateCw className={cn("size-3.5", retrying && "animate-spin")} /> Retry
        </button>
      </CardContent>
    </Card>
  );
}

export function EventHeaderSkeleton() {
  // Mirrors the real layout's height so the page doesn't jump on load.
  return (
    <Card>
      <CardContent className="space-y-4">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-12 w-full" />
      </CardContent>
    </Card>
  );
}

export function EventHeader() {
  const { state, now, error, isPending, refetch, isFetching, data } = useSessionState();

  if (isPending || (state === null && !error)) return <EventHeaderSkeleton />;

  if (!data || !state || now === null) {
    return <ScheduleError message={error?.message} onRetry={() => refetch()} retrying={isFetching} />;
  }

  const { live, next, headerMeeting } = state;
  const event = live ?? next ?? state.latestCompleted;

  // No sessions at all: if an upstream failed, say so (with a retry) rather
  // than pretending the calendar is empty.
  if (!event && data.warnings.length > 0) {
    return <ScheduleError message={data.warnings.join(" · ")} onRetry={() => refetch()} retrying={isFetching} />;
  }

  if (!event) {
    return (
      <Card>
        <CardContent>
          <p className="font-medium">No sessions found</p>
          <p className="text-sm text-muted-foreground">The schedule is empty right now. Try again later.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-5 overflow-hidden border-t-4 border-t-primary">
      <CardContent className="space-y-5">
        {/* Event title */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {event.countryFlag && <Flag src={event.countryFlag} country={event.countryName} />}
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-balance sm:text-2xl">{event.meetingName}</h1>
              <p className="text-sm text-muted-foreground">
                {event.circuit}
                {event.location && event.location !== event.circuit ? ` · ${event.location}` : ""} · {event.countryName}
              </p>
            </div>
          </div>
          {live ? <LiveBadge /> : next ? <Badge variant="secondary">UP NEXT</Badge> : null}
        </div>

        {/* Live session, or countdown to the next one */}
        <div className="grid gap-5 sm:grid-cols-2">
          {live && (
            <div className="space-y-1">
              <p className="text-xs font-semibold tracking-wider text-primary uppercase">Live now</p>
              <p className="text-2xl font-bold">{live.name}</p>
              <p className="text-sm text-muted-foreground">
                Started {formatTime(live.start)} · scheduled end {formatTime(live.end)}
                {live.estimatedEnd ? " (est.)" : ""}
              </p>
            </div>
          )}
          {next && (
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {live ? "Next session" : "Next session starts in"} · {next.name}
                {next.meetingId !== event.meetingId ? ` · ${next.meetingName}` : ""}
              </p>
              <Countdown target={next.start} now={now} />
              <SessionTimes session={next} />
            </div>
          )}
          {!live && !next && (
            <p className="text-sm text-muted-foreground">The season is over. See you next year!</p>
          )}
        </div>

        <WeekendSchedule sessions={headerMeeting} now={now} />

        <DataSourceNote state={state} />

        {data.warnings.length > 0 && (
          <ul className="space-y-1 text-xs text-amber-300/80">
            {data.warnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

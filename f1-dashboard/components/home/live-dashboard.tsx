"use client";

/**
 * Everything below the header on the Home page: timing tower, weather and
 * race control for the session picked by useSessionState() (the live one
 * when we can show it, otherwise the latest completed one).
 */
import { AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/hooks/use-now";
import { useSessionState } from "@/hooks/use-session-state";
import { isAuthError, useTiming } from "@/hooks/use-timing";
import { isRaceSession } from "@/lib/f1";
import { buildTower } from "@/lib/timing";
import { cn } from "@/lib/utils";
import { RaceControlFeed } from "./race-control-feed";
import { TimingTower, TimingTowerSkeleton } from "./timing-tower";
import { WeatherCard } from "./weather-card";

/** Responsive layout: tower on the left; weather and race control on the right (stacked on phones). */
function Layout({ tower, weather, raceControl }: Record<"tower" | "weather" | "raceControl", React.ReactNode>) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0">{tower}</div>
      <div className="space-y-4">
        {weather}
        {raceControl}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  const card = (body: React.ReactNode) => (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-28" />
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
  return (
    <Layout
      tower={card(<TimingTowerSkeleton />)}
      weather={card(<Skeleton className="h-40 w-full" />)}
      raceControl={card(<Skeleton className="h-80 w-full" />)}
    />
  );
}

/** "updated 3s ago" while live, so viewers can trust the numbers are fresh. */
function LiveStatus({ fetchedAt, failing }: { fetchedAt: number; failing: boolean }) {
  const now = useNow(1000);
  const ago = now === null ? 0 : Math.max(0, Math.round((now - fetchedAt) / 1000));
  return (
    <span className={cn("inline-flex items-center gap-1.5", failing && "text-amber-300")}>
      <span className={cn("size-1.5 rounded-full", failing ? "bg-amber-400" : "bg-primary motion-safe:animate-pulse")} />
      {failing ? `Reconnecting… (last update ${ago}s ago)` : `Live · updated ${ago}s ago`}
    </span>
  );
}

export function LiveDashboard() {
  const { state } = useSessionState();
  const wantLive = state?.mode === "live";
  const primary = useTiming(state?.dataSession?.sessionKey ?? null, wantLive);

  // If OpenF1 rejects our credentials for the live session (expired or
  // wrong key), fall back to the latest completed session, just as if no
  // key were configured. Hooks can't be called conditionally, so the
  // fallback query always exists but is disabled (null key) until needed.
  const authRejected = wantLive && isAuthError(primary.error);
  const fallbackSession = authRejected ? (state?.latestCompleted ?? null) : null;
  const fallback = useTiming(fallbackSession?.sessionKey ?? null, false);

  const timing = authRejected ? fallback : primary;
  const dataSession = authRejected ? fallbackSession : (state?.dataSession ?? null);
  const live = wantLive && !authRejected;

  // Recompute rows only when the merged data changes, not on every clock tick.
  const tower = useMemo(() => (timing.data ? buildTower(timing.data) : null), [timing.data]);

  // Render nothing until the header knows which session to show. The header's
  // final height varies (live vs next session, notes), so a skeleton here
  // would be pushed down when it resolves: a visible jump. Content that
  // appears below a settled header doesn't jump. The header also explains
  // "no schedule" errors, so there's nothing to add here either way.
  if (!state) return null;
  if (!dataSession) return null;

  if (timing.isPending) return <DashboardSkeleton />;

  if (!timing.data || !tower) {
    return (
      <ErrorState
        title={`Couldn't load timing for ${dataSession.name}`}
        error={timing.error}
        onRetry={() => timing.refetch()}
        retrying={timing.isFetching}
      />
    );
  }

  const status = live ? (
    <LiveStatus fetchedAt={timing.data.fetchedAt} failing={timing.isError} />
  ) : (
    <span>
      {dataSession.name} · {timing.data.live ? "in progress" : "final"}
    </span>
  );

  return (
    <div className="space-y-4">
      {authRejected && (
        <p className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            OpenF1 refused the configured credentials for live data. Check OPENF1_API_KEY or OPENF1_USERNAME /
            OPENF1_PASSWORD. Showing the latest completed session: <strong>{dataSession.name}</strong>.
          </span>
        </p>
      )}
      <Layout
        tower={
          <TimingTower
            rows={tower.rows}
            isRace={isRaceSession(timing.data.sessionName)}
            currentLap={tower.currentLap}
            status={status}
          />
        }
        weather={<WeatherCard weather={timing.data.weather} />}
        raceControl={<RaceControlFeed messages={timing.data.raceControl} />}
      />
    </div>
  );
}

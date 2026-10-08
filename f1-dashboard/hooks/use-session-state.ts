"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getJson } from "@/lib/api-client";
import { resolveSessionState, type SessionOverview, type SessionState } from "@/lib/session-state";
import { useNow } from "./use-now";

/**
 * The app-wide answer to "what's live, what's next, which session's data
 * do we show?". Re-evaluated every second from the cached session list,
 * so state changes happen on time without extra network requests.
 */
export function useSessionState() {
  const query = useQuery({
    queryKey: ["session-overview"],
    queryFn: ({ signal }) => getJson<SessionOverview>("/api/session/current", signal),
    // The schedule rarely changes; refresh once a minute to pick up delays.
    // TanStack Query pauses this interval while the tab is hidden.
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const now = useNow(1000);
  const overview = query.data;

  const state: SessionState | null = useMemo(
    () => (overview && now !== null ? resolveSessionState(overview.sessions, now, overview.hasLiveAuth) : null),
    [overview, now],
  );

  return { ...query, now, state };
}

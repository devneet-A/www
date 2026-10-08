"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClientApiError, getJson } from "@/lib/api-client";
import { RESYNC_AFTER_MS, mergeTiming, type TimingPayload, type TimingState } from "@/lib/timing";

/** Poll interval while live. OpenF1 itself updates intervals about every 4s. */
const POLL_MS = 4_500;

/**
 * Timing tower, race control and weather for one session.
 *
 * - `live` true: poll every 4.5s for small deltas and merge them in.
 *   TanStack Query pauses the interval while the tab is hidden; when the tab
 *   comes back, the first fetch is a full re-sync (the delta window has passed).
 * - `live` false: fetch once. Finished sessions don't change.
 */
export function useTiming(sessionKey: number | null, live: boolean) {
  const queryClient = useQueryClient();
  // `live` is part of the key so the moment a session ends we fetch one
  // final full snapshot instead of keeping the last delta-built state.
  const queryKey = ["timing", sessionKey, live] as const;

  return useQuery({
    queryKey,
    enabled: sessionKey !== null,
    queryFn: async ({ signal }) => {
      // The previous state lives in the query cache. We read it here to
      // decide between a cheap delta and a full re-sync.
      const prev = queryClient.getQueryData<TimingState>(queryKey) ?? null;
      const canDelta = live && prev !== null && Date.now() - prev.fetchedAt < RESYNC_AFTER_MS;
      const mode = canDelta ? "delta" : "full";
      const payload = await getJson<TimingPayload>(`/api/live/timing?session_key=${sessionKey}&mode=${mode}`, signal);
      return mergeTiming(canDelta ? prev : null, payload, Date.now());
    },
    // Stop polling if OpenF1 refuses our credentials: retrying every few
    // seconds won't fix a bad key, it would only burn rate limit.
    refetchInterval: (query) => (live && !isAuthError(query.state.error) ? POLL_MS : false),
    // While live, always willing to refetch; otherwise the data is final.
    staleTime: live ? 0 : Infinity,
    // Keep showing data while refetching after an error, instead of a blank.
    retry: live ? 0 : 1,
  });
}

/** True when the API said the data needs (valid) OpenF1 credentials. */
export function isAuthError(error: unknown): boolean {
  return error instanceof ClientApiError && error.authRequired;
}

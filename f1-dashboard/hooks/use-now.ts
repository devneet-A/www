"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The current time, re-rendering every `intervalMs`.
 *
 * Built on useSyncExternalStore, React's tool for reading values that live
 * outside React (here: the system clock). It returns null on the server
 * and while hydrating, because the server's "now" differs from the
 * browser's and would cause a hydration mismatch. Show a skeleton for null.
 */
export function useNow(intervalMs = 1000): number | null {
  const subscribe = useCallback(
    (onTick: () => void) => {
      let interval: ReturnType<typeof setInterval> | undefined;
      // Align ticks to whole intervals so a countdown changes in step with the clock.
      const timeout = setTimeout(() => {
        onTick();
        interval = setInterval(onTick, intervalMs);
      }, intervalMs - (Date.now() % intervalMs));
      return () => {
        clearTimeout(timeout);
        clearInterval(interval);
      };
    },
    [intervalMs],
  );

  // Must return the same value until the next tick (React compares snapshots),
  // so round down to the interval instead of returning Date.now() directly.
  const getSnapshot = useCallback(() => Math.floor(Date.now() / intervalMs) * intervalMs, [intervalMs]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const getServerSnapshot = () => null;

"use client";

/**
 * "You're offline" banner. TanStack Query already pauses requests while the
 * browser is offline and refetches when it reconnects; this just tells the
 * viewer that what they see is the last data received.
 */
import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function ConnectionBanner() {
  // Server snapshot: assume online (no banner flash during hydration).
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-200">
      <WifiOff className="mr-1.5 inline size-4 align-[-3px]" aria-hidden />
      You&apos;re offline. Showing the last data received; it will refresh when you reconnect.
    </div>
  );
}

"use client";

/**
 * Client-side providers. TanStack Query caches API responses in the browser,
 * de-duplicates identical requests and handles polling (refetchInterval).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  // useState so each browser tab gets exactly one QueryClient, created once.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Treat data as fresh for 30s by default; live queries override this.
            staleTime: 30_000,
            // One retry is enough: our API already shields us from upstream flakiness.
            retry: 1,
            // Polling pauses in hidden tabs. This is TanStack's default; written
            // out because the brief requires it.
            refetchIntervalInBackground: false,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

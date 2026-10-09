"use client";

/**
 * Safety net for unexpected rendering errors on any page (a bug, not an
 * API failure: those are handled by each component's ErrorState). Keeps the
 * site header and shows a way back instead of a blank screen.
 */
import Link from "next/link";
import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // Shows up in the browser console and in Vercel's logs.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-3 px-4 py-6">
      <ErrorState
        title="This page hit a problem"
        message={`Something unexpected went wrong while showing this page.${error.digest ? ` (ref ${error.digest})` : ""}`}
        onRetry={retry}
      />
      <Link href="/" className="text-sm text-muted-foreground underline">
        Back to live timing
      </Link>
    </main>
  );
}

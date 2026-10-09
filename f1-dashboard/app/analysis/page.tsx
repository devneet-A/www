import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalysisSkeleton, AnalysisView } from "@/components/analysis/analysis-view";

export const metadata: Metadata = { title: "Analysis · F1 Live Dashboard" };

/**
 * Charts for any session since 2023. The view reads its selection from the
 * URL (useSearchParams), which Next.js requires to sit inside <Suspense>:
 * the static page shell renders first, the selection-dependent part after.
 */
export default function AnalysisPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-4 sm:py-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Session analysis</h1>
        <p className="text-sm text-muted-foreground">Lap times, race trace, tyre strategy and telemetry for any session since 2023.</p>
      </header>
      <Suspense fallback={<AnalysisSkeleton />}>
        <AnalysisView />
      </Suspense>
    </main>
  );
}

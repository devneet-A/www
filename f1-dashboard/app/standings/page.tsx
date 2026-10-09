import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StandingsView } from "@/components/standings/standings-view";

export const metadata: Metadata = { title: "Standings · F1 Live Dashboard" };

export default function StandingsPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-4 sm:py-6">
      <header>
        <h1 className="text-2xl font-black tracking-tight italic sm:text-3xl">Championship standings</h1>
        <p className="text-sm text-muted-foreground">Drivers and constructors, with points after every round.</p>
      </header>
      {/* useSearchParams (season / view in the URL) needs a Suspense boundary. */}
      <Suspense fallback={<Skeleton className="h-[36rem] rounded-3xl" />}>
        <StandingsView />
      </Suspense>
    </main>
  );
}

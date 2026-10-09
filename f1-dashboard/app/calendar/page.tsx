import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarView } from "@/components/calendar/calendar-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Calendar · F1 Live Dashboard" };

export default function CalendarPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-4 sm:py-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Season calendar</h1>
        <p className="text-sm text-muted-foreground">Every session, in your timezone.</p>
      </header>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <CalendarView />
      </Suspense>
    </main>
  );
}

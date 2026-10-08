import { ApiStatus } from "@/components/api-status";

/**
 * Temporary home page for step 1: shows whether our API layer can reach
 * OpenF1 and Jolpica. Replaced by the live dashboard in step 2.
 */
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="text-primary">F1</span> Live Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">Step 1 · API connectivity check</p>
      </header>
      <ApiStatus />
    </main>
  );
}

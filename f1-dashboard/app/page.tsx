import { EventHeader } from "@/components/home/event-header";

/**
 * Home / Live page. Everything below the header follows the session chosen
 * by useSessionState(): the live one when we can show it, otherwise the
 * latest completed session. Timing tower, race control and weather: step 3.
 */
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-4 sm:py-6">
      <EventHeader />
    </main>
  );
}

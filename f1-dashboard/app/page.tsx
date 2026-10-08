import { EventHeader } from "@/components/home/event-header";
import { LiveDashboard } from "@/components/home/live-dashboard";

/**
 * Home / Live page. The header decides which session we're showing
 * (useSessionState), and the dashboard below follows it: live data with
 * polling during a session, otherwise the latest completed session.
 */
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-4 sm:py-6">
      <EventHeader />
      <LiveDashboard />
    </main>
  );
}
